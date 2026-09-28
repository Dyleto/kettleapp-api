import { z } from 'zod';

/**
 * An identifier in the URL.
 *
 * Nothing validated route parameters at all: `:id` went straight to Mongoose,
 * and a malformed one came back as a CastError — a 500 in the logs until the
 * error handler was fixed, and a database round trip either way for a request
 * that could never have matched anything.
 *
 * 24 hexadecimal characters is what an ObjectId is. Checking it here means
 * the answer is a 400 that names the field, before any query runs.
 */
export const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "L'identifiant n'est pas valide");

/** `:id` — the usual spelling. */
export const idParamSchema = z.object({
  params: z.object({ id: objectId }),
});

/**
 * Both a body and a `:clientId`, for the routes that carry the two.
 *
 * Zod schemas do not merge across the `body`/`params` split on their own, so
 * a route with both needs them stated together.
 */
export const withClientIdParam = <T extends z.ZodTypeAny>(body: T) =>
  z.object({
    params: z.object({ clientId: objectId }),
    body,
  });
