import { Request, Response } from "express";
import { createUserService, getUsersService } from "../services/userService";
import { catchAsync } from "../utils/catchAsync";

export const getUsers = catchAsync(async (_req: Request, res: Response) => {
  const users = await getUsersService();
  res.json(users);
});

export const createUser = catchAsync(async (req: Request, res: Response) => {
  const user = await createUserService(req.body);
  res.json(user);
});
