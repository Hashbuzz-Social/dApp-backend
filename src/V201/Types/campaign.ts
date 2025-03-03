export type CampaignTypes = 'HBAR' | 'FUNGIBLE';

export interface DraftCampaignBody {
  name: string;
  tweet_text: string;
  expected_engaged_users: number;
  campaign_budget: string;
  media: string[];
  type: CampaignTypes;
  fungible_token_id?: string;
}
