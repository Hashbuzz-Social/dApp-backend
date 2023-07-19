import "express";
import { user_user } from "@prisma/client";

declare module "express" {
  export interface Request {
    currentUser?: Partial<user_user>;
    accountAddress?: string;
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
  entityType: string;
  entityId?: string;
  amount: {
    value: number;
    fee: number;
    total: number;
  };
};

export type Payload = {
  url: string;
  data: any;
};

export type GenerateAstPayload = {
  payload: Payload;
  clientPayload:object
  signatures: {
    server: string;
    wallet: {
      accountId: string;
      value: string;
    };
  };
};
