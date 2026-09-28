import { Router } from 'express';
import { validate } from '../../shared/middleware/validate';
import { authLimiter } from '../../shared/middleware/rateLimits';
import { googleAuthSchema } from './auth.schema';
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
router.post('/google-onetap', authLimiter, googleOneTapCallback);
router.get('/me', getMe);
router.post('/logout', logout);
router.get('/verify-invite-token', verifyInviteToken);

if (process.env.NODE_ENV !== 'production') {
  router.post('/dev-login', devLogin);
}

export default router;
