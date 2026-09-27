import { Router } from 'express';
import User from '../models/User';
import { validate } from '../middleware/validate';
import { createUserSchema } from '../schemas/userSchema';
import { catchAsync } from '../utils/catchAsync';

const router = Router();

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
