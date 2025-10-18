// Campaign Cost Calculator
export type CampaignType = 'Quest' | 'Awareness';
export type CostVector = { recent: number; likes: number };

export function calculateCost(type: CampaignType): CostVector {
  return type === 'Quest'
    ? { recent: 1, likes: 0 }
    : { recent: 3, likes: 1 };
}
