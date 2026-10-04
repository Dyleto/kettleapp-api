import { Router } from 'express';
import { validate } from '../../shared/middleware/validate';
import { devRoutesEnabled } from '../../shared/config/env';
import { authLimiter } from '../../shared/middleware/rateLimits';
import {
  devLoginSchema,
  googleAuthSchema,
  googleOneTapSchema,
  verifyInviteTokenSchema,
} from './auth.schema';
import {
  googleAuthCallback,
  googleOneTapCallback,
  getMe,
  logout,
  verifyInviteToken,
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

// Une connexion sans mot de passe, et seulement là où on l'a voulu. La
// condition vit dans `shared/config/env` pour que son test l'exerce au lieu
// de la recopier — voir `devRoutesEnabled`.
if (devRoutesEnabled(process.env.NODE_ENV)) {
  router.post('/dev-login', validate(devLoginSchema), devLogin);
}

export default router;
