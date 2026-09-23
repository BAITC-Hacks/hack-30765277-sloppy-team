'use client';
import { useEffect, useState } from 'react';
import { Card, Scoring, cardLabels, criterionLabels } from '@/lib/domain';
import { api } from '@/lib/api';
export function ScoreDetails({ scoring }: {
    scoring: Scoring;
}) {
    return <div className="score-details"><details><summary>Расшифровка рейтинга</summary>
    <ul>{Object.entries(scoring.breakdown).map(([key, value]) => <li key={key}>{criterionLabels[key] || key}: <strong>{value}</strong></li>)}</ul>
  </details>{scoring.missing_fields.length > 0 && <details><summary>Как повысить рейтинг</summary><ul>{scoring.missing_fields.map(x => <li key={x}>{x}</li>)}</ul></details>}</div>;
}
export function CardEditor({ initial, onSave, busy, label }: {
    initial: Card;
    onSave: (card: Card) => Promise<void>;
    busy: boolean;
    label: string;
}) {
    const [card, setCard] = useState(initial);
    const [confirmed, setConfirmed] = useState(false);
    const [score, setScore] = useState<Scoring | null>(null);
    const [error, setError] = useState('');
    const [pending, setPending] = useState(true);
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        setPending(true);
        setError('');
        const timer = setTimeout(() => {
            api<Scoring>('/api/tasks/score', 'POST', { card_data: card }, controller.signal)
                .then(value => { if (!controller.signal.aborted)
                setScore(value); })
                .catch(e => { if (!controller.signal.aborted)
                setError(e.message); })
                .finally(() => { if (!controller.signal.aborted)
                setPending(false); });
        }, 300);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [card, retry]);
    const change = (key: keyof Card, value: string) => { setConfirmed(false); setPending(true); setCard(c => ({ ...c, [key]: value })); };
    return <form className="panel" onSubmit={e => { e.preventDefault(); if (confirmed && !busy && !pending && !error)
        void onSave(card); }}>
    <div aria-live="polite" className="score-panel"><strong>{pending ? 'Пересчитываем…' : error ? 'Рейтинг недоступен' : `${score?.score ?? 0} / 100`}</strong><p>Предварительный рейтинг. Изменения попадут в каталог после вашего подтверждения.</p></div>
    {!pending && !error && score && <ScoreDetails scoring={score}/>}
    {error && <p role="alert" className="error">{error} <button type="button" onClick={() => setRetry(n => n + 1)}>Повторить расчёт</button></p>}
    <h2>Карточка вашей задачи</h2>
    {(Object.keys(cardLabels) as (keyof Card)[]).map(key => <label className="field" key={key}><span>{cardLabels[key]}{['title', 'context'].includes(key) && ' *'}</span>
      {key === 'category' ? <select disabled={busy} value={card[key]} onChange={e => change(key, e.target.value)}>{['Разработка', 'Дизайн', 'Аналитика', 'Маркетинг', 'Исследования'].map(c => <option key={c}>{c}</option>)}</select> :
                ['title', 'company', 'contacts', 'links'].includes(key) ? <input disabled={busy} required={key === 'title'} maxLength={key === 'title' ? 500 : 20000} type={key === 'links' ? 'url' : 'text'} value={card[key]} onChange={e => change(key, e.target.value)}/> :
                    <textarea disabled={busy} rows={3} required={key === 'context'} maxLength={20000} value={card[key]} onChange={e => change(key, e.target.value)}/>}</label>)}
    <label className="confirmation"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)}/> Я проверил карточку и подтверждаю указанные сведения</label>
    <button className="button dark" disabled={busy || !confirmed || pending || !!error}>{busy ? 'Сохраняем…' : label}</button>
  </form>;
}
