import "express";

interface UserData {
  key: string | null;
  user_id: bigint;
  created: Date | null;
  user_user: Partial<{
    id: bigint;
    hedera_wallet_id: string | null;
    username: string;
    available_budget:number,
    first_name: string;
    last_login: Date | null;
    last_name: string;
    twitter_access_token: string | null;
    twitter_access_token_secret: string | null;
    personal_twitter_handle: string | null;
    business_twitter_access_token: string | null;
    business_twitter_access_token_secret: string | null;
    business_twitter_handle: string | null;
    consent: boolean | null;
    is_staff: boolean | null;
    is_superuser: boolean | null;
  }>;
}

declare module "express" {
  export interface Request {
    currentUser?: UserData;
  }
}

export type twitterStatus = 'Rejected' | 'Pending' | 'Running' | 'Completed'| 'Deleted';