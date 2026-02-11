import { Router, Request, Response } from "express";
import User from "../models/User";
import { validate } from "../middleware/validate";
import { createUserSchema } from "../schemas/userSchema";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  const users = await User.find();
  res.json(users);
});

router.post(
  "/",
  validate(createUserSchema),
  async (req: Request, res: Response) => {
    const newUser = new User(req.body);
    const savedUser = await newUser.save();
    res.json(savedUser);
  },
);

export default router;
