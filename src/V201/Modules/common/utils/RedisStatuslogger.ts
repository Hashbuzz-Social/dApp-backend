import { getConfig } from '@appConfig';
import { LYFCycleStages } from '@services/CampaignLifeCycleBase';
import RedisClient from '@services/redis-service';


// Helper method to update campaign status on Redis
export const updateCampaignInMemoryStatus = async (
  contractId: string,
  subTask?: string,
  isSuccess = false,
  LYFCycleStage: LYFCycleStages = LYFCycleStages.RUNNING
) => {
  const configs = await getConfig();
  const redisClient = new RedisClient(configs.db.redisServerURI);
  await redisClient.updateCampaignCardStatus({
    card_contract_id: contractId,
    LYFCycleStage,
    isSuccess,
    subTask,
  });
};
