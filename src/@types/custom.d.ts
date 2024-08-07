import "express";
import { user_user } from "@prisma/client";

declare module "express" {
  export interface Request {
    currentUser?: Partial<user_user>;
    accountAddress?: string;
    deviceId ?:string
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

export type Token = { token_id: string; balance: number };

export type RewardsObj = {
  retweet_reward: number;
  like_reward: number;
  quote_reward: number;
  comment_reward: number;
};
export interface TokenTransfer {
  token_id: string;
  account: string;
  amount: number;
  is_approval: boolean;
}

export interface Transfer {
  account: string;
  amount: number;
  is_approval: boolean;
}

export interface Transaction {
  bytes: null;
  charged_tx_fee: number;
  consensus_timestamp: string;
  entity_id: null;
  max_fee: string;
  memo_base64: string;
  name: string;
  nft_transfers: any[]; // Adjust type if needed
  node: string;
  nonce: number;
  parent_consensus_timestamp: null;
  result: string;
  scheduled: boolean;
  staking_reward_transfers: any[]; // Adjust type if needed
  token_transfers: TokenTransfer[];
  transaction_hash: string;
  transaction_id: string;
  transfers: Transfer[];
  valid_duration_seconds: string;
  valid_start_timestamp: string;
}

export interface TransactionResponse {
  transactions: Transaction[];
}
