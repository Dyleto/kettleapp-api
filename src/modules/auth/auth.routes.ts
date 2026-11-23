import { Router } from 'express';
import { validate } from '../../shared/middleware/validate';
import { devRoutesEnabled } from '../../shared/config/env';
import { authLimiter } from '../../shared/middleware/rateLimits';
import { authMiddleware } from '../../shared/middleware/auth';
import {
  devLoginSchema,
  googleAuthSchema,
  googleOneTapSchema,
  joinSchema,
  verifyInviteTokenSchema,
} from './auth.schema';
import {
  googleAuthCallback,
  googleOneTapCallback,
  getMe,
  logout,
  verifyInviteToken,
  joinWithInvitation,
  devLogin,
} from './auth.controller';

const router = Router();

router.post(
  '/google-callback',
  authLimiter,
  validate(googleAuthSchema),
  googleAuthCallback
);
router.post(
  '/google-onetap',
  authLimiter,
  validate(googleOneTapSchema),
  googleOneTapCallback
);
router.get('/me', getMe);
router.post('/logout', logout);
router.get(
  '/verify-invite-token',
  validate(verifyInviteTokenSchema),
  verifyInviteToken
);
// Le compte rejoint est celui de la session : la route exige qu'il y en
// ait une, et ne lit rien d'autre que le jeton.
router.post(
  '/join',
  authLimiter,
  authMiddleware,
  validate(joinSchema),
  joinWithInvitation
);

// Une connexion sans mot de passe, et seulement là où on l'a voulu. La
// condition vit dans `shared/config/env` pour que son test l'exerce au lieu
// de la recopier — voir `devRoutesEnabled`.
if (devRoutesEnabled(process.env.NODE_ENV)) {
  router.post('/dev-login', validate(devLoginSchema), devLogin);
}

export default router;
