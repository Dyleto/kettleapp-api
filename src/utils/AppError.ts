export class AppError extends Error {
  public readonly statusCode: number;
  public readonly status: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    // isOperational = true signifie que c'est une erreur prévue (ex: mot de passe faux)
    // et pas un bug du code (ex: variable undefined)
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}
