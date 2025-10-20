import { PrismaClient, Prisma, campaignstatus } from '@prisma/client';
import logger from 'src/config/logger';

class CampaignTwitterCardModel {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  async getAllCampaigns() {
    try {
      return await this.prisma.campaign_twittercard.findMany();
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      throw new Error('Could not fetch campaigns.');
    }
  }

  async getCampaignById(id: bigint) {
    try {
      return await this.prisma.campaign_twittercard.findUnique({
        where: { id },
      });
    } catch (error) {
      console.error('Error fetching campaign by ID:', error);
      throw new Error('Could not fetch campaign by ID.');
    }
  }

  async createCampaign(data: Prisma.campaign_twittercardCreateInput) {
    try {
      return await this.prisma.campaign_twittercard.create({
        data,
      });
    } catch (error) {
      console.error('Error creating campaign:', error);
      throw new Error('Could not create campaign.');
    }
  }

  async updateCampaign(
    id: bigint,
    data: Prisma.campaign_twittercardUpdateInput
  ) {
    try {
      return await this.prisma.campaign_twittercard.update({
        where: { id },
        data,
      });
    } catch (error) {
      console.error('Error updating campaign:', error);
      throw new Error('Could not update campaign.');
    }
  }

  async deleteCampaign(id: bigint | number) {
    try {
      return await this.prisma.campaign_twittercard.delete({
        where: { id },
      });
    } catch (error) {
      console.error('Error deleting campaign:', error);
      throw new Error('Could not delete campaign.');
    }
  }

  async upsertCampaign(
    data: Prisma.campaign_twittercardCreateInput,
    id?: number | bigint
  ) {
    try {
      if (id === undefined) {
        throw new Error('ID is required for upsert operation.');
      }
      return await this.prisma.campaign_twittercard.upsert({
        where: { id },
        update: data,
        create: data,
      });
    } catch (error) {
      console.error('Error upserting campaign:', error);
      throw new Error('Could not upsert campaign.');
    }
  }

  async getCampaignByTweetId(tweetId: string) {
    try {
      return await this.prisma.campaign_twittercard.findFirst({
        where: { tweet_id: tweetId },
      });
    } catch (error) {
      console.error('Error fetching campaign by tweet ID:', error);
      throw new Error('Could not fetch campaign by tweet ID.');
    }
  }

  async getCampaignCountByStatus(
    status: campaignstatus,
    owner_id?: bigint | number
  ) {
    try {
      const whereClause: any = { card_status: status };
      if (owner_id !== undefined) {
        whereClause.owner_id = owner_id;
      }
      return await this.prisma.campaign_twittercard.count({
        where: whereClause,
      });
    } catch (error) {
      console.error('Error fetching campaign count by status:', error);
      throw new Error('Could not fetch campaign count by status.');
    }
  }

  async getCampaignsWithUserData(
    cardId: number | bigint
  ): Promise<Prisma.campaign_twittercardGetPayload<{
    include: {
      user_user: true;
    };
  }> | null> {
    try {
      return await this.prisma.campaign_twittercard.findUnique({
        where: {
          id: cardId,
        },
        include: {
          user_user: true,
        },
      });
    } catch (error) {
      logger.err('Error fetching campaigns with user data:' + error);
      throw new Error('Could not fetch campaigns with user data.');
    }
  }

  async getCampaignsWithOwnerData(cardId: bigint | number) {
    try {
      return await this.prisma.campaign_twittercard.findUnique({
        where: { id: cardId },
        include: {
          user_user: true,
        },
      });
    } catch (error) {
      console.error('Error fetching campaigns with owner data:', error);
      throw new Error('Could not fetch campaigns with owner data.');
    }
  }

  getCampaignTwitterCardModel() {
    return this.prisma.campaign_twittercard;
  }

  async getQuestCampaignWithEngagements(questId: bigint) {
    try {
      return await this.prisma.campaign_twittercard.findUnique({
        where: { id: questId },
        select: {
          id: true,
          correct_answer: true,
          campaign_budget: true,
          campaign_type: true,
          campaign_tweetengagements: {
            select: {
              id: true,
              user_id: true,
              engagement_type: true,
              is_bot_engagement: true,
              payment_status: true,
              content: true,
            },
          },
        },
      });
    } catch (error) {
      logger.err('Error fetching quest campaign with engagements:' + error);
      throw new Error('Could not fetch quest campaign with engagements.');
    }
  }
}

export default CampaignTwitterCardModel;
