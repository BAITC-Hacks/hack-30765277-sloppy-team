'use client';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';

type PublicUser = { id: string; email: string };

export function AuthPanel({ user, onAuth, onClose }: {
    user: PublicUser | null;
    onAuth: (user: PublicUser | null) => void;
    onClose: () => void;
}) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    async function submit(event: FormEvent) {
        event.preventDefault();
        if (busy) return;
        setBusy(true); setError('');
        try {
            const data = await api<{ user: PublicUser }>('/api/auth/' + mode, 'POST', { email, password });
            onAuth(data.user);
        } catch (error) { setError((error as Error).message); }
        finally { setBusy(false); }
    }

    async function logout() {
        setBusy(true); setError('');
        try { await api('/api/auth/logout', 'POST', {}); onAuth(null); }
        catch (error) { setError((error as Error).message); }
        finally { setBusy(false); }
    }

    return <div className="auth-overlay"><div className="panel auth-panel" role="dialog" aria-modal="true" aria-label="Аккаунт">
        <button className="auth-close" disabled={busy} onClick={onClose}>Закрыть</button>
        {error && <p role="alert" className="error">{error}</p>}
        {user ? <><h2>{user.email}</h2><button className="button secondary" disabled={busy} onClick={logout}>Выйти</button></> :
            <form onSubmit={submit}>
                <h2>{mode === 'login' ? 'Вход' : 'Регистрация'}</h2>
                <label className="field"><span>Email</span><input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} disabled={busy}/></label>
                <label className="field"><span>Пароль</span><input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} disabled={busy}/></label>
                <p className="muted">Пароль: от 12 до 128 символов.</p>
                <button className="button dark" disabled={busy}>{busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}</button>
                <button type="button" className="button secondary" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Регистрация' : 'Уже есть аккаунт'}</button>
            </form>}
    </div></div>;
}
