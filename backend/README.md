# AI Sana — Python backend

Python 3.11+, FastAPI, Pydantic v2, OpenAI gpt-4o Structured Outputs.

Запускайте из папки `backend`:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:AI_MODE = "demo"
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

В `AI_MODE=demo` используются три фиксированных вопроса и копирование известных
ответов; остальные поля остаются null. В `AI_MODE=openai` нужен `OPENAI_API_KEY`
в окружении. Если AI_MODE не задан, используется openai. `.env` автоматически
не загружается, отсутствующий ключ даёт 503 только на AI-операциях.

- GET `/health` — состояние сервиса и режим AI.
- POST `/api/ai/clarify` — draft_text → questions (строго три) и mode.
- POST `/api/ai/build-card` — draft_text и qa_pairs → card, scoring и mode.
- POST `/api/ai/score` — TaskCard → ScoringResult; не требует OpenAI и ключа.

Swagger: http://127.0.0.1:8000/docs. CORS `*` оставлен для локальной разработки.
Для опубликованной среды следует ограничить origins отдельно.

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Тесты не делают платных вызовов: транспорт OpenAI подставной. Проверяются реальные
схемы и SDK, ошибки провайдера, явный деморежим, endpoint рейтинга, границы и 6561
комбинация заполнения. Подробности: [архитектура](../ARCHITECTURE.md),
[пилот для бизнеса и студентов](../PILOT_GUIDE.md).
