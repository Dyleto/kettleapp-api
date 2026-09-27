/**
 * What a caught value actually is.
 *
 * `catch (err: any)` was the shortcut, and it costs the one thing a catch
 * block needs: knowing what it holds. A rejected promise can carry anything —
 * an Error, a string, `undefined` — so `err.message` is a guess that reads as
 * a certainty, and `undefined` is what ends up in the logs.
 *
 * TypeScript already types a caught value as `unknown` under `strict`. These
 * two helpers are what turns that back into something usable, once, instead
 * of an assertion at every call site.
 */

/** The message, whatever was thrown. Never `undefined`. */
export const errorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
};

/** The shape Axios rejects with, as much of it as we read. */
export interface HttpErrorBody {
  status?: number;
  error?: string;
  errorDescription?: string;
}

/**
 * What an HTTP client's rejection carries, when it carries anything.
 *
 * Google answers a failed token exchange with a body that names the reason —
 * `invalid_grant`, `redirect_uri_mismatch` — and that reason is the only
 * thing that makes such a failure diagnosable. Reading it off `any` worked
 * until the day the rejection was not an Axios error at all.
 */
export const httpErrorBody = (err: unknown): HttpErrorBody => {
  if (typeof err !== 'object' || err === null) return {};
  const response = (err as { response?: unknown }).response;
  if (typeof response !== 'object' || response === null) return {};
  const { status, data } = response as { status?: unknown; data?: unknown };
  const body = typeof data === 'object' && data !== null ? data : {};
  const { error, error_description: description } = body as {
    error?: unknown;
    error_description?: unknown;
  };
  return {
    status: typeof status === 'number' ? status : undefined,
    error: typeof error === 'string' ? error : undefined,
    errorDescription: typeof description === 'string' ? description : undefined,
  };
};
