
import { Decimal } from "@prisma/client/runtime/library";
import createPrismaClient from "@shared/prisma";

/**
 * @description This will be used to get the reward details to show the user how much reward they can claim.
 * @param data  hedera_wallet_id of the user
 * @returns
 */
export const getRewardDetails = async (data: string) => {
    let prisma;

    try {
        // Input validation with more detailed checks
        if (!data) {
            console.log('getRewardDetails called with empty/null data');
            return [];
        }

        if (typeof data !== 'string') {
          console.log(
            'getRewardDetails called with non-string data:',
            typeof data,
            data
          );
          return [];
        }

        if (data.trim().length === 0) {
          console.log('getRewardDetails called with empty string');
          return [];
        }

        prisma = await createPrismaClient();

        // Find user with proper error handling
        const user = await prisma.user_user.findUnique({
            where: {
                hedera_wallet_id: data.trim(),
            },
        });

        // Check if user exists
        if (!user) {
            console.log(`User not found for hedera_wallet_id: ${data}`);
            return [];
        }

        if (!user.personal_twitter_id) {
            console.log(`User found but no personal_twitter_id for wallet: ${data}`);
            return [];
        }

        // Get engagement details with proper relations and limits
        const engagementDetails =
          await prisma.campaign_tweetengagements.findMany({
            where: {
              user_id: user.personal_twitter_id,
              payment_status: 'UNPAID',
              is_valid_timing: true, // CRITICAL: Only include engagements with valid timing
            },
            select: {
              engagement_type: true,
              tweet_id: true,
              id: true,
              campaign_twittercard: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  contract_id: true,
                  decimals: true,
                  fungible_token_id: true,
                  like_reward: true,
                  retweet_reward: true,
                  quote_reward: true,
                  comment_reward: true,
                },
              },
            },
            take: 1000, // Limit results to prevent memory issues
          });

        // Process engagement details safely
        const updateData = [];

        for (const engagement of engagementDetails) {
          // Skip if campaign_twittercard is null
          if (!engagement.campaign_twittercard) {
            continue;
          }

          const card = engagement.campaign_twittercard;

          // Define the response object type
          type CampaignTwitterCard = {
            like_reward: number;
            retweet_reward: number;
            quote_reward: number;
            comment_reward: number;
            engagement_type: string | null;
            token_id: string | null;
            id: string; // Convert bigint to string for JSON serialization
            name: string | null;
            type: string | null;
            contract_id: string | null;
            decimals: number | null; // Convert Decimal to number
          };

          const obj: CampaignTwitterCard = {
            like_reward: 0,
            retweet_reward: 0,
            quote_reward: 0,
            comment_reward: 0,
            engagement_type: engagement.engagement_type,
            token_id: card.fungible_token_id,
            id: card.id?.toString() || '', // Safely convert bigint to string
            name: card.name,
            type: card.type,
            contract_id: card.contract_id,
            decimals: card.decimals ? Number(card.decimals) : null, // Convert Decimal to number
          };

          // Set reward based on engagement type with null safety
          switch (engagement.engagement_type) {
            case 'Like':
              obj.like_reward = card.like_reward || 0;
              break;
            case 'Retweet':
              obj.retweet_reward = card.retweet_reward || 0;
              break;
            case 'Quote':
              obj.quote_reward = card.quote_reward || 0;
              break;
            case 'Reply':
              obj.comment_reward = card.comment_reward || 0;
              break;
            default:
              // Handle unknown engagement types gracefully
              break;
          }

          updateData.push(obj);
        }

        return updateData;

    } catch (error) {
        console.error('Error in getRewardDetails:', {
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : undefined,
            walletId: data,
        });

        // Return empty array instead of throwing to prevent crashes
        return [];
    } finally {
        // Ensure database connection is closed
        if (prisma) {
            try {
                await prisma.$disconnect();
            } catch (disconnectError) {
                console.error('Error disconnecting from database:', disconnectError);
            }
        }
    }
};




export * from "./on-card";
// export * from "./on-peronal-handle";

