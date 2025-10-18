// Admission control logic for campaign scheduling
import { calculateCost, CampaignType } from './campaignCostCalculator';

export function canAdmitCampaign(
  type: CampaignType,
  recentRemaining: number,
  likesRemaining: number,
  capRemaining: number
): boolean {
  const cost = calculateCost(type);
  const postsEstimate = type === 'Quest' ? 200 : 300; // 2-3 pages typical

  if (recentRemaining < cost.recent) return false;
  if (likesRemaining < cost.likes) return false;
  if (capRemaining < postsEstimate) return false;
  return true;
}

// For batch admission: Q + 3A <= 60, A <= 25
export function checkWindowConstraints(Q: number, A: number): boolean {
  return Q + 3 * A <= 60 && A <= 25;
}
