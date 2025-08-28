// Extend Express Request to include pagination for campaign routes
import 'express';

declare module 'express' {
  interface Request {
    pagination?: {
      page: number;
      limit: number;
    };
  }
}
import "express";
import { user_user } from "@prisma/client";

declare module "express" {
  export interface Request {
    csrfToken?: () => string;
    currentUser?: Partial<user_user>;
    accountAddress?: string;
    deviceId?: string
    token?: string;
    ipAddress?: string | string[];
    userAgent?: string;
    userId?: number;
  }
}

export type twitterStatus =
  | "Rejected"
  | "Pending"
  | "Running"
  | "Completed"
  | "Deleted";
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
  clientPayload: object;
  signatures: {
    server: string;
    wallet: {
      accountId: string;
      value: string;
    };
  };
};


export type GenerateAstPayloadV2 = {
  payload: Payload;
  signatures: {
    server: string;
    wallet: {
      accountId: string;
      signature: string;
    };
  };
};

export type Token = { token_id: string; balance: number };

export type RewardsObj = {
  retweet_reward: number;
  like_reward: number;
  quote_reward: number;
  comment_reward: number;
};


