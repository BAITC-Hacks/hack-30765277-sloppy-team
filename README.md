# hack-30765277-sloppy-team
Hackathon team repository for Sloppy-team

## AI & Business Core

Python 3.11+, FastAPI, Pydantic v2, OpenAI `gpt-4o` Structured Outputs.

Запуск в PowerShell из корня проекта:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:OPENAI_API_KEY = "ваш-ключ"
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Swagger UI: http://127.0.0.1:8000/docs

- `POST /api/ai/clarify`: `{"draft_text":"Нужен анализ продаж магазина"}`
- `POST /api/ai/build-card`: `{"draft_text":"Нужен анализ продаж магазина","qa_pairs":[]}`

Ключ читается из переменной окружения; `.env` автоматически не загружается.
Без ключа сервер запускается, но AI-маршруты возвращают 503.
CORS разрешает все origins для локальной разработки.

Скоринг: менее 10 символов — 0; от 10 до 29 — половина с округлением
вниз; от 30 — максимум. Пробелы по краям не учитываются. Контакты и формат
взаимодействия оцениваются отдельно, по 5 баллов каждый, и суммируются в
`business_connection`. Подсказки показывают оставшиеся возможные баллы.

Тесты не требуют ключа и не отправляют запросов в OpenAI. Используется настоящий
SDK с подставным HTTP-транспортом: проверяются маршруты, ошибки, CORS, схемы,
границы скоринга и 6561 комбинация заполнения полей.

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```
