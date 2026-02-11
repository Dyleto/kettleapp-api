import { Request, Response, NextFunction } from "express";
import User from "../models/User";
import Coach from "../models/Coach";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";

// Vérifie si l'utilisateur est Admin
export const requireAdmin = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.session.userId;

    const user = await User.findById(userId);

    if (!user || !user.isAdmin) {
      throw new AppError("Accès refusé : Administrateur requis", 403);
    }

    next();
  },
);

// Vérifie si l'utilisateur est Coach
export const requireCoach = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.session.userId;

    // On cherche si un profil Coach est associé à cet User
    const coach = await Coach.findOne({ userId });

    if (!coach) {
      throw new AppError("Accès refusé : Espace Coach uniquement", 403);
    }

    res.locals.coach = coach;

    next();
  },
);
