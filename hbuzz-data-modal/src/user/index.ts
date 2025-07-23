export type user_roles =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'ANALYTICS'
  | 'MARKETING'
  | 'MANAGEMENT'
  | 'USER'
  | 'GUEST_USER';

export type UserConfig = {
  contractAddress: string;
  collecterAddress: string;
  campaignDuration: number;
  campaignRewardDuration: number;
};

export interface CurrentUser {
  id: number;
  username: string;
  name: string;
  is_active: boolean;
  personal_twitter_handle?: string;
  business_twitter_handle?: string;
  hedera_wallet_id: string;
  consent: boolean;
  available_budget: number;
  personal_twitter_id: number;
  total_rewarded: number;
  adminActive: boolean;
  profile_image_url?: string;
  role: user_roles;
  config: UserConfig;
}
