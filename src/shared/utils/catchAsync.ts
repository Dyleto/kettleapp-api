import { Request, Response, NextFunction } from 'express';

type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

/**
 * Faire remonter au gestionnaire d'erreurs ce qu'une promesse rejette.
 *
 * Express n'attrape que ce qui est lancé de façon synchrone. Un `await` qui
 * échoue dans un contrôleur asynchrone produit donc une rejection non gérée :
 * la requête reste suspendue jusqu'au délai du client, aucune réponse n'est
 * envoyée, et rien n'apparaît dans le journal des erreurs.
 *
 * Envelopper le contrôleur évite d'écrire un `try/catch` dans chacun — et
 * surtout d'en oublier un, ce qui ne se voit que le jour où cette route-là
 * échoue.
 */
export const catchAsync = (fn: AsyncHandler) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
