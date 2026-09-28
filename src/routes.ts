import express from 'express';
import coachRoutes from './modules/coach/coach.routes';
import adminRoutes from './modules/admin/admin.routes';
import clientRoutes from './modules/client/client.routes';
import accountRoutes from './modules/account/account.routes';
import { authMiddleware } from './shared/middleware/auth';

const router = express.Router();

// Toutes les routes doivent être identifiées
router.use(authMiddleware);

router.use('/admin', adminRoutes);
router.use('/coach', coachRoutes);
router.use('/client', clientRoutes);
// Le compte n'appartient à aucun rôle : on y arrive coach, client, ou les deux.
router.use('/account', accountRoutes);

export default router;
