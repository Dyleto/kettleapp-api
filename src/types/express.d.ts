import { ICoach } from "../models/Coach";
import { IUser } from "../models/User";

declare global {
  namespace Express {
    interface Request {
      user?: IUser;
    }
    interface Locals {
      coach?: ICoach;
    }
  }
}
export {};
