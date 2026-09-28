/**
 * Ce qu'est réellement une valeur attrapée.
 *
 * `catch (err: any)` était le raccourci, et il coûte la seule chose dont un
 * bloc catch a besoin : savoir ce qu'il tient. Une promesse rejetée peut
 * porter n'importe quoi — une Error, une chaîne, `undefined` — donc
 * `err.message` est une supposition qui se lit comme une certitude, et c'est
 * `undefined` qui finit dans le journal.
 *
 * TypeScript type déjà une valeur attrapée en `unknown` sous `strict`. Ces
 * deux fonctions font le rétrécissement une fois pour toutes, au lieu d'une
 * assertion à chaque appel.
 */

/** Le message, quoi qui ait été lancé. Jamais `undefined`. */
export const errorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
};

/** La forme avec laquelle Axios rejette, pour ce qu'on en lit. */
export interface HttpErrorBody {
  status?: number;
  error?: string;
  errorDescription?: string;
}

/**
 * Ce que porte le rejet d'un client HTTP, quand il porte quelque chose.
 *
 * Google répond à un échange de code raté par un corps qui nomme la raison —
 * `invalid_grant`, `redirect_uri_mismatch` — et cette raison est la seule
 * chose qui rende un tel échec diagnosticable. La lire depuis un `any`
 * marchait jusqu'au jour où le rejet n'était pas du tout une erreur Axios.
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
