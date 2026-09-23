'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowUpRight, ArrowRight, Search, Plus, SlidersHorizontal, BriefcaseBusiness, GraduationCap, Sparkles, Check, ChevronRight, LayoutGrid, Clock, Users, ExternalLink, ArrowLeft, LoaderCircle } from 'lucide-react';
import { Application, Card, Task, safeUrl } from '@/lib/domain';
import { api } from '@/lib/api';
import { AuthPanel } from './auth-panel';
import { Create } from './create-task';
import { CardEditor, ScoreDetails } from './card-editor';
const labels = { PRIORITY: 'В приоритете', READY: 'Готова к работе', WORKING: 'В проработке', DRAFT: 'Требует уточнения' };
function Badge({ task }: {
    task: Task;
}) { return <span className={'badge ' + task.status}>{task.status === 'PRIORITY' ? '↗' : task.status === 'READY' ? '●' : '◷'} {labels[task.status]}</span>; }
function Score({ value }: {
    value: number;
}) { return <div className={'score-panel ' + (value < 40 ? 'low' : value < 70 ? 'medium' : 'high')}><div><span>Готовность ТЗ</span><strong>{value}<small> / 100</small></strong></div><div className="progress"><i style={{ width: value + '%' }}/></div><p>{value >= 70 ? 'Задача хорошо описана — команде будет проще начать.' : 'Добавьте детали, чтобы команда лучше поняла задачу.'}</p></div>; }
function Field({ label, value, onChange, area = false, required = false, placeholder = '', type = 'text' }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    area?: boolean;
    required?: boolean;
    placeholder?: string;
    type?: string;
}) { return <label className="field"><span>{label}{required && ' *'}</span>{area ? <textarea required={required} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={4}/> : <input type={type} required={required} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}/>}</label>; }
export default function Workspace() {
    const path = usePathname();
    const router = useRouter();
    const [role, setRole] = useState<'student' | 'business'>('student');
    const [user, setUser] = useState<{id:string;email:string}|null>(null);
    const [authBusy, setAuthBusy] = useState(true);
    const [authOpen, setAuthOpen] = useState(false);
    const [authError, setAuthError] = useState('');
    const onAuth = (value: {id:string;email:string}|null) => { setUser(value); setAuthError(''); setAuthOpen(false); setRetry(n => n + 1); };
    useEffect(() => { let active = true;
        api<{user:{id:string;email:string}|null}>('/api/auth/me').then(data => { if(active) setUser(data.user); })
            .catch(e => { if(active) setAuthError(e.message); }).finally(() => { if(active) setAuthBusy(false); });
        return () => { active = false; };
    }, []);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('Все направления');
    const [status, setStatus] = useState('ALL');
    const [minimum, setMinimum] = useState(0);
    const [sort, setSort] = useState('score');
    const [retry, setRetry] = useState(0);
    useEffect(() => { try {
        const saved = localStorage.getItem('praktika-role');
        if (saved === 'business')
            setRole(saved);
    }
    catch { } }, []);
    useEffect(() => { let active = true; setLoading(true); setError(''); api<Task[]>('/api/tasks').then(t => { if (active)
        setTasks(t); }).catch(e => { if (active)
        setError(e.message); }).finally(() => { if (active)
        setLoading(false); }); return () => { active = false; }; }, [path, retry]);
    const changeRole = (v: 'student' | 'business') => { setRole(v); try {
        localStorage.setItem('praktika-role', v);
    }
    catch { } };
    const isCreate = path === '/create-task';
    const isApps = /^\/my-tasks\/[^/]+\/apps$/.test(path);
    const id = path.split('/')[2];
    const task = tasks.find(t => t.id === id);
    const catalog = path === '/' || path === '/catalog';
    const myTasks = path === '/my-tasks';
    const filtered = tasks.filter(t => (t.card_data.title + ' ' + t.card_data.company + ' ' + t.card_data.context).toLowerCase().includes(query.toLowerCase()) && (category === 'Все направления' || t.card_data.category === category) && (status === 'ALL' || t.status === status) && t.score >= minimum).sort((a, b) => sort === 'score' ? b.score - a.score : Date.parse(b.created_at) - Date.parse(a.created_at));
    return <><header><div className="header-inner"><Link className="brand" href="/catalog"><span className="brand-icon">п<span>↗</span></span>практика<span className="brand-dot">.</span></Link><nav><Link className={catalog ? 'active' : ''} href="/catalog">Каталог задач</Link><Link className={myTasks || isApps ? 'active' : ''} href="/my-tasks">Кабинет бизнеса</Link></nav><div className="header-right"><div className="role-switch"><button className={role === 'student' ? 'selected' : ''} onClick={() => changeRole('student')}><GraduationCap size={16}/>Студент</button><button className={role === 'business' ? 'selected' : ''} onClick={() => changeRole('business')}><BriefcaseBusiness size={15}/>Бизнес</button></div><button className="auth-button" onClick={() => setAuthOpen(true)}>{user ? user.email : 'Войти'}</button><span className="avatar">{role === 'student' ? 'СТ' : 'БЗ'}</span></div></div></header>
    <main>{authOpen && <AuthPanel user={user} onAuth={onAuth} onClose={() => setAuthOpen(false)}/>} {authError && <p role="alert" className="error">{authError}</p>}{catalog ? <><section className="hero"><div className="hero-copy"><div className="eyebrow"><span /> ОТ ИДЕИ К РЕАЛЬНОМУ ОПЫТУ</div><h1>Большие идеи.<br /><em>Настоящие задачи.</em></h1><p>Бизнесу — свежий взгляд. Студентам — опыт.<br />Находите друг друга и создавайте полезное вместе.</p><div className="hero-actions"><a className="button dark" href="#tasks">Найти свою задачу <ArrowUpRight size={18}/></a><span>Твой следующий шаг начинается здесь</span></div></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><span className="art-star">✳</span><div className="floating-note note-back"><span className="mini-tag">ИДЕЯ</span><div className="fake-line"/><div className="fake-line short"/><span className="note-symbol">↗</span></div><div className="floating-note note-front"><span className="mini-tag">РЕАЛЬНЫЙ РЕЗУЛЬТАТ</span><strong>Твой опыт<br />имеет значение.</strong><div className="note-bottom"><span className="people">● ● ●</span><span>Делаем вместе <ArrowUpRight size={15}/></span></div></div><span className="art-caption">МЕНЬШЕ ТЕОРИИ. БОЛЬШЕ ПРАКТИКИ.</span></div></section><div className="value-strip"><span><BriefcaseBusiness /> Реальные задачи бизнеса</span><span><Users /> Работа в команде</span><span><Sparkles /> Опыт для портфолио</span><span><Check /> Понятные критерии успеха</span></div><section id="tasks" className="catalog"><div className="section-heading"><div><div className="eyebrow muted">НАЙДИ СВОЁ НАПРАВЛЕНИЕ</div><h2>Каталог задач <span>{tasks.length}</span></h2></div><Link href="/create-task" className="button dark" onClick={() => changeRole('business')}><Plus size={18}/> Создать задачу</Link></div><div className="filter-top"><label className="search"><Search size={19}/><input aria-label="Поиск задач" placeholder="Название задачи, компания или ключевое слово" value={query} onChange={e => setQuery(e.target.value)}/></label><label className="sort">Сортировать:<select aria-label="Сортировка" value={sort} onChange={e => setSort(e.target.value)}><option value="score">По готовности ТЗ</option><option value="new">Сначала новые</option></select></label></div><div className="filter-bottom"><div className="chips">{['Все направления', 'Разработка', 'Дизайн', 'Аналитика', 'Маркетинг', 'Исследования'].map(c => <button key={c} className={category === c ? 'chosen' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div><div className="extra-filters"><SlidersHorizontal size={16}/><select aria-label="Статус задачи" value={status} onChange={e => setStatus(e.target.value)}><option value="ALL">Все статусы</option><option value="PRIORITY">В приоритете</option><option value="READY">Готова к работе</option><option value="WORKING">В проработке</option><option value="DRAFT">Требует уточнения</option></select><select aria-label="Минимальная готовность" value={minimum} onChange={e => setMinimum(Number(e.target.value))}><option value="0">Любой балл</option><option value="40">От 40 баллов</option><option value="70">От 70 баллов</option><option value="90">От 90 баллов</option></select></div></div>{loading ? <div className="empty"><LoaderCircle className="spin"/> Загружаем задачи…</div> : error ? <div className="empty error">{error}<button onClick={() => setRetry(n => n + 1)}>Повторить</button></div> : filtered.length ? <div className="task-grid">{filtered.map((t, i) => <Link className="task-card" key={t.id} href={'/tasks/' + t.id}><div className="card-top"><Badge task={t}/><span className="mini-score"><span className="score-dot"/>{t.score}<small>/100</small></span></div><div className="company"><span className={'company-icon tone-' + (Number(t.id) % 4 || 0)}>{t.card_data.company.slice(0, 1) || 'П'}</span>{t.card_data.company || 'Новый проект'}</div><h3>{t.card_data.title}</h3><p>{t.card_data.context}</p><div className="card-tags"><span>{t.card_data.category}</span><span><Clock size={12}/> Проект</span></div><div className="card-footer"><span>Посмотреть задачу</span><ArrowUpRight size={20}/></div></Link>)}</div> : <div className="empty">Ничего не найдено.<button onClick={() => { setQuery(''); setCategory('Все направления'); setStatus('ALL'); setMinimum(0); }}>Сбросить фильтры</button></div>}<div className="catalog-note"><span><span className="score-dot"/> Что означает готовность ТЗ?</span>Чем выше балл, тем подробнее описана задача и проще начать работу.</div></section></> : isCreate ? (authBusy ? <div className="empty">Загрузка…</div> : user ? <Create key={user.id} onPublished={() => router.push('/catalog')}/> : <section className="inner-page"><h1>Создать задачу</h1><p>Войдите, чтобы создать задачу.</p><button className="button dark" onClick={() => setAuthOpen(true)}>Войти</button></section>) : myTasks && !loading && !error ? <section className="inner-page"><div className="eyebrow muted">ПРОСТРАНСТВО ДЛЯ СОТРУДНИЧЕСТВА</div><h1>Кабинет бизнеса</h1><p className="muted">Здесь доступны ваши задачи. Выберите задачу, чтобы посмотреть отклики.</p>{!user && <button className="button dark" onClick={() => setAuthOpen(true)}>Войти</button>}{user && !tasks.some(t => t.owner_id === user.id) && <p>У вас пока нет задач.</p>}{tasks.filter(t => user && t.owner_id === user.id).map(t => <Link className="business-row" key={t.id} href={'/my-tasks/' + t.id + '/apps'}><div><Badge task={t}/><h3>{t.card_data.title}</h3></div><span>Отклики <ChevronRight size={18}/></span></Link>)}</section> : loading ? <div className="empty">Загрузка…</div> : error ? <div className="empty error">{error}<button onClick={() => setRetry(n => n + 1)}>Повторить</button></div> : task ? (isApps ? (user && user.id === task.owner_id ? <Applications key={task.id + user.id} task={task}/> : <div className="empty">Нет доступа к откликам этой задачи.</div>) : <Detail key={task.id + (user?.id || 'guest')} task={task} user={user} onLogin={() => setAuthOpen(true)} onSaved={updated => setTasks(items => items.map(t => t.id === updated.id ? updated : t))}/>) : <div className="empty"><h2>Страница не найдена</h2><Link href="/catalog">Вернуться в каталог</Link></div>}</main><footer><Link className="brand" href="/catalog">практика.</Link><span>Соединяем задачи бизнеса и талант студентов.</span><span>Сделано для нового опыта ↗</span></footer></>;
}
function Detail({ task, user, onLogin, onSaved }: {
    task: Task;
    user: {id:string;email:string}|null;
    onLogin: () => void;
    onSaved: (task: Task) => void;
}) { const [editing, setEditing] = useState(false); const [form, setForm] = useState({ team_name: '', idea: '', plan: '', prototype: '', deadline: '' }); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false); const [error, setError] = useState('');
 const [scoring, setScoring] = useState(task.scoring);
 useEffect(() => { let active = true;
   api<Task>('/api/tasks/' + task.id).then(value => { if(active) setScoring(value.scoring); })
     .catch(e => { if(active) setError(e.message); });
   return () => { active = false; };
 }, [task.id, task.score]);
 return <section className="inner-page"><Link href="/catalog" className="back"><ArrowLeft size={16}/> Все задачи</Link><Badge task={task}/><h1>{task.card_data.title}</h1><p className="muted">{task.card_data.company} · {task.card_data.category}</p>{editing && !!user && user.id === task.owner_id ? <><button className="button secondary" disabled={busy} onClick={() => setEditing(false)}>Отменить редактирование</button>{error && <p className="error" role="alert">{error}</p>}<CardEditor initial={task.card_data} busy={busy} label="Подтвердить изменения" onSave={async (card) => { setBusy(true); setError(''); try {
    const updated = await api<Task>('/api/tasks/' + task.id, 'PATCH', { card_data: card, confirmed: true });
    onSaved(updated);
    setEditing(false);
}
catch (e) {
    setError((e as Error).message);
}
finally {
    setBusy(false);
} }}/></> : <div className="detail-grid"><article className="panel">{([['context', 'Контекст задачи'], ['data', 'Данные и материалы'], ['expected_result', 'Ожидаемый результат'], ['target_audience', 'Пользователи / ЦА'], ['interaction_format', 'Формат консультаций и обратной связи'], ['constraints', 'Ограничения и сроки'], ['criteria', 'Критерии успеха'], ['contacts', 'Контакты']] as [
    keyof Card,
    string
][]).map(([key, label]) => <section className="detail-section" key={key}><h2>{label}</h2><p>{task.card_data[key] || 'Пока не указано — уточните у заказчика.'}</p></section>)}{safeUrl(task.card_data.links) && <a className="text-link" href={safeUrl(task.card_data.links)!} target="_blank" rel="noreferrer">Открыть материалы <ExternalLink size={15}/></a>}</article><aside><Score value={task.score}/>{scoring && <ScoreDetails scoring={scoring}/>}{user && user.id === task.owner_id ? <div className="panel"><button className="button secondary" onClick={() => setEditing(true)}>Редактировать карточку</button><h2>Найдите свою команду</h2><p>Посмотрите идеи студентов и выберите исполнителя.</p><Link className="button dark" href={'/my-tasks/' + task.id + '/apps'}>Посмотреть отклики <ArrowRight size={17}/></Link></div> : !user ? <div className="panel"><p>Войдите, чтобы отправить отклик.</p><button className="button dark" onClick={onLogin}>Войти</button></div> : sent ? <div className="panel success" role="status"><Check /><h2>Отклик отправлен!</h2><p>Заказчик увидит вашу идею в кабинете бизнеса.</p><Link href="/catalog">Вернуться к задачам →</Link></div> : <form className="panel" onSubmit={async (e) => { e.preventDefault(); if (busy)
    return; setBusy(true); setError(''); try {
    await api('/api/applications', 'POST', { task_id: task.id, ...form });
    setSent(true);
}
catch (e) {
    setError((e as Error).message);
}
finally {
    setBusy(false);
} }}><h2>Есть идея? Предложите её.</h2><p className="muted">Расскажите, как ваша команда решит задачу.</p>{(Object.entries({ team_name: 'Название команды', idea: 'Предлагаемое решение / идея', plan: 'План реализации по этапам', deadline: 'Предлагаемый срок', prototype: 'Ссылка на прототип (необязательно)' }) as [
    keyof typeof form,
    string
][]).map(([k, label]) => <Field key={k} label={label} value={form[k]} onChange={v => setForm(f => ({ ...f, [k]: v }))} required={k !== 'prototype'} area={k === 'idea' || k === 'plan'} type={k === 'prototype' ? 'url' : 'text'}/>)}{error && <p className="error" role="alert">{error}</p>}<button className="button dark full" disabled={busy}>{busy ? 'Отправляем…' : 'Отправить отклик'}<ArrowUpRight size={17}/></button></form>}</aside></div>}</section>; }
function Applications({ task }: {
    task: Task;
}) { const [apps, setApps] = useState<Application[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(''); const [retry, setRetry] = useState(0); useEffect(() => { let active = true; setLoading(true); setError(''); api<Application[]>('/api/tasks/' + task.id + '/applications').then(data => { if (active)
    setApps(data); }).catch(e => { if (active)
    setError(e.message); }).finally(() => { if (active)
    setLoading(false); }); return () => { active = false; }; }, [task.id, retry]); const accepted = apps.some(a => a.status === 'ACCEPTED'); async function update(id: string, status: string) { setBusy(id); setError(''); try {
    await api('/api/applications/' + id + '/status', 'PATCH', { status });
    setApps(await api('/api/tasks/' + task.id + '/applications'));
}
catch (e) {
    setError((e as Error).message);
}
finally {
    setBusy('');
} } return <section className="inner-page"><Link className="back" href="/my-tasks"><ArrowLeft size={16}/> Кабинет бизнеса</Link><h1>Команда для вашей задачи</h1><p className="muted">{task.card_data.title}</p>{accepted && <div className="demo-note success"><Check size={18}/> Вы выбрали команду. Можно принять и другие предложения или отклонить их.</div>}{error && <p className="error" role="alert">{error}<button onClick={() => setRetry(n => n + 1)}>Повторить</button></p>}{loading ? <div className="empty">Загрузка откликов…</div> : !apps.length && !error ? <div className="empty"><Users size={32}/><h2>Здесь появится ваша будущая команда</h2><p>Пока откликов нет. Студенты могут отправить идею на странице задачи.</p><Link className="button dark" href={'/tasks/' + task.id}>Открыть задачу <ArrowUpRight size={17}/></Link></div> : apps.map(a => <article className={'panel application ' + a.status} key={a.id}><div className="section-heading"><h2>{a.team_name}</h2><span className="badge">{a.status === 'ACCEPTED' ? 'Принята' : a.status === 'REJECTED' ? 'Отклонена' : 'Новый отклик'}</span></div><h4>Идея</h4><p>{a.idea}</p><h4>План реализации</h4><p>{a.plan}</p><h4>Срок</h4><p>{a.deadline || 'Не указан'}</p>{safeUrl(a.prototype) && <a className="text-link" href={safeUrl(a.prototype)!} target="_blank" rel="noreferrer">Посмотреть прототип <ExternalLink size={15}/></a>}<div className="form-actions"><button className="button accept" disabled={!!busy || a.status !== 'PENDING'} onClick={() => update(a.id, 'ACCEPTED')}><Check size={17}/> Принять</button><button className="button reject" disabled={!!busy || a.status !== 'PENDING'} onClick={() => update(a.id, 'REJECTED')}>Отклонить</button></div></article>)}</section>; }
