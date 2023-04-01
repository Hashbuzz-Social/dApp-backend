import "express";
import { user_user } from "@prisma/client";

declare module "express" {
  export interface Request {
    currentUser?: Partial<user_user>;
  }
}

export type twitterStatus = "Rejected" | "Pending" | "Running" | "Completed" | "Deleted";
export enum user_roles {
  "SUPER_ADMIN",
  "ADMIN",
  "ANALYTICS",
  "MARKETING",
  "MANAGEMENT",
  "USER",
  "GUEST_USER",
}

export type CreateTranSactionEntity = {
  entityType:string,
  entityId?:string,
  amount:{
    value:number,
    fee:number,
    total:number
  }
}