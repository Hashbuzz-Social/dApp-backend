import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicMessageQuery,
  TopicId,
  Client,
  PrivateKey,
  AccountId,
  Status,
  TopicInfoQuery,
  TopicInfo,
} from '@hashgraph/sdk';
import initHederaService from './hedera-service';
import createPrismaClient from '@shared/prisma';
import logger from 'jet-logger';

/**
 * Message types that can be submitted to HCS topics
 */
export enum HCSMessageType {
  CAMPAIGN_CREATED = 'CAMPAIGN_CREATED',
  CAMPAIGN_PUBLISHED = 'CAMPAIGN_PUBLISHED',
  CAMPAIGN_CLOSED = 'CAMPAIGN_CLOSED',
  ENGAGEMENT_TRACKED = 'ENGAGEMENT_TRACKED',
  REWARD_DISTRIBUTED = 'REWARD_DISTRIBUTED',
  USER_ACTION = 'USER_ACTION',
  TRANSACTION_RECORD = 'TRANSACTION_RECORD',
  RATE_UPDATED = 'RATE_UPDATED',
  BUDGET_REFUND = 'BUDGET_REFUND',
  ERROR_EVENT = 'ERROR_EVENT',
}

/**
 * Standard structure for HCS messages
 */
export interface HCSMessage {
  messageType: HCSMessageType;
  timestamp: string;
  version: string;
  userId?: bigint;
  campaignId?: bigint;
  transactionId?: string;
  data: Record<string, any>;
  signature?: string;
}

/**
 * Topic configuration for different message types
 */
export interface TopicConfig {
  id: string;
  name: string;
  description: string;
  messageTypes: HCSMessageType[];
  submitKey?: string;
  adminKey?: string;
  memo?: string;
}

/**
 * Hedera Consensus Service integration for HashBuzz
 * Provides immutable audit trails for campaign lifecycle, engagements, and transactions
 */
export class HederaConsensusService {
  private client!: Client;
  private operatorId!: AccountId;
  private operatorKey!: PrivateKey;
  private topics: Map<string, TopicId> = new Map();
  private initialized = false;

  constructor() {
    // Properties will be initialized in init()
  }

  /**
   * Initialize the HCS service with Hedera client
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const hederaService = await initHederaService();
      this.client = hederaService.hederaClient;
      this.operatorId = hederaService.operatorId;
      this.operatorKey = hederaService.operatorKey;

      // Load existing topics from database
      await this.loadExistingTopics();

      // Automatically create default topics if they don't exist
      await this.initializeDefaultTopics();

      this.initialized = true;
      logger.info('Hedera Consensus Service initialized successfully');
    } catch (error) {
      logger.err(`Failed to initialize HCS: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Create a new HCS topic
   */
  async createTopic(config: TopicConfig): Promise<string> {
    try {
      const transaction = new TopicCreateTransaction()
        .setTopicMemo(config.memo || config.description)
        .setAdminKey(this.operatorKey);

      // Set submit key if provided
      if (config.submitKey) {
        const submitKey = PrivateKey.fromString(config.submitKey);
        transaction.setSubmitKey(submitKey.publicKey);
      }

      const response = await transaction.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      const topicId = receipt.topicId;

      if (!topicId) {
        throw new Error('Failed to create topic - no topic ID returned');
      }

      const topicIdString = topicId.toString();

      // Store topic in database
      await this.storeTopicInDatabase(topicIdString, config);

      // Cache topic locally
      this.topics.set(config.name, topicId);

      logger.info(`HCS topic created successfully: ${topicIdString} (${config.name})`);
      return topicIdString;
    } catch (error) {
      logger.err(`Failed to create HCS topic: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Submit a message to an HCS topic
   */
  async submitMessage(
    topicName: string,
    message: HCSMessage,
    submitKey?: PrivateKey
  ): Promise<string> {
    try {
      const topicId = this.topics.get(topicName);
      if (!topicId) {
        throw new Error(`Topic not found: ${topicName}`);
      }

      const messageString = JSON.stringify({
        ...message,
        timestamp: new Date().toISOString(),
        version: '1.0',
      });

      const messageBytes = new Uint8Array(Buffer.from(messageString, 'utf-8'));

      const transaction = new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage(messageBytes);

      // Sign with submit key if provided
      if (submitKey) {
        transaction.sign(submitKey);
      }

      const response = await transaction.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      if (receipt.status !== Status.Success) {
        throw new Error(`Failed to submit message: ${receipt.status.toString()}`);
      }

      const transactionId = response.transactionId.toString();

      logger.info(`HCS message submitted successfully: ${transactionId} to topic ${topicName}`);
      return transactionId;
    } catch (error) {
      logger.err(`Failed to submit HCS message: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Query messages from an HCS topic
   */
  async queryMessages(
    topicName: string,
    startTime?: Date,
    endTime?: Date,
    limit?: number
  ): Promise<HCSMessage[]> {
    try {
      const topicId = this.topics.get(topicName);
      if (!topicId) {
        throw new Error(`Topic not found: ${topicName}`);
      }

      return new Promise((resolve, reject) => {
        const messages: HCSMessage[] = [];
        let messageCount = 0;
        const maxMessages = limit || 100;

        new TopicMessageQuery()
          .setTopicId(topicId)
          .setStartTime(startTime || new Date(Date.now() - 24 * 60 * 60 * 1000))
          .setEndTime(endTime || new Date())
          .subscribe(this.client, (message) => {
            try {
              if (messageCount >= maxMessages || !message) {
                return;
              }

              const messageData = JSON.parse(Buffer.from(message.contents).toString()) as HCSMessage;
              messages.push(messageData);
              messageCount++;

              if (messageCount >= maxMessages) {
                resolve(messages);
              }
            } catch (parseError) {
              logger.warn(`Failed to parse HCS message: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
            }
          }, (error) => {
            reject(error);
          });

        // Set a timeout to resolve if we don't get enough messages
        setTimeout(() => {
          resolve(messages);
        }, 5000);
      });
    } catch (error) {
      logger.err(`Failed to query HCS messages: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get topic information
   */
  async getTopicInfo(topicName: string): Promise<TopicInfo> {
    try {
      const topicId = this.topics.get(topicName);
      if (!topicId) {
        throw new Error(`Topic not found: ${topicName}`);
      }

      const query = new TopicInfoQuery().setTopicId(topicId);
      return await query.execute(this.client);
    } catch (error) {
      logger.err(`Failed to get topic info: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Initialize default topics for HashBuzz
   */
  async initializeDefaultTopics(): Promise<void> {
    const defaultTopics: TopicConfig[] = [
      {
        id: 'campaign-lifecycle',
        name: 'campaign-lifecycle',
        description: 'Campaign creation, publishing, and closing events',
        messageTypes: [
          HCSMessageType.CAMPAIGN_CREATED,
          HCSMessageType.CAMPAIGN_PUBLISHED,
          HCSMessageType.CAMPAIGN_CLOSED,
          HCSMessageType.RATE_UPDATED,
          HCSMessageType.BUDGET_REFUND,
        ],
        memo: 'HashBuzz Campaign Lifecycle Events',
      },
      {
        id: 'engagement-tracking',
        name: 'engagement-tracking',
        description: 'Twitter engagement metrics and verification',
        messageTypes: [HCSMessageType.ENGAGEMENT_TRACKED],
        memo: 'HashBuzz Engagement Tracking Data',
      },
      {
        id: 'reward-distribution',
        name: 'reward-distribution',
        description: 'User reward calculations and distributions',
        messageTypes: [HCSMessageType.REWARD_DISTRIBUTED],
        memo: 'HashBuzz Reward Distribution Records',
      },
      {
        id: 'user-actions',
        name: 'user-actions',
        description: 'Important user account actions and security events',
        messageTypes: [HCSMessageType.USER_ACTION],
        memo: 'HashBuzz User Action Audit Trail',
      },
      {
        id: 'transaction-records',
        name: 'transaction-records',
        description: 'Blockchain transaction records and confirmations',
        messageTypes: [HCSMessageType.TRANSACTION_RECORD],
        memo: 'HashBuzz Transaction Records',
      },
      {
        id: 'error-logs',
        name: 'error-logs',
        description: 'Critical system errors and recovery actions',
        messageTypes: [HCSMessageType.ERROR_EVENT],
        memo: 'HashBuzz Error Event Logs',
      },
    ];

    for (const topicConfig of defaultTopics) {
      try {
        // Check if topic already exists
        if (!this.topics.has(topicConfig.name)) {
          await this.createTopic(topicConfig);
        }
      } catch (error) {
        logger.warn(`Failed to create default topic ${topicConfig.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Store topic configuration in database
   */
  private async storeTopicInDatabase(topicId: string, config: TopicConfig): Promise<void> {
    try {
      const prisma = await createPrismaClient();
      const hederaService = await initHederaService();

      await prisma.hcsTopics.create({
        data: {
          topicId: topicId,
          name: config.name,
          description: config.description,
          messageTypes: JSON.stringify(config.messageTypes),
          network: hederaService.network,
          createdBy: this.operatorId.toString(),
          memo: config.memo,
          isActive: true,
        },
      });
    } catch (error) {
      logger.err(`Failed to store topic in database: ${error instanceof Error ? error.message : String(error)}`);
      // Don't throw here - topic creation should succeed even if DB storage fails
    }
  }

  /**
   * Load existing topics from database
   */
  private async loadExistingTopics(): Promise<void> {
    try {
      const prisma = await createPrismaClient();
      const hederaService = await initHederaService();

      const topics = await prisma.hcsTopics.findMany({
        where: {
          network: hederaService.network,
          isActive: true,
        },
      });

      for (const topic of topics) {
        this.topics.set(topic.name, TopicId.fromString(topic.topicId));
        logger.info(`Loaded existing HCS topic: ${topic.name} (${topic.topicId})`);
      }
    } catch (error) {
      logger.warn(`Failed to load existing topics: ${error instanceof Error ? error.message : String(error)}`);
      // Continue initialization even if we can't load existing topics
    }
  }

  /**
   * Get all available topics
   */
  getAvailableTopics(): string[] {
    return Array.from(this.topics.keys());
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// Singleton instance
let hcsInstance: HederaConsensusService | null = null;

/**
 * Get initialized HCS service instance
 */
export const getHCSService = async (): Promise<HederaConsensusService> => {
  if (!hcsInstance) {
    hcsInstance = new HederaConsensusService();
    await hcsInstance.init();
  }
  return hcsInstance;
};

export default HederaConsensusService;
