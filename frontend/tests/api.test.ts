import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { NextRequest } from 'next/server';
import { emptyCard } from '../lib/domain';
async function freePort(): Promise<number> {
    const server = createServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    await new Promise<void>(resolve => server.close(() => resolve()));
    return port;
}
test('pilot: Next routes + real Python backend, isolated existing demo store', async (t) => {
    const original = process.cwd();
    const root = path.resolve(original, '..');
    const suffix = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
    const python = process.env.PYTHON || [path.join(root, 'backend/.venv', suffix), path.join(root, '.venv', suffix)].find(existsSync) || 'python';
    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    const previousUrl = process.env.BACKEND_URL;
    process.env.BACKEND_URL = base;
    const server = spawn(python, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(port)], { cwd: path.join(root, 'backend'), env: { ...process.env, AI_MODE: 'demo', OPENAI_API_KEY: '' }, stdio: 'ignore' });
    const exited = new Promise<void>(resolve => server.once('exit', () => resolve()));
    let spawnError: Error | undefined;
    server.once('error', error => { spawnError = error; });
    const directory = await mkdtemp(path.join(original, '.test-data-'));
    try {
        let ready = false;
        for (let i = 0; i < 80; i++) {
            if (spawnError)
                throw spawnError;
            try {
                if ((await fetch(base + '/health')).ok) {
                    ready = true;
                    break;
                }
            }
            catch { }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.ok(ready, 'Python backend did not start');
        process.chdir(directory);
        const { GET, POST, PATCH } = await import('../app/api/[...path]/route');
        const req = (url: string, method: string, body?: unknown) => new NextRequest('http://localhost' + url, { method, ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
        let taskId = '';
        await t.test('draft -> three questions -> faithful editable card', async () => {
            const draft = 'Нужно разобраться в продажах';
            const r = await POST(req('/api/ai/clarify', 'POST', { draft_text: draft }));
            assert.equal(r.status, 200);
            const clarify = await r.json();
            assert.equal(clarify.questions.length, 3);
            assert.equal(clarify.mode, 'demo');
            const answers = ['Дашборд продаж с фильтрами по дням и товарам', 'Обезличенные таблицы продаж за последние шесть месяцев', 'Суммы в отчёте совпадают с исходными таблицами'];
            const built = await POST(req('/api/ai/build-card', 'POST', { draft_text: draft, qa_pairs: clarify.questions.map((question: string, i: number) => ({ question, answer: answers[i] })) }));
            assert.equal(built.status, 200);
            const result = await built.json();
            assert.equal(result.card_data.expected_result, answers[0]);
            assert.equal(result.card_data.criteria, answers[2]);
            assert.equal(result.card_data.contacts, '');
            assert.equal(result.scoring.score, 60);
        });
        await t.test('confirmation required; low score publication and server authority', async () => {
            const card_data = { ...emptyCard, title: 'Pilot task', context: 'Нужен отчёт' };
            assert.equal((await POST(req('/api/tasks', 'POST', { card_data }))).status, 422);
            const response = await POST(req('/api/tasks', 'POST', { card_data, confirmed: true, score: 100 }));
            assert.equal(response.status, 201);
            const task = await response.json();
            taskId = task.id;
            assert.equal(task.score, 10);
            assert.equal(task.status, 'DRAFT');
            const catalog = await (await GET(req('/api/tasks', 'GET'))).json();
            assert.ok(catalog.some((x: {
                id: string;
            }) => x.id === taskId));
            assert.ok(catalog.every((x: {
                score: number;
            }, i: number) => i === 0 || catalog[i - 1].score >= x.score));
        });
        await t.test('confirmed edit recomputes all seven criteria and catalog ranking', async () => {
            const card_data = { ...emptyCard, title: 'Pilot task', ...Object.fromEntries(['context', 'data', 'expected_result', 'criteria', 'constraints', 'target_audience', 'contacts', 'interaction_format'].map(k => [k, 'Подробное подтверждённое описание длиной более тридцати символов'])) };
            const response = await PATCH(req('/api/tasks/' + taskId, 'PATCH', { card_data, confirmed: true }));
            assert.equal(response.status, 200);
            assert.equal((await response.json()).score, 100);
            const catalog = await (await GET(req('/api/tasks', 'GET'))).json();
            assert.equal(catalog[0].id, taskId);
        });
        await t.test('multiple manual selections, decline, late response and idempotent retry', async () => {
            const ids: string[] = [];
            const submit = (team_name: string) => POST(req('/api/applications', 'POST', { task_id: taskId, team_name, idea: 'Prototype', plan: 'Research and build', deadline: '4 weeks' }));
            for (const name of ['One', 'Two', 'Three']) {
                const r = await submit(name);
                assert.equal(r.status, 201);
                ids.push((await r.json()).id);
            }
            for (const id of ids.slice(0, 2))
                assert.equal((await PATCH(req('/api/applications/' + id + '/status', 'PATCH', { status: 'ACCEPTED' }))).status, 200);
            assert.equal((await PATCH(req('/api/applications/' + ids[2] + '/status', 'PATCH', { status: 'REJECTED' }))).status, 200);
            assert.equal((await PATCH(req('/api/applications/' + ids[0] + '/status', 'PATCH', { status: 'ACCEPTED' }))).status, 200);
            assert.equal((await PATCH(req('/api/applications/' + ids[0] + '/status', 'PATCH', { status: 'REJECTED' }))).status, 409);
            assert.equal((await submit('Late team')).status, 201);
            const apps = await (await GET(req('/api/tasks/' + taskId + '/applications', 'GET'))).json();
            assert.equal(apps.filter((a: {
                status: string;
            }) => a.status === 'ACCEPTED').length, 2);
        });
        await t.test('invalid JSON, null, wrong types, missing task and unsafe links', async () => {
            for (const value of [null, [], 42, { draft_text: 7 }, { draft_text: ' ' }, { draft_text: 'x'.repeat(20001) }]) {
                assert.ok([400, 422].includes((await POST(req('/api/ai/clarify', 'POST', value))).status));
            }
            const bad = new NextRequest('http://localhost/api/ai/clarify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
            assert.equal((await POST(bad)).status, 400);
            assert.equal((await POST(req('/api/ai/clarify', 'POST', { draft_text: 'x'.repeat(512001) }))).status, 413);
            const wrongType = new NextRequest('http://localhost/api/ai/clarify', { method: 'POST', body: 'text' });
            assert.equal((await POST(wrongType)).status, 415);
            assert.equal((await GET(req('/api/tasks/missing', 'GET'))).status, 404);
            assert.equal((await POST(req('/api/applications', 'POST', { task_id: taskId, team_name: 'Unsafe', idea: 'Idea', plan: 'Plan', deadline: '1 week', prototype: 'javascript:alert(1)' }))).status, 422);
            assert.equal((await PATCH(req('/api/applications/missing/status', 'PATCH', { status: 'ACCEPTED' }))).status, 404);
        });
        await t.test('broken upstream replies and connection failures have public errors', async () => {
            const originalFetch = globalThis.fetch;
            try {
                globalThis.fetch = async () => new Response('<html>bad gateway</html>', { status: 502 });
                assert.equal((await POST(req('/api/ai/clarify', 'POST', { draft_text: 'Task' }))).status, 502);
                globalThis.fetch = async () => new Response(JSON.stringify({ questions: ['One'], mode: 'demo' }));
                assert.equal((await POST(req('/api/ai/clarify', 'POST', { draft_text: 'Task' }))).status, 502);
                globalThis.fetch = async () => new Response('null');
                assert.equal((await POST(req('/api/ai/clarify', 'POST', { draft_text: 'Task' }))).status, 502);
                globalThis.fetch = async () => { throw new DOMException('Timeout', 'TimeoutError'); };
                assert.equal((await POST(req('/api/ai/clarify', 'POST', { draft_text: 'Task' }))).status, 504);
                globalThis.fetch = async () => { throw new TypeError('PRIVATE CONNECTION DETAILS'); };
                const response = await GET(req('/api/tasks', 'GET'));
                assert.equal(response.status, 503);
                assert.ok(!(await response.text()).includes('PRIVATE'));
            }
            finally {
                globalThis.fetch = originalFetch;
            }
        });
        await t.test('storage failure returns sanitized 500 without overwriting data', async () => {
            await mkdir('.data', { recursive: true });
            await writeFile('.data/store.json', '{broken');
            const response = await GET(req('/api/tasks', 'GET'));
            // Storage syntax errors must not masquerade as client JSON errors.
            assert.equal(response.status, 500);
        });
    }
    finally {
        process.chdir(original);
        if (previousUrl === undefined)
            delete process.env.BACKEND_URL;
        else
            process.env.BACKEND_URL = previousUrl;
        server.kill();
        await exited;
        const resolved = path.resolve(directory);
        assert.ok(resolved.startsWith(path.resolve(original) + path.sep + '.test-data-'));
        await rm(resolved, { recursive: true, force: true });
    }
});
