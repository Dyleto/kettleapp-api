import { Request, Response, NextFunction } from "express";

export const catchAsync = (fn: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Si la fonction retourne une promesse qui échoue, on choppe l'erreur (.catch)
    // et on la passe au middleware global (next)
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
