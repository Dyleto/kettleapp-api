import { Router } from 'express';
import User from '../models/User';
import { validate } from '../middleware/validate';
import { createUserSchema } from '../schemas/userSchema';
import { catchAsync } from '../utils/catchAsync';
import { requireAdmin } from '../middleware/roles';

const router = Router();

/**
 * Administrator only, and it should have been from the start.
 *
 * `/api` requires a session, and that was the whole protection: any signed-in
 * client could call `GET /api/users` and read every email on the platform,
 * and `POST /api/users` ran `new User(req.body)` — which, with `isAdmin`
 * declared on the Mongoose schema and the validated body thrown away, handed
 * out the admin flag to whoever asked. Both verified, not assumed.
 *
 * The front end calls neither route. They are kept, behind the right guard,
 * rather than deleted, because deleting is the owner's call — but nothing
 * uses them today.
 */
router.use(requireAdmin);

router.get(
  '/',
  catchAsync(async (_req, res) => {
    const users = await User.find();
    res.json(users);
  })
);

router.post(
  '/',
  validate(createUserSchema),
  catchAsync(async (req, res) => {
    const newUser = new User(req.body);
    const savedUser = await newUser.save();
    res.json(savedUser);
  })
);

export default router;
