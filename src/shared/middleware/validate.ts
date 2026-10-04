import { Request, Response, NextFunction } from 'express';
import { ZodType, ZodError } from 'zod';

/**
 * Valider une requête — et la remplacer par ce qui en est sorti.
 *
 * La version précédente analysait puis jetait le résultat. Les contrôleurs
 * lisaient donc `req.body` brut : la validation jugeait la requête sans jamais
 * la nettoyer, et deux choses en découlaient.
 *
 * Une requête pouvait porter n'importe quoi en plus. Zod retire les clés
 * inconnues, mais la copie nettoyée partait à la poubelle : `POST /users`
 * faisait `new User(req.body)` avec ce qui arrivait, et comme `isAdmin` est
 * déclaré sur le schéma Mongoose, tout utilisateur connecté pouvait
 * s'attribuer le drapeau administrateur. Vérifié, pas supposé — la sonde a
 * répondu `isAdmin: true`.
 *
 * Et chaque `.default()` et `.transform()` des schémas était du code mort.
 * `suggestedDays` porte un transform qui dédoublonne et trie les jours, avec
 * un commentaire expliquant pourquoi il a sa place là plutôt qu'à
 * l'affichage ; il n'avait jamais tourné une fois. Zod produisait `[0, 3]`
 * pendant que le contrôleur lisait `[3, 0, 3]`.
 *
 * La valeur validée est donc réécrite. À partir d'ici, un contrôleur qui lit
 * `req.body` lit quelque chose qui a correspondu à un schéma.
 */
export const validate = (schema: ZodType) => {
  /**
   * Nommé, et pas une flèche anonyme : `verifyRouteCoverage` parcourt la pile
   * des routeurs pour vérifier qu'aucune route lisant un corps ou un
   * paramètre n'a oublié son schéma, et il la reconnaît par ce nom. Trois
   * routes l'avaient oublié — dont `/auth/google-onetap` et
   * `/client/health-consent`.
   */
  return async function validateRequest(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const parsed = (await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      })) as {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };

      // Seulement ce que le schéma a décrit : un schéma qui ne dit rien de
      // `query` ne doit pas le vider.
      if (parsed.body !== undefined) req.body = parsed.body;
      if (parsed.params !== undefined)
        req.params = parsed.params as typeof req.params;
      if (parsed.query !== undefined)
        Object.assign(req.query, parsed.query as object);

      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          status: 'fail',
          errors: error.issues.map((issue) => ({
            // `path` vaut ['body', 'email'] ou ['params', 'id'] : le champ
            // est ce qui suit la section, et la section seule quand c'est
            // l'objet entier qui est en cause.
            field:
              issue.path.length > 1
                ? issue.path.slice(1).join('.')
                : issue.path.join('.'),
            message: issue.message,
          })),
        });
      }
      return next(error);
    }
  };
};
