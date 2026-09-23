"""Run explicitly: python smoke_openai.py. Makes two billable OpenAI requests."""

import asyncio
import sys

from ai_service import AIServiceError, build_task_card, generate_clarifying_questions, get_mode
from schemas import AnswerItem
from scoring import calculate_score


async def main() -> None:
    if get_mode() != "openai":
        raise AIServiceError("Для проверки настоящего ИИ установите AI_MODE=openai.", 503)
    draft = ("Небольшой кофейне нужен отчёт по продажам из обезличенной таблицы. "
             "Результат — дашборд, в котором суммы должны совпадать с исходной таблицей.")
    questions = await generate_clarifying_questions(draft)
    assert len(questions) == 3 and len(set(questions)) == 3
    card = await build_task_card(draft, [AnswerItem(question=q, answer="Пока неизвестно") for q in questions])
    # This synthetic input deliberately provides neither a contact nor a deadline.
    assert card.contacts is None, "ИИ придумал контакт: проверьте промпт и результат."
    assert card.constraints is None, "ИИ придумал ограничения: проверьте результат."
    assert card.success_criteria, "ИИ пропустил явно указанное условие приёмки."
    result = calculate_score(card)
    print(f"OpenAI gpt-4o: OK; questions={len(questions)}; score={result.score}; status={result.status}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (AIServiceError, AssertionError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
