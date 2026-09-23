"""AI Sana API. Python 3.11+. Run: python -m uvicorn main:app --reload."""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import ai_service
import scoring
from schemas import BuildCardRequest, BuildCardResponse, ClarifyRequest, ClarifyResponse

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


@app.post("/api/ai/clarify", response_model=ClarifyResponse)
async def clarify(request: ClarifyRequest) -> ClarifyResponse:
    return ClarifyResponse(
        questions=await ai_service.generate_clarifying_questions(request.draft_text)
    )


@app.post("/api/ai/build-card", response_model=BuildCardResponse)
async def build_card(request: BuildCardRequest) -> BuildCardResponse:
    card = await ai_service.build_task_card(request.draft_text, request.qa_pairs)
    return BuildCardResponse(card=card, scoring=scoring.calculate_score(card))
