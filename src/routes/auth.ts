import { Router } from "express";
import { validate } from "../middleware/validate";
import { googleAuthSchema } from "../schemas/authSchema";
import rateLimit from "express-rate-limit";
import {
  googleAuthCallback,
  getMe,
  logout,
  verifyInviteToken,
} from "../controllers/authController";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "Trop de tentatives de connexion.",
});

router.post(
  "/google-callback",
  authLimiter,
  validate(googleAuthSchema),
  googleAuthCallback,
);
router.get("/me", getMe);
router.post("/logout", logout);
router.get("/verify-invite-token", verifyInviteToken);

export default router;
