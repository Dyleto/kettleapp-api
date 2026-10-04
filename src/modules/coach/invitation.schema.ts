import { z } from 'zod';

/**
 * Combien de jours un lien d'invitation reste valide.
 *
 * Le contrôleur lisait `req.body.expiresIn || 7` sans schéma : un appel pouvait
 * demander `expiresIn: 99999` et repartir avec un lien de rattachement valide
 * deux siècles et demi. Le défaut de sept jours était le seul garde-fou, et
 * c'en était un pour l'oubli, pas pour l'abus.
 *
 * Le plancher est à six et non à un : le contrôleur réutilise tout jeton qui a
 * encore cinq jours devant lui, donc un lien d'un jour serait créé puis jamais
 * resservi — chaque clic en laisserait un nouveau derrière lui, et c'est
 * exactement la traînée de jetons que la réutilisation existe pour éviter.
 *
 * Le plafond à trente jours est un choix : un lien de rattachement circule par
 * message, et plus il vit longtemps plus il traîne dans un historique de
 * conversation.
 */
export const generateInvitationSchema = z.object({
  body: z.object({
    expiresIn: z.coerce
      .number({ message: 'La durée doit être un nombre de jours' })
      .int({ message: 'La durée doit être un nombre entier de jours' })
      .min(6, { message: 'La durée doit être d’au moins 6 jours' })
      .max(30, { message: 'La durée ne peut pas dépasser 30 jours' })
      .default(7),
  }),
});
