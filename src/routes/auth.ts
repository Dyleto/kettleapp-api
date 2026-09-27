import { Router } from 'express';
import { validate } from '../middleware/validate';
import { authLimiter } from '../middleware/rateLimits';
import { googleAuthSchema } from '../schemas/authSchema';
import {
  googleAuthCallback,
  googleOneTapCallback,
  getMe,
  logout,
  verifyInviteToken,
  devLogin,
} from '../controllers/authController';

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
