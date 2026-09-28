import type { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/**
 * Who a quota belongs to.
 *
 * Counting by IP punishes the wrong people. Two coaches working from the same
 * gym's wifi share one address, so they shared one quota of 100 requests — and
 * the second one to reach it was locked out by the first one's work. Once
 * signed in, the session says who is asking, and that is who the quota
 * belongs to.
 *
 * `ipKeyGenerator` is used for the anonymous case rather than `req.ip`
 * directly: it normalises IPv6, where a single client holds a whole /64 and
 * could otherwise walk around any limit by changing the last block.
 */
const perUserOrIp = (req: Request): string =>
  req.session?.userId
    ? `u:${req.session.userId}`
    : ipKeyGenerator(req.ip ?? '');

/**
 * One quota, built one way.
 *
 * Every limiter in the app shares the same notion of whose quota it is and
 * the same exemption for preflights; only the window, the ceiling and the
 * message differ. Exported so a check can build one with a ceiling of two and
 * exercise the real counting logic rather than a copy of it.
 */
export const makeLimiter = (opts: {
  windowMs: number;
  limit: number;
  message: string;
}) =>
  rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: perUserOrIp,
    // Preflights consume nothing, and blocking them turns a quota into an
    // unexplained "CORS error" in the browser, which hides the real cause.
    skip: (req: Request) => req.method === 'OPTIONS',
    ...opts,
  });

/**
 * The ceiling for ordinary use.
 *
 * It was 100 per 15 minutes for the whole API, which the editor alone can
 * exhaust: the workshop saves itself, and a structural change — adding a
 * block, an exercise, reordering — is sent immediately, with no debounce. A
 * coach building five sessions of three blocks and three exercises produces
 * some sixty writes before counting a single page view, and running out means
 * being locked out for a quarter of an hour holding unsaved work. The app even
 * has a screen for that failure; a quota should not be what triggers it.
 *
 * 40 per minute over a 15-minute window leaves the fastest human hand a wide
 * margin while still stopping a script cold.
 */
export const globalLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  message: 'Trop de requêtes, veuillez réessayer dans quelques minutes.',
});

/**
 * Signing in, which is where guessing is attempted.
 *
 * Deliberately far stricter than the rest: ten attempts an hour is generous
 * for someone who owns the account and useless to someone who does not.
 */
export const authLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: 'Trop de tentatives de connexion.',
});

/**
 * Minting an invitation link.
 *
 * Each call can create a token that grants access to a coach's roster, so it
 * is worth its own ceiling — and no coach invites thirty clients in an hour.
 */
export const invitationLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  message: "Trop de liens d'invitation générés, réessayez plus tard.",
});
