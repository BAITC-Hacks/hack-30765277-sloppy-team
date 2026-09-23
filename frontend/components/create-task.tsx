'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Card, emptyCard } from '@/lib/domain';
import { api } from '@/lib/api';
import { CardEditor } from './card-editor';
export function Create({ onPublished }: {
    onPublished: () => void;
}) {
    const [step, setStep] = useState(1);
    const [draft, setDraft] = useState('');
    const [questions, setQuestions] = useState<string[]>([]);
    const [answers, setAnswers] = useState(['', '', '']);
    const [card, setCard] = useState<Card>(emptyCard);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [mode, setMode] = useState('');
    async function next() {
        if (busy)
            return;
        setBusy(true);
        setError('');
        try {
            if (step === 1) {
                const r = await api<{
                    questions: string[];
                    mode: string;
                }>('/api/ai/clarify', 'POST', { draft_text: draft });
                setQuestions(r.questions);
                setAnswers(['', '', '']);
                setMode(r.mode);
                setStep(2);
            }
            else {
                const r = await api<{
                    card_data: Card;
                    mode: string;
                }>('/api/ai/build-card', 'POST', {
                    draft_text: draft, qa_pairs: questions.map((question, i) => ({ question, answer: answers[i] }))
                });
                setCard(r.card_data);
                setMode(r.mode);
                setStep(3);
            }
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    }
    async function publish(card: Card) {
        if (busy)
            return;
        setBusy(true);
        setError('');
        try {
            await api('/api/tasks', 'POST', { card_data: card, confirmed: true });
            onPublished();
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    }
    return <section className="inner-page wizard"><Link className="back" href="/catalog">← В каталог</Link>
    <h1>Давайте создадим задачу</h1><p className="muted">Черновик → уточнения → проверка и публикация</p>
    <div className="demo-note">{mode === 'demo' ? 'Деморежим: фиксированные вопросы, ответы переносятся без дополнений. Внешний ИИ не используется.' : mode === 'openai' ? 'Карточку помогает собрать ИИ. Проверьте каждое поле перед публикацией.' : 'Помощник уточнит детали. Режим сервиса будет показан после ответа.'}</div>
    {error && <p className="error" role="alert">{error}</p>}
    {step === 3 ? <CardEditor initial={card} busy={busy} onSave={publish} label="Опубликовать в каталог"/> :
            <form className="panel" onSubmit={e => { e.preventDefault(); void next(); }}>
        {step === 1 ? <label className="field"><span>Опишите проблему простыми словами</span><textarea required rows={5} maxLength={20000} value={draft} disabled={busy} onChange={e => setDraft(e.target.value)}/><small>Не передавайте персональные или конфиденциальные данные.</small></label> :
                    <><h2>Ещё немного деталей</h2><p>Если сведений пока нет, оставьте ответ пустым: помощник не будет их придумывать.</p>{questions.map((q, i) => <label className="field" key={q}><span>{q}</span><textarea rows={4} maxLength={10000} disabled={busy} value={answers[i]} onChange={e => setAnswers(a => a.map((x, j) => i === j ? e.target.value : x))}/></label>)}</>}
        <button className="button dark" disabled={busy || !draft.trim()}>{busy ? 'Обрабатываем…' : step === 1 ? 'Уточнить задачу' : 'Сформировать карточку'}</button>
      </form>}
    {step === 2 && <button type="button" className="button secondary" disabled={busy} onClick={() => setStep(1)}>Изменить черновик</button>}
  </section>;
}
