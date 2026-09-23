"""Offline integration tests: real OpenAI SDK with a mocked HTTP transport."""

import itertools
import json
import os
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from openai import AsyncOpenAI
from pydantic import ValidationError

import ai_service
from main import app
from schemas import ClarifyResponse, TaskCard
from scoring import _field_score, _status, calculate_score


class ScoringTests(unittest.TestCase):
    def test_boundaries(self):
        for maximum in (5, 10, 15, 20):
            for length, expected in ((0, 0), (9, 0), (10, maximum // 2),
                                     (29, maximum // 2), (30, maximum), (31, maximum)):
                self.assertEqual(_field_score(" " + "x" * length + " ", maximum), expected)
            self.assertEqual(_field_score(None, maximum), 0)
        for score, expected in ((0, "DRAFT"), (39, "DRAFT"), (40, "WORKING"),
                                (69, "WORKING"), (70, "READY"), (89, "READY"),
                                (90, "PRIORITY"), (100, "PRIORITY")):
            self.assertEqual(_status(score), expected)

    def test_all_6561_combinations(self):
        fields = list(TaskCard.model_fields)[1:]
        for values in itertools.product((None, "x" * 10, "x" * 30), repeat=8):
            result = calculate_score(TaskCard(title="Task", **dict(zip(fields, values))))
            self.assertTrue(0 <= result.score <= 100)
            self.assertEqual(result.score, sum(result.breakdown.values()))
            self.assertEqual(len(result.breakdown), 7)

    def test_empty_full_and_partial(self):
        empty = calculate_score(TaskCard(title="Task"))
        self.assertEqual(empty.score, 0)
        self.assertEqual(len(empty.missing_fields), 7)
        fields = list(TaskCard.model_fields)[1:]
        full = calculate_score(TaskCard(title="Task", **dict.fromkeys(fields, "x" * 30)))
        self.assertEqual(full.score, 100)
        self.assertEqual(full.missing_fields, [])
        self.assertEqual(calculate_score(TaskCard(title="Task", contacts="x" * 30)).score, 5)
        partial = calculate_score(TaskCard(title="Task", expected_result="x" * 10))
        self.assertIn("+8", partial.missing_fields[2])

    def test_exactly_three_nonempty_questions(self):
        for questions in ([], ["a", "b"], ["a", "b", "c", "d"], ["a", "b", " "]):
            with self.assertRaises(ValidationError):
                ClarifyResponse(questions=questions)


class APITests(unittest.TestCase):
    def setUp(self):
        self.mode = "ok"
        self.calls = []
        self.enterContext(patch.dict(os.environ, {"OPENAI_API_KEY": "fake-test-key", "AI_MODE": "openai"}))
        self.enterContext(patch.object(ai_service, "AsyncOpenAI", self.client_factory))
        self.client = self.enterContext(TestClient(app))

    def client_factory(self, **kwargs):
        kwargs["max_retries"] = 0
        return AsyncOpenAI(
            **kwargs, http_client=httpx.AsyncClient(transport=httpx.MockTransport(self.transport))
        )

    async def transport(self, request):
        data = json.loads(request.content)
        self.calls.append(data)
        self.assertEqual(data["model"], "gpt-4o")
        fmt = data["response_format"]["json_schema"]
        self.assertTrue(fmt["strict"])
        schema = fmt["schema"]
        self.assertEqual(set(schema["required"]), set(schema["properties"]))
        if isinstance(self.mode, int):
            return httpx.Response(self.mode, json={"error": {"message": "PRIVATE ERROR", "type": "server_error"}})
        if self.mode == "timeout":
            raise httpx.ReadTimeout("secret", request=request)
        if self.mode == "connection":
            raise httpx.ConnectError("secret", request=request)
        content = (
            {"questions": ["What data?", "What result?", "What deadline?"]}
            if "questions" in schema["properties"] else TaskCard(title="Task").model_dump()
        )
        if self.mode == "invalid":
            content = {"questions": ["Only one?"]}
        message = {"role": "assistant", "content": json.dumps(content)}
        if self.mode == "refusal":
            message = {"role": "assistant", "content": None, "refusal": "PRIVATE REFUSAL"}
        finish = self.mode if self.mode in ("length", "content_filter") else "stop"
        choices = [{"index": 0, "finish_reason": finish, "message": message}]
        return httpx.Response(200, json={
            "id": "test", "created": 0, "model": "gpt-4o", "object": "chat.completion",
            "choices": [] if self.mode == "empty" else choices,
        })

    def test_successful_routes(self):
        response = self.client.post("/api/ai/clarify", json={"draft_text": "Help my shop"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(response.json()["questions"]), 3)
        response = self.client.post("/api/ai/build-card", json={
            "draft_text": "Help my shop", "qa_pairs": [{"question": "Data?", "answer": ""}],
        })
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIsNone(response.json()["card"]["context"])
        self.assertEqual(response.json()["scoring"]["score"], 0)
        payload = json.loads(self.calls[-1]["messages"][1]["content"])
        self.assertEqual(payload["qa_pairs"][0]["answer"], "")

    def test_validation(self):
        for body in ({"draft_text": " "}, {"draft_text": 123}, {"draft_text": "x" * 20001}):
            self.assertEqual(self.client.post("/api/ai/clarify", json=body).status_code, 422)
        response = self.client.post("/api/ai/build-card", json={
            "draft_text": "Task", "qa_pairs": [{"question": "?", "answer": None}],
        })
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.calls, [])

    def test_cors(self):
        response = self.client.options("/api/ai/clarify", headers={
            "Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["access-control-allow-origin"], "*")

    def test_provider_failures(self):
        for mode, expected in (("invalid", 502), ("refusal", 422), ("length", 502),
                               ("content_filter", 422), ("empty", 502), ("timeout", 504),
                               ("connection", 503), (429, 503), (401, 503), (403, 503),
                               (500, 503), (400, 502)):
            with self.subTest(mode=mode):
                self.mode = mode
                response = self.client.post("/api/ai/clarify", json={"draft_text": "Task"},
                                            headers={"Origin": "http://localhost:3000"})
                self.assertEqual(response.status_code, expected, response.text)
                self.assertNotIn("PRIVATE", response.text)
                self.assertNotIn("secret", response.text)
                self.assertEqual(response.headers["access-control-allow-origin"], "*")

    def test_missing_key(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
            response = self.client.post("/api/ai/clarify", json={"draft_text": "Task"})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.calls, [])

    def test_score_endpoint_without_ai(self):
        response = self.client.post('/api/ai/score', json={"title": "Task", "context": "x" * 30})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["score"], 20)
        self.assertEqual(response.json()["status"], "DRAFT")
        self.assertEqual(self.calls, [])
        self.assertEqual(self.client.post('/api/ai/score', json={"title": "Task", "context": "x" * 20001}).status_code, 422)

    def test_demo_does_not_invent_missing_details(self):
        with patch.dict(os.environ, {"AI_MODE": "demo", "OPENAI_API_KEY": ""}):
            health = self.client.get('/health')
            self.assertEqual(health.json()["ai_mode"], "demo")
            questions = self.client.post('/api/ai/clarify', json={"draft_text": "Нужен отчёт"}).json()["questions"]
            response = self.client.post('/api/ai/build-card', json={"draft_text": "Нужен отчёт", "qa_pairs": [
                {"question": questions[0], "answer": ""},
                {"question": "Выдуманный контакт?", "answer": "Не переносить в контакты"},
            ]})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["mode"], "demo")
            self.assertIsNone(response.json()["card"]["contacts"])
            self.assertIsNone(response.json()["card"]["expected_result"])
        self.assertEqual(self.calls, [])

    def test_invalid_mode_is_reported(self):
        with patch.dict(os.environ, {"AI_MODE": "invalid"}):
            self.assertEqual(self.client.get('/health').status_code, 503)


if __name__ == "__main__":
    unittest.main()
