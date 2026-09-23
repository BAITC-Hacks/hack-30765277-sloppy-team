import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyCard, safeUrl, seedTasks, normalizeCard, toBackendCard, fromBackendCard } from '../lib/domain';
import { cardInput, object } from '../lib/validation';
import { scoringResponse } from '../lib/backend-client';
test('card adapter preserves all scoring fields and missing values', () => {
    const card = { ...emptyCard, title: 'Task', context: 'Need', data: 'Materials', criteria: 'Measurable success', expected_result: 'Result', target_audience: 'Users', interaction_format: 'Weekly feedback' };
    assert.deepEqual(fromBackendCard(toBackendCard(card)), card);
    assert.equal(toBackendCard(emptyCard).contacts, null);
    assert.equal(normalizeCard({ title: 'Legacy task' }).expected_result, '');
});
test('links reject executable schemes and input types are validated', () => {
    assert.equal(safeUrl('javascript:alert(1)'), null);
    assert.equal(safeUrl('data:text/html,hello'), null);
    assert.equal(safeUrl('https://example.com'), 'https://example.com/');
    for (const value of [null, [], 42, 'text'])
        assert.throws(() => object(value));
    assert.throws(() => cardInput({ ...emptyCard, title: 4 }));
    assert.throws(() => cardInput({ ...emptyCard, links: 'javascript:alert(1)' }));
    assert.throws(() => cardInput({ ...emptyCard, context: 'x'.repeat(20001) }));
});
test('malformed upstream scoring cannot enter catalog', () => {
    for (const value of [null, {}, { score: 101 }, { score: 20, status: 'READY', breakdown: {}, missing_fields: [] }])
        assert.throws(() => scoringResponse(value));
});
test('legacy seed cards can be adapted without modifying storage', () => {
    assert.ok(seedTasks().length >= 5);
    for (const task of seedTasks())
        assert.doesNotThrow(() => cardInput(normalizeCard(task.card_data)));
});
