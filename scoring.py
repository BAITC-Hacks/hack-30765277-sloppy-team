"""Pure deterministic scoring, without AI calls or side effects."""

from schemas import ScoringResult, TaskCard

CRITERIA = (
    ("context", "Контекст и потребность", 20),
    ("data_materials", "Данные и материалы", 20),
    ("expected_result", "Ожидаемый результат", 15),
    ("success_criteria", "Критерии успеха", 15),
    ("constraints", "Ограничения", 10),
    ("target_audience", "Пользователи / ЦА", 10),
)


def _field_score(value: str | None, maximum: int) -> int:
    """Trim whitespace; round half points down (15 -> 7)."""
    length = len(value.strip()) if value is not None else 0
    if length < 10:
        return 0
    return maximum if length >= 30 else maximum // 2


def _status(score: int) -> str:
    if score < 40:
        return "DRAFT"
    if score < 70:
        return "WORKING"
    if score < 90:
        return "READY"
    return "PRIORITY"


def calculate_score(card: TaskCard) -> ScoringResult:
    """Score seven criteria; contacts and interaction are worth five each.

    Length is the specification's proxy for quality, not semantic analysis.
    Recommendations show the remaining achievable points.
    """
    breakdown: dict[str, int] = {}
    missing_fields: list[str] = []
    for field, label, maximum in CRITERIA:
        earned = _field_score(getattr(card, field), maximum)
        breakdown[field] = earned
        if earned < maximum:
            missing_fields.append(
                f"Заполните '{label}', чтобы получить до +{maximum - earned} баллов"
            )
    business_score = _field_score(card.contacts, 5) + _field_score(card.interaction_format, 5)
    breakdown["business_connection"] = business_score
    if business_score < 10:
        missing_fields.append(
            "Заполните 'Связь с бизнесом (контактное лицо и формат взаимодействия)', "
            f"чтобы получить до +{10 - business_score} баллов"
        )
    score = sum(breakdown.values())
    return ScoringResult(
        score=score, status=_status(score), breakdown=breakdown, missing_fields=missing_fields
    )
