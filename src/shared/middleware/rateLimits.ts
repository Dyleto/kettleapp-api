import type { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/**
 * À qui appartient un quota.
 *
 * Compter par adresse punit les mauvaises personnes. Deux coachs qui
 * travaillent depuis le wifi d'une même salle partagent une adresse, donc
 * partageaient un quota de 100 requêtes — et le second à l'épuiser était
 * bloqué par le travail du premier. Une fois connecté, la session dit qui
 * demande, et c'est à celui-là que le quota appartient.
 *
 * `ipKeyGenerator` sert au cas anonyme plutôt que `req.ip` brut : il normalise
 * l'IPv6, où un seul client tient un /64 entier et contournerait sinon
 * n'importe quel plafond en changeant le dernier bloc.
 */
const perUserOrIp = (req: Request): string =>
  req.session?.userId
    ? `u:${req.session.userId}`
    : ipKeyGenerator(req.ip ?? '');

/**
 * Un quota, construit d'une seule façon.
 *
 * Tous les limiteurs de l'application partagent la même notion de « à qui
 * appartient ce quota » et la même exemption des préflights ; seuls la
 * fenêtre, le plafond et le message changent. Exportée pour qu'une
 * vérification puisse en construire un avec un plafond de deux et éprouver la
 * logique de comptage réellement livrée, pas une copie.
 */
export const makeLimiter = (opts: {
  windowMs: number;
  limit: number;
  message: string;
}) =>
  rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: perUserOrIp,
    // Les préflights ne consomment rien, et les bloquer transforme un quota
    // en « erreur CORS » inexpliquée dans le navigateur, qui masque la vraie
    // cause.
    skip: (req: Request) => req.method === 'OPTIONS',
    ...opts,
  });

/**
 * Le plafond de l'usage ordinaire.
 *
 * Il était de 100 par quart d'heure pour toute l'API, ce que l'atelier seul
 * peut épuiser : il s'enregistre tout seul, et un changement de structure —
 * ajouter un bloc, un exercice, réordonner — part immédiatement, sans
 * temporisation. Un coach qui construit cinq séances de trois blocs et trois
 * exercices produit une soixantaine d'écritures avant même d'avoir affiché une
 * page, et arriver au bout signifie être bloqué un quart d'heure avec des
 * modifications non enregistrées. L'application a justement un écran pour cet
 * échec — un quota ne devrait pas être ce qui le déclenche.
 *
 * 40 par minute sur une fenêtre d'un quart d'heure laisse une large marge à la
 * main la plus rapide et arrête net un script.
 */
export const globalLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  message: 'Trop de requêtes, veuillez réessayer dans quelques minutes.',
});

/**
 * La connexion, c'est-à-dire l'endroit où l'on tente sa chance.
 *
 * Volontairement bien plus serré que le reste : dix tentatives par heure est
 * généreux pour qui possède le compte, et inutile pour qui ne le possède pas.
 */
export const authLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: 'Trop de tentatives de connexion.',
});

/**
 * Frapper un lien d'invitation.
 *
 * Chaque appel peut créer un jeton qui donne accès à la liste d'un coach : ça
 * mérite son propre plafond — et aucun coach n'invite trente clients en une
 * heure.
 */
export const invitationLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  message: "Trop de liens d'invitation générés, réessayez plus tard.",
});
