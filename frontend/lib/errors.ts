export class AppError extends Error {
    constructor(message: string, public readonly status = 400) { super(message); }
}
export function publicError(error: unknown): {
    error: string;
    status: number;
} {
    if (error instanceof AppError)
        return { error: error.message, status: error.status };
    console.error('Request failed:', error instanceof Error ? error.name : 'UnknownError');
    return { error: 'Не удалось выполнить операцию. Повторите попытку.', status: 500 };
}
