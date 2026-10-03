import { z } from 'zod';
import { Types } from 'mongoose';

/**
 * Un identifiant, tel qu'il sort.
 *
 * En base c'est un `ObjectId`, sur le réseau c'est une chaîne de
 * vingt-quatre caractères. `JSON.stringify` faisait déjà la conversion sans
 * le dire ; le schéma la fait, et le type qu'on en dérive annonce donc une
 * chaîne — ce que le client reçoit réellement.
 */
export const id = z
  .union([z.string(), z.instanceof(Types.ObjectId)])
  .transform((value) => value.toString());

/**
 * Une date, telle qu'elle sort.
 *
 * Même histoire : `Date` en mémoire, chaîne ISO sur le réseau. Les types du
 * front annonçaient `Date` et recevaient une chaîne — un mensonge sans
 * conséquence tant que chaque appelant écrivait `new Date(...)`, ce qu'ils
 * font tous, mais un `.getTime()` posé un jour sur l'un de ces champs aurait
 * planté à l'exécution sans que TypeScript ne dise rien.
 */
export const isoDate = z
  .union([z.string(), z.date()])
  .transform((value) => (value instanceof Date ? value.toISOString() : value));

/**
 * Un champ facultatif que Mongoose matérialise en `{}` quand il est vide.
 *
 * Un « chemin imbriqué » — un objet littéral dans un schéma, sans
 * `new Schema` — n'est jamais absent sur un document hydraté : Mongoose le
 * rend comme un objet vide. `metrics` et `customMetric` sont dans ce cas, et
 * un `.optional()` seul voyait donc `{}` et réclamait ses champs requis.
 *
 * Mesuré : sans ceci, `GET /api/client/history` répondait 500 sur tout bilan
 * sans l'ancien ressenti à cinq axes — c'est-à-dire sur presque tous. Le
 * défaut n'apparaissait pas sur un objet ordinaire, seulement sur un vrai
 * document, ce qui est précisément ce que la production manipule.
 *
 * `feedback`, `performed` et `healthConsent` n'en ont pas besoin : ils sont
 * déclarés avec leur propre schéma, et restent `undefined`.
 *
 * Le test porte sur les valeurs et non sur les clés : Mongoose définit les
 * clés d'un chemin imbriqué comme des accesseurs, et `Object.keys` en rend
 * donc cinq sur un `metrics` que `JSON.stringify` écrit `{}`. Compter les
 * clés ne voyait aucun des deux cas ; regarder si tout vaut `undefined` voit
 * les deux.
 */
const vide = (value: unknown) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.values(value as object).every((v) => v === undefined);

export const vacant = <S extends z.ZodType>(schema: S) =>
  z.preprocess((value) => (vide(value) ? undefined : value), schema.optional());

/**
 * Une mesure que Kettle ne connaît pas — « 400 m », « 20 cal ».
 *
 * L'unité est une chaîne libre : enfermer les distances et les calories dans
 * une énumération reviendrait à refuser au coach tout ce qui n'y figure pas.
 */
export const customMetric = z.object({
  value: z.number(),
  unit: z.string(),
});

export type CustomMetricPayload = z.infer<typeof customMetric>;
