import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { emptyCard } from '../lib/domain';

const testUrl = process.env.TEST_DATABASE_URL;
test('PostgreSQL: auth, AI, confirmed publication, editing, access and concurrent decisions', { skip: !testUrl }, async () => {
    // Never let this test fall back to the developer's DATABASE_URL.
    const url = new URL(testUrl!);
    assert.match(url.searchParams.get('schema') || '', /^pilot_test_[a-z0-9_]+$/);
    process.env.DATABASE_URL = testUrl;
    process.env.SESSION_SECRET = randomUUID() + randomUUID();
    const { GET, POST, PATCH } = await import('../app/api/[...path]/route');
    const { getPrisma } = await import('../lib/prisma');
    const prisma = getPrisma();
    const users: string[] = [];
    const tasks: string[] = [];
    const req = (path: string, method = 'GET', data?: unknown, cookie = '', headers: Record<string,string> = {}) =>
        new NextRequest('http://localhost' + path, { method, headers: { 'content-type': 'application/json', cookie, ...headers },
            ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    const register = async () => {
        const email = randomUUID() + '@example.test';
        const password = 'Integration test password 123!';
        const response = await POST(req('/api/auth/register', 'POST', { email, password }));
        assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
        const data = await response.json(); users.push(data.user.id);
        assert.equal(data.user.password_hash, undefined);
        return { email, password, id: data.user.id, cookie: response.headers.get('set-cookie')!.split(';')[0] };
    };
    try {
        const health = await (await GET(req('/api/health'))).json();
        assert.equal(health.ai_mode, 'demo', 'Integration tests require an explicit demo backend');
        const owner = await register(); const student = await register(); const stranger = await register();
        assert.equal((await POST(req('/api/auth/login', 'POST', { email: owner.email, password: owner.password }))).status, 200);
        assert.equal((await POST(req('/api/auth/login', 'POST', { email: owner.email, password: owner.password }, '', { host: '127.0.0.1:3020', origin: 'http://127.0.0.1:3020' }))).status, 200);
        assert.equal((await POST(req('/api/auth/login', 'POST', { email: owner.email, password: 'incorrect password' }))).status, 401);
        assert.equal((await POST(req('/api/auth/register', 'POST', { email: owner.email, password: owner.password }))).status, 409);
        const me = await (await GET(req('/api/auth/me', 'GET', undefined, owner.cookie))).json();
        assert.equal(me.user.id, owner.id);
        assert.equal((await GET(req('/api/my-tasks'))).status, 401);
        const card = { ...emptyCard, title: 'Integration task', context: 'A useful business need for students' };
        assert.equal((await POST(req('/api/tasks', 'POST', { card_data: card, confirmed: true }))).status, 401);
        assert.equal((await POST(req('/api/tasks', 'POST', { card_data: card }, owner.cookie))).status, 422);
        assert.equal((await POST(req('/api/tasks', 'POST', { card_data: card }, owner.cookie, { origin: 'https://foreign.test' }))).status, 403);
        const draft_text = 'Небольшой кофейне нужен отчёт по продажам из таблиц';
        const clarify = await POST(req('/api/ai/clarify', 'POST', { draft_text }, owner.cookie));
        assert.equal(clarify.status, 200);
        const data = await clarify.json();
        // Integration tests require an explicit demo backend: no billable calls.
        assert.equal(data.mode, 'demo'); assert.equal(data.questions.length, 3);
        const built = await POST(req('/api/ai/build-card', 'POST', { draft_text,
            qa_pairs: data.questions.map((question: string) => ({ question, answer: '' })) }, owner.cookie));
        assert.equal(built.status, 200); assert.equal((await built.json()).card_data.contacts, '');
        const published = await POST(req('/api/tasks', 'POST', { card_data: card, confirmed: true }, owner.cookie));
        assert.equal(published.status, 201);
        const task = await published.json(); tasks.push(task.id);
        assert.equal(task.owner_id, owner.id); assert.equal(task.score, 20); assert.equal(task.status, 'DRAFT');
        const catalog = await (await GET(req('/api/tasks'))).json();
        assert.ok(catalog.some((t: {id:string}) => t.id === task.id));
        for (let i=1;i<catalog.length;i++) assert.ok(catalog[i-1].score >= catalog[i].score);
        assert.equal((await PATCH(req('/api/tasks/'+task.id, 'PATCH', { card_data: card, confirmed: true }, stranger.cookie))).status, 403);
        assert.equal((await GET(req('/api/tasks/'+task.id+'/applications', 'GET', undefined, student.cookie))).status, 403);
        const full = Object.fromEntries(Object.keys(emptyCard).map(k => [k, k === 'links' ? '' : 'x'.repeat(30)]));
        const edited = await PATCH(req('/api/tasks/'+task.id, 'PATCH', { card_data: full, confirmed: true }, owner.cookie));
        assert.equal(edited.status, 200); assert.equal((await edited.json()).score, 100);
        assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).score, 100);
        const application = { task_id: task.id, team_name: 'Pilot team', idea: 'A prototype', plan: 'Research and build', deadline: 'Two weeks', prototype: '' };
        assert.equal((await POST(req('/api/applications', 'POST', application, owner.cookie))).status, 400);
        assert.equal((await POST(req('/api/applications', 'POST', { ...application, prototype: 'javascript:alert(1)' }, student.cookie))).status, 422);
        const appIds: string[] = [];
        for (let i=0;i<3;i++) {
            const response = await POST(req('/api/applications', 'POST', application, student.cookie));
            assert.equal(response.status, 201); const app = await response.json(); appIds.push(app.id); assert.equal(app.deadline, 'Two weeks');
        }
        const decide = (id:string, status:string, cookie=owner.cookie) => PATCH(req('/api/applications/'+id+'/status', 'PATCH', { status }, cookie));
        assert.equal((await decide(appIds[0], 'ACCEPTED', stranger.cookie)).status, 403);
        const accepted = await Promise.all(appIds.slice(0,2).map(id => decide(id,'ACCEPTED')));
        assert.deepEqual(accepted.map(r => r.status), [200,200]);
        assert.equal((await decide(appIds[0],'ACCEPTED')).status,200);
        assert.equal((await decide(appIds[0],'REJECTED')).status,409);
        assert.equal((await decide(appIds[2],'REJECTED')).status,200);
        assert.equal((await POST(req('/api/applications','POST', application, student.cookie))).status,201);
        const apps = await (await GET(req('/api/tasks/'+task.id+'/applications','GET',undefined,owner.cookie))).json();
        assert.equal(apps.filter((a:{status:string})=>a.status==='ACCEPTED').length,2);
        const mine = await (await GET(req('/api/my-tasks','GET',undefined,stranger.cookie))).json();
        assert.equal(mine.length,0);
        assert.equal((await POST(req('/api/auth/logout','POST',{},owner.cookie))).status,200);
        const originalUrl = process.env.AI_BACKEND_URL;
        process.env.AI_BACKEND_URL = 'http://127.0.0.1:1';
        try {
            assert.equal((await POST(req('/api/ai/clarify','POST',{draft_text},owner.cookie))).status,503);
            assert.equal((await GET(req('/api/tasks'))).status,200);
        } finally { if(originalUrl) process.env.AI_BACKEND_URL=originalUrl; else delete process.env.AI_BACKEND_URL; }
    } finally {
        await prisma.task.deleteMany({where:{id:{in:tasks}}});
        await prisma.user.deleteMany({where:{id:{in:users}}});
        await prisma.$disconnect();
    }
});
