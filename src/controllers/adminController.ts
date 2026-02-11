import { Request, Response } from "express";
import User from "../models/User";
import Coach from "../models/Coach";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";

export const createCoach = catchAsync(async (req: Request, res: Response) => {
  const { email, firstName, lastName } = req.body;

  // 2. Vérifier si l'utilisateur existe déjà
  let user = await User.findOne({ email });

  if (user) {
    // Si l'utilisateur existe, on vérifie s'il est déjà coach
    const existingCoach = await Coach.findOne({ userId: user._id });
    if (existingCoach) {
      throw new AppError("Cet utilisateur est déjà coach", 409);
    }
  } else {
    // Sinon on le crée
    user = await User.create({
      email,
      firstName,
      lastName,
    });
  }

  // 3. Créer le profil Coach
  const coach = await Coach.create({
    userId: user._id,
  });

  res.status(201).json({
    status: "success",
    message: "Coach créé avec succès",
    coach,
    user,
  });
});
