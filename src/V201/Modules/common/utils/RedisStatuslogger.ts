import { LYFCycleStages } from '@services/CampaignLifeCycleBase';
import RedisClient from '@services/redis-servie';
import appConfigManager from 'src/V201/appConfigManager';

// Helper method to update campaign status on Redis
export const logCampaignStatus = async (
  contractId: string,
  subTask?: string,
  isSuccess: boolean = false,
  LYFCycleStage: LYFCycleStages = LYFCycleStages.RUNNING
) => {
  const configs = await appConfigManager.getConfig();
  const redisClient = new RedisClient(configs.db.redisServerURI);
  await redisClient.updateCampaignCardStatus({
    card_contract_id: contractId,
    LYFCycleStage,
    isSuccess,
    subTask,
  });
};
