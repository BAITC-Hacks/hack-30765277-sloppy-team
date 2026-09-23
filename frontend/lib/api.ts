/** Browser transport. Errors stay readable even for proxy HTML or network failures. */
export async function api<T>(url: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
    try {
        const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store',
            signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(75000)]) : AbortSignal.timeout(75000) });
        const data = await response.json().catch(() => { throw new Error('Сервер вернул непонятный ответ. Повторите запрос.'); });
        if (!response.ok)
            throw new Error(typeof data?.error === 'string' ? data.error : 'Не удалось выполнить запрос.');
        return data as T;
    }
    catch (error) {
        if (error instanceof TypeError)
            throw new Error('Нет соединения с сервером. Проверьте подключение и повторите.');
        if (error instanceof Error && error.name === 'TimeoutError')
            throw new Error('Сервер не ответил вовремя. Повторите запрос.');
        throw error;
    }
}
