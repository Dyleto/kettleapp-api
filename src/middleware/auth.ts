import { Request, Response, NextFunction } from "express";

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({ message: "Accès non autorisé" });
  }

  next();
};
