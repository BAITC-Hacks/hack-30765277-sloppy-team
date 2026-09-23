"""AI Sana API. Python 3.11+. Run: python -m uvicorn main:app --reload."""

import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import ai_service
import scoring
from schemas import BuildCardRequest, BuildCardResponse, ClarifyRequest, ClarifyResponse, TaskCard, ScoringResult

app = FastAPI(title="AI Sana — Business Core", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["POST"],
    allow_headers=["*"],
)


@app.exception_handler(ai_service.AIServiceError)
async def ai_error_handler(request: Request, exc: ai_service.AIServiceError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": str(exc)})


class ClarifyAPIResponse(ClarifyResponse):
    mode: str


class BuildAPIResponse(BuildCardResponse):
    mode: str


@app.get("/health")
async def health() -> dict:
    mode = ai_service.get_mode()
    return {"status": "ok", "ai_mode": mode,
            "ai_configured": mode == "demo" or bool(os.environ.get("OPENAI_API_KEY", "").strip())}


@app.post("/api/ai/clarify", response_model=ClarifyAPIResponse)
async def clarify(request: ClarifyRequest) -> ClarifyAPIResponse:
    return ClarifyAPIResponse(
        questions=await ai_service.generate_clarifying_questions(request.draft_text),
        mode=ai_service.get_mode(),
    )


@app.post("/api/ai/build-card", response_model=BuildAPIResponse)
async def build_card(request: BuildCardRequest) -> BuildAPIResponse:
    card = await ai_service.build_task_card(request.draft_text, request.qa_pairs)
    return BuildAPIResponse(card=card, scoring=scoring.calculate_score(card), mode=ai_service.get_mode())


@app.post("/api/ai/score", response_model=ScoringResult)
async def score_card(card: TaskCard) -> ScoringResult:
    """One authoritative formula for editing, publication and the catalog."""
    return scoring.calculate_score(card)
