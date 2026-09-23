import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { NextRequest } from 'next/server';
import { emptyCard, seedTasks, scoreCard, type Application, type Task } from '../lib/domain';
import { getPrisma } from '../lib/prisma';
import { GET, POST, PATCH } from '../app/api/[...path]/route';

const req = (url: string, method = 'GET', body?: unknown, cookie?: string) => new NextRequest('http://localhost' + url, {
  method,
  headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

const card = {
  ...emptyCard, title: 'Integration task', company: 'Example', context: 'A useful business problem with enough detail',
  expected_result: 'A working prototype that solves the problem',
  target_audience: 'Students and businesses participating in the project',
  interaction_format: 'Weekly video calls and asynchronous feedback',
};

test('AI proxy contract, scoring, validation and anonymous access', async () => {
  const originalFetch = global.fetch;
  const calls: unknown[] = [];
  global.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)));
    if (String(url).endsWith('/clarify')) return Response.json({ questions: ['Q1', 'Q2', 'Q3'] });
    return Response.json({
      card: { title: 'Generated', context: 'A long business context describing the task', data_materials: null,
        expected_result: null, success_criteria: null, constraints: null, target_audience: null, contacts: null, interaction_format: null },
      scoring: { score: 20, status: 'DRAFT', breakdown: {}, missing_fields: [] },
    });
  }) as typeof fetch;
  try {
    const clarified = await POST(req('/api/ai/clarify', 'POST', { draft_text: 'A detailed business problem text' }));
    assert.deepEqual((await clarified.json()).questions, ['Q1', 'Q2', 'Q3']);
    const qa_pairs = ['Q1', 'Q2', 'Q3'].map(question => ({ question, answer: 'Detailed answer' }));
    const built = await POST(req('/api/ai/build-card', 'POST', { draft_text: 'A detailed business problem text', qa_pairs }));
    const data = await built.json();
    assert.equal(data.card_data.context, 'A long business context describing the task');
    assert.equal(data.card_data.expected_result, '');
    assert.equal(data.scoring.status, 'DRAFT');
    assert.deepEqual(calls[1], { draft_text: 'A detailed business problem text', qa_pairs });
    global.fetch = (async () => Response.json({ detail: 'Backend unavailable' }, { status: 503 })) as typeof fetch;
    assert.equal((await POST(req('/api/ai/clarify', 'POST', { draft_text: 'A detailed business problem text' }))).status, 503);
  } finally {
    global.fetch = originalFetch;
  }
  const scored = await POST(req('/api/tasks/score', 'POST', { card_data: card }));
  assert.deepEqual(await scored.json(), { score: 50, status: 'WORKING' });
  assert.equal((await POST(req('/api/tasks', 'POST', { card_data: card }))).status, 401);
  assert.equal((await POST(req('/api/applications', 'POST', {}))).status, 401);
  assert.equal((await PATCH(req('/api/applications/missing/status', 'PATCH', { status: 'ACCEPTED' }))).status, 401);
  assert.equal((await GET(req('/api/my-tasks'))).status, 401);
  assert.deepEqual(await (await GET(req('/api/auth/me'))).json(), { user: null });
  assert.equal((await POST(req('/api/tasks', 'POST', null))).status, 400);
  assert.equal((await POST(req('/api/ai/build-card', 'POST', { draft: 'Old contract', answers: [] }))).status, 400);
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test('PostgreSQL upgrade, seed, sessions, ownership and concurrent decisions', {
  skip: !testDatabaseUrl && 'Set TEST_DATABASE_URL to run PostgreSQL integration tests (see README).',
}, async t => {
  // All writes and cleanup are confined to a unique test schema, never the user's public schema.
  const schema = 'test_' + randomUUID().replaceAll('-', '');
  const databaseUrl = new URL(testDatabaseUrl!);
  databaseUrl.searchParams.set('schema', schema);
  const originalUrl = process.env.DATABASE_URL;
  const originalSecret = process.env.SESSION_SECRET;
  process.env.DATABASE_URL = databaseUrl.toString();
  process.env.SESSION_SECRET = randomBytes(32).toString('hex');
  const admin = new Client({ connectionString: testDatabaseUrl });
  await admin.connect();
  const prismaCli = path.resolve('node_modules/prisma/build/index.js');
  const cli = (...args: string[]) => execFileSync(process.execPath, [prismaCli, ...args], { env: process.env, stdio: 'pipe' });
  let ownerCookie = '';
  let applicantCookie = '';
  let ownerId = '';

  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`SET search_path TO "${schema}"`);
    // Start with the original migrations and actual rows, then upgrade in place.
    for (const migration of ['20260923000000_init', '20260923000001_one_accepted_team']) {
      await admin.query(readFileSync(path.resolve('prisma/migrations', migration, 'migration.sql'), 'utf8'));
      cli('migrate', 'resolve', '--applied', migration);
    }
    await admin.query(`INSERT INTO "Task" ("id", "title", "company", "category", "context", "data", "constraints", "criteria", "contacts", "links", "score", "status", "createdAt")
      VALUES ('legacy-task', 'Preserved task', '', 'Разработка', 'A long original context that must remain unchanged', '', '', '', '', '', 100, 'PRIORITY', '2026-09-20T10:00:00Z')`);
    await admin.query(`INSERT INTO "Application" ("id", "taskId", "teamName", "idea", "plan", "status")
      VALUES ('legacy-accepted', 'legacy-task', 'Chosen team', 'Saved idea', 'Saved plan', 'ACCEPTED'),
             ('legacy-pending', 'legacy-task', 'Waiting team', 'Other idea', 'Other plan', 'PENDING')`);
    cli('migrate', 'deploy');
    const db = getPrisma();

    await t.test('new migrations preserve original tasks, applications and unique index', async () => {
      const saved = await db.task.findUniqueOrThrow({ where: { id: 'legacy-task' } });
      assert.equal(saved.title, 'Preserved task');
      assert.equal(saved.context, 'A long original context that must remain unchanged');
      assert.equal(saved.createdAt.toISOString(), '2026-09-20T10:00:00.000Z');
      assert.equal(saved.ownerId, null);
      assert.equal(saved.expected_result, '');
      assert.equal(saved.score, 20);
      assert.equal(saved.status, 'DRAFT');
      assert.equal(await db.application.count({ where: { taskId: saved.id } }), 2);
      const accepted = await db.application.findUniqueOrThrow({ where: { id: 'legacy-accepted' } });
      assert.equal(accepted.status, 'ACCEPTED');
      assert.equal(accepted.idea, 'Saved idea');
      await assert.rejects(db.application.update({ where: { id: 'legacy-pending' }, data: { status: 'ACCEPTED' } }), { code: 'P2002' });
      cli('migrate', 'deploy');
      assert.equal(await db.application.count(), 2);
    });

    await t.test('registration, login, session cookies and duplicate email are persisted safely', async () => {
      const password = 'test-only-' + randomUUID();
      const owner = await POST(req('/api/auth/register', 'POST', { email: 'OWNER@example.com', password }));
      assert.equal(owner.status, 201);
      const ownerBody = await owner.json();
      ownerId = ownerBody.user.id;
      assert.deepEqual(Object.keys(ownerBody.user).sort(), ['email', 'id']);
      assert.equal(ownerBody.user.email, 'owner@example.com');
      assert.match(owner.headers.get('set-cookie')!, /HttpOnly/i);
      ownerCookie = owner.headers.get('set-cookie')!.split(';')[0];
      const other = await POST(req('/api/auth/register', 'POST', { email: 'other@example.com', password }));
      assert.equal(other.status, 201);
      applicantCookie = other.headers.get('set-cookie')!.split(';')[0];
      assert.equal((await POST(req('/api/auth/register', 'POST', { email: 'owner@example.com', password }))).status, 409);
      const duplicateResponses = await Promise.all([1, 2].map(() => POST(req('/api/auth/register', 'POST', { email: 'concurrent@example.com', password }))));
      assert.deepEqual(duplicateResponses.map(response => response.status).sort(), [201, 409]);
      const saved = await db.user.findUniqueOrThrow({ where: { id: ownerId } });
      assert.notEqual(saved.passwordHash, password);
      await db.$disconnect();
      assert.equal((await POST(req('/api/auth/login', 'POST', { email: 'owner@example.com', password }))).status, 200);
      assert.equal((await POST(req('/api/auth/login', 'POST', { email: 'owner@example.com', password: 'wrong' }))).status, 401);
      assert.equal((await (await GET(req('/api/auth/me', 'GET', undefined, ownerCookie))).json()).user.id, ownerId);
      assert.deepEqual(await (await GET(req('/api/auth/me', 'GET', undefined, ownerCookie + 'tampered'))).json(), { user: null });
      const logout = await POST(req('/api/auth/logout', 'POST', {}, ownerCookie));
      assert.equal(logout.status, 200);
      assert.match(logout.headers.get('set-cookie')!, /expires=/i);
    });

    async function publish() {
      const response = await POST(req('/api/tasks', 'POST', { card_data: card }, ownerCookie));
      assert.equal(response.status, 201);
      const task = await response.json() as Task;
      assert.deepEqual(task.card_data, card);
      assert.equal(task.score, scoreCard(card));
      assert.equal(task.status, 'WORKING');
      assert.equal(task.owner_id, ownerId);
      assert.equal(task.applications_open, true);
      return task;
    }
    async function apply(taskId: string, teamName: string) {
      const response = await POST(req('/api/applications', 'POST', {
        task_id: taskId, team_name: teamName, idea: 'Prototype', plan: 'Research and build',
      }, applicantCookie));
      assert.equal(response.status, 201);
      const application = await response.json() as Application;
      assert.equal(application.task_id, taskId);
      assert.equal(application.team_name, teamName);
      assert.equal(application.prototype, '');
      assert.equal(application.status, 'PENDING');
      return application;
    }
    const decide = (id: string, status: string, cookie = ownerCookie) => PATCH(req(`/api/applications/${id}/status`, 'PATCH', { status }, cookie));

    await t.test('seed is repeatable; unowned demo tasks are closed and existing records survive', async () => {
      cli('db', 'seed');
      assert.equal(await db.task.count(), 7);
      for (const task of seedTasks()) {
        const saved = await (await GET(req(`/api/tasks/${task.id}`))).json();
        assert.deepEqual(saved, { ...task, created_at: new Date(task.created_at).toISOString(), applications_open: false });
      }
      assert.equal((await POST(req('/api/applications', 'POST', {
        task_id: '1', team_name: 'Demo team', idea: 'Idea', plan: 'Plan',
      }, applicantCookie))).status, 400);
      await db.task.update({ where: { id: '1' }, data: { title: 'Edited demo task' } });
      cli('db', 'seed');
      assert.equal(await db.task.count(), 7);
      assert.equal((await db.task.findUniqueOrThrow({ where: { id: '1' } })).title, 'Edited demo task');
      assert.equal(await db.application.count({ where: { taskId: 'legacy-task' } }), 2);
    });

    await t.test('ownership is enforced for creation, personal cabinet, applications and decisions', async () => {
      const task = await publish();
      assert.equal((await GET(req(`/api/tasks/${task.id}/applications`, 'GET', undefined, applicantCookie))).status, 403);
      assert.equal((await GET(req(`/api/tasks/${task.id}/applications`))).status, 403);
      assert.equal((await POST(req('/api/applications', 'POST', { task_id: task.id, team_name: 'Own', idea: 'Idea', plan: 'Plan' }, ownerCookie))).status, 400);
      const application = await apply(task.id, 'Applicant');
      assert.equal((await decide(application.id, 'ACCEPTED', applicantCookie)).status, 409);
      const mine = await (await GET(req('/api/my-tasks', 'GET', undefined, ownerCookie))).json() as Task[];
      assert.ok(mine.some(item => item.id === task.id));
      assert.ok(mine.every(item => item.owner_id === ownerId));
      assert.deepEqual(await (await GET(req('/api/my-tasks', 'GET', undefined, applicantCookie))).json(), []);
    });

    await t.test('publish, reject, accept and block subsequent submissions and decisions', async () => {
      const task = await publish();
      const rejected = await apply(task.id, 'Rejected team');
      const accepted = await apply(task.id, 'Accepted team');
      const pending = await apply(task.id, 'Pending team');
      assert.equal((await decide(rejected.id, 'REJECTED')).status, 200);
      assert.equal((await decide(rejected.id, 'ACCEPTED')).status, 409);
      assert.equal((await decide(accepted.id, 'ACCEPTED')).status, 200);
      assert.equal((await decide(pending.id, 'ACCEPTED')).status, 409);
      assert.equal((await decide(pending.id, 'REJECTED')).status, 409);
      assert.equal((await decide(accepted.id, 'REJECTED')).status, 409);
      assert.equal((await POST(req('/api/applications', 'POST', { task_id: task.id, team_name: 'Late', idea: 'Idea', plan: 'Plan' }, applicantCookie))).status, 400);
      await db.$disconnect();
      assert.equal((await (await GET(req(`/api/tasks/${task.id}`))).json()).applications_open, false);
      const applications = await (await GET(req(`/api/tasks/${task.id}/applications`, 'GET', undefined, ownerCookie))).json() as Application[];
      assert.deepEqual(applications.map(a => a.status).sort(), ['ACCEPTED', 'PENDING', 'REJECTED']);
      const tasks = await (await GET(req('/api/tasks'))).json() as Task[];
      assert.deepEqual(tasks.map(item => item.score), tasks.map(item => item.score).sort((a, b) => b - a));
    });

    await t.test('simultaneous accepts produce exactly one winner', async () => {
      const task = await publish();
      const first = await apply(task.id, 'First');
      const second = await apply(task.id, 'Second');
      const responses = await Promise.all([decide(first.id, 'ACCEPTED'), decide(second.id, 'ACCEPTED')]);
      assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
      assert.equal(await db.application.count({ where: { taskId: task.id, status: 'ACCEPTED' } }), 1);
      assert.equal(await db.application.count({ where: { taskId: task.id, status: 'PENDING' } }), 1);
    });

    await t.test('concurrent decisions on one application succeed once', async () => {
      const task = await publish();
      const application = await apply(task.id, 'One team');
      const responses = await Promise.all([decide(application.id, 'REJECTED'), decide(application.id, 'ACCEPTED')]);
      assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    });

    await t.test('database index protects direct concurrent writes and task deletion cascades', async () => {
      const task = await publish();
      const applications = await Promise.all([apply(task.id, 'Direct A'), apply(task.id, 'Direct B')]);
      const results = await Promise.allSettled(applications.map(application => db.application.update({ where: { id: application.id }, data: { status: 'ACCEPTED' } })));
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(results.find(result => result.status === 'rejected')?.reason.code, 'P2002');
      assert.ok((await db.application.findUniqueOrThrow({ where: { id: applications[0].id } })).createdAt instanceof Date);
      await db.task.delete({ where: { id: task.id } });
      assert.equal(await db.application.count({ where: { taskId: task.id } }), 0);
      assert.equal((await GET(req(`/api/tasks/${task.id}`))).status, 404);
    });

    await t.test('unknown resources, invalid status and executable links are rejected', async () => {
      assert.equal((await GET(req('/api/tasks/missing'))).status, 404);
      assert.equal((await decide('missing', 'ACCEPTED')).status, 409);
      assert.equal((await decide('missing', 'PENDING')).status, 400);
      assert.equal((await POST(req('/api/applications', 'POST', { task_id: 'missing', team_name: 'Team', idea: 'Idea', plan: 'Plan' }, applicantCookie))).status, 400);
      assert.equal((await POST(req('/api/applications', 'POST', { task_id: '1', team_name: 'Team', idea: 'Idea', plan: 'Plan', prototype: 'javascript:alert(1)' }, applicantCookie))).status, 400);
    });
  } finally {
    await getPrisma().$disconnect();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
  }
});
