import { createClient, RedisClientType } from 'redis';
import { LYFCycleStages } from './campaignLyfcycle-service';

interface RedisCardStatusUpdate {
    card_contract_id: string,
    LYFCycleStage: LYFCycleStages,
    subTask?: string,
    isSuccess: boolean,
}

interface CampaignCardData {
    [key: string]: any; // Replace `any` with a more specific type if known
}

interface TaskStatus {
    isSuccess: boolean;
    timestamp: number;
}

class RedisClient {
    private client: RedisClientType;

    constructor() {
        // URL for Redis running in a Docker container on localhost
        const redisUrl = 'redis://localhost:6379';

        this.client = createClient({ url: redisUrl });
        this.client.on('error', (err) => {
            console.error('Redis Client Error', err);
        });
    }

    private async connectIfNeeded() {
        if (!this.client.isOpen) {
            await this.client.connect();
        }
    }

    // Create a new record
    async create(key: string, value: string): Promise<void> {
        await this.connectIfNeeded();
        await this.client.set(key, value);
    }

    // Read a record by key
    async read(key: string): Promise<string | null> {
        await this.connectIfNeeded();
        return this.client.get(key);
    }

    // Update a record by key
    async update(key: string, value: string): Promise<void> {
        await this.connectIfNeeded();
        await this.client.set(key, value);
    }

    // Delete a record by key
    async delete(key: string): Promise<void> {
        await this.connectIfNeeded();
        await this.client.del(key);
    }

    public async updateCampaignCardStatus(params: RedisCardStatusUpdate) {
        try {
            const cardData = await this.read(params.card_contract_id);
            const data = cardData ? JSON.parse(cardData) : {};
            this.updateData(data, params);
            await this.update(params.card_contract_id, JSON.stringify(data));
        } catch (error) {
            console.error('Error updating campaign card status:', error);
        }
    }

    private updateData(data: CampaignCardData, params: RedisCardStatusUpdate) {
        const taskData: TaskStatus = {
            isSuccess: params.isSuccess,
            timestamp: new Date().getTime()
        };

        if (params.subTask) {
            data[params.LYFCycleStage] = {
                ...(data[params.LYFCycleStage] || {}),
                [params.subTask]: taskData
            };
        } else {
            data[params.LYFCycleStage] = taskData;
        }
    }

    public async readCampaignCardStatus(card_contract_id: string): Promise<CampaignCardData | null> {
        try {
            const cardData = await this.read(card_contract_id);
            return cardData ? JSON.parse(cardData) : null;
        } catch (error) {
            console.error('Error reading campaign card status:', error);
            return null;
        }
    }
}

export default RedisClient;
