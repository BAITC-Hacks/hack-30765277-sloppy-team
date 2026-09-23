"""Pydantic v2 contracts for AI Sana."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

NonEmptyText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
DraftText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20000)]


class Schema(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ClarifyRequest(Schema):
    draft_text: DraftText


class ClarifyResponse(Schema):
    questions: list[NonEmptyText] = Field(min_length=3, max_length=3)


class AnswerItem(Schema):
    question: NonEmptyText = Field(max_length=2000)
    answer: str = Field(max_length=10000)


class BuildCardRequest(Schema):
    draft_text: DraftText
    qa_pairs: list[AnswerItem] = Field(max_length=20)


class TaskCard(Schema):
    title: NonEmptyText = Field(description="Название задачи без вымышленных фактов")
    context: str | None = Field(default=None, description="Контекст и потребность")
    data_materials: str | None = Field(default=None, description="Данные и материалы")
    expected_result: str | None = Field(default=None, description="Ожидаемый результат")
    success_criteria: str | None = Field(default=None, description="Критерии успеха")
    constraints: str | None = Field(default=None, description="Ограничения")
    target_audience: str | None = Field(default=None, description="Пользователи / ЦА")
    contacts: str | None = Field(default=None, description="Контактное лицо")
    interaction_format: str | None = Field(default=None, description="Формат консультаций и обратной связи")


class ScoringResult(Schema):
    score: int = Field(ge=0, le=100)
    status: Literal["DRAFT", "WORKING", "READY", "PRIORITY"]
    breakdown: dict[str, int]
    missing_fields: list[str]


class BuildCardResponse(Schema):
    card: TaskCard
    scoring: ScoringResult
