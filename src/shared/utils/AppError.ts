/**
 * Une erreur que l'API sait expliquer au client.
 *
 * Le gestionnaire global distingue celle-ci de tout le reste : ce qui est un
 * `AppError` a un message écrit pour un coach ou un client, en français, et
 * part tel quel. Ce qui n'en est pas un est un défaut du code — le message
 * pourrait décrire la base ou le chemin d'un fichier, il ne sort jamais.
 *
 * C'est pour cela que `isOperational` vaut toujours `true` ici : le champ ne
 * marque pas une catégorie d'erreurs à l'intérieur d'`AppError`, il marque
 * l'appartenance à la classe.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly status: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    // Une erreur prévue — « Séance introuvable » — et non un défaut du code.
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}
