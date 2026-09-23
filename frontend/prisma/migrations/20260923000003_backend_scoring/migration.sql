-- Recalculate derived fields using the scoring rules introduced by the backend.
-- This migration is separate so the DRAFT enum value is committed before use.
WITH scores AS (
    SELECT task."id", SUM(CASE
        WHEN char_length(btrim(field.content)) < 10 THEN 0
        WHEN char_length(btrim(field.content)) < 30 THEN field.weight / 2
        ELSE field.weight
    END)::INTEGER AS score
    FROM "Task" AS task
    CROSS JOIN LATERAL (VALUES
        (task."context", 20),
        (task."data", 20),
        (task."expected_result", 15),
        (task."criteria", 15),
        (task."constraints", 10),
        (task."target_audience", 10),
        (task."contacts", 5),
        (task."interaction_format", 5)
    ) AS field(content, weight)
    GROUP BY task."id"
)
UPDATE "Task" AS task
SET "score" = scores.score,
    "status" = (CASE
        WHEN scores.score >= 90 THEN 'PRIORITY'
        WHEN scores.score >= 70 THEN 'READY'
        WHEN scores.score >= 40 THEN 'WORKING'
        ELSE 'DRAFT'
    END)::"TaskStatus"
FROM scores WHERE task."id" = scores."id";
