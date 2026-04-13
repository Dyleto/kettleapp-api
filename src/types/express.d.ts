import { ICoach } from "../models/Coach";
import { IClient } from "../models/Client";
import { IUser } from "../models/User";

declare global {
  namespace Express {
    interface Request {
      user?: IUser;
    }
    interface Locals {
      coach?: ICoach;
      client?: IClient;
    }
  }
}
export {};
