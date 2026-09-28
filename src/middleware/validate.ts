import { Request, Response, NextFunction } from 'express';
import { ZodType, ZodError } from 'zod';

/**
 * Validate a request — and replace it with what came out.
 *
 * The previous version parsed and threw the result away. Controllers then
 * read `req.body` raw, so validation judged the request without ever
 * cleaning it, and two things followed from that.
 *
 * A request could carry anything extra. Zod strips unknown keys, but the
 * stripped copy was discarded: `POST /users` ran `new User(req.body)` with
 * whatever arrived, and since `isAdmin` is declared on the Mongoose schema,
 * any signed-in user could hand themselves the admin flag. Verified, not
 * supposed — the probe answered `isAdmin: true`.
 *
 * And every `.default()` and `.transform()` in the schemas was dead code.
 * `suggestedDays` carries a transform that de-duplicates and sorts the days,
 * with a comment explaining why it belongs there rather than in the view; it
 * had never run once. Zod produced `[0, 3]` while the controller read
 * `[3, 0, 3]`.
 *
 * So the validated value is written back. From here on, a controller reading
 * `req.body` reads something that matched a schema.
 */
export const validate =
  (schema: ZodType) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = (await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      })) as {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };

      // Only what the schema described: a schema that says nothing about
      // `query` must not empty it.
      if (parsed.body !== undefined) req.body = parsed.body;
      if (parsed.params !== undefined)
        req.params = parsed.params as typeof req.params;
      if (parsed.query !== undefined)
        Object.assign(req.query, parsed.query as object);

      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          status: 'fail',
          errors: error.issues.map((issue) => ({
            // `path` is ['body', 'email'] or ['params', 'id']: the field is
            // what follows the section, and the section alone when a whole
            // object is at fault.
            field:
              issue.path.length > 1
                ? issue.path.slice(1).join('.')
                : issue.path.join('.'),
            message: issue.message,
          })),
        });
      }
      return next(error);
    }
  };
