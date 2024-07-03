// RedisClient.ts
import { createClient, RedisClientType } from 'redis';
import { LYFCycleStages } from './campaignLyfcycle-service';

interface RedisCardStatusUpdate {
    card_contract_id: string,
    LYFCycleStage: LYFCycleStages,
    subTask?: string,
    isSuccess: boolean,
}

export interface CampaignCardData {
    [key: string]: any; // Replace `any` with a more specific type if known
}

interface TaskStatus {
    isSuccess: boolean;
    timestamp: number;
}

class RedisClient {
    public client: RedisClientType;

    constructor() {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

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

    public async checkConnection() {
        try {
            await this.connectIfNeeded();
            await this.client.set('connection_test', 'ok');
            const result = await this.client.get('connection_test');
            if (result !== 'ok') throw new Error('Redis connection test failed');
            await this.client.del('connection_test');
            await this.client.set('server_run_at', new Date().toISOString());
        } catch (error) {
            throw new Error('Failed to connect to Redis');
        }
    }

    async create(key: string, value: string): Promise<void> {
        await this.connectIfNeeded();
        await this.client.set(key, value);
    }

    async read(key: string): Promise<string | null> {
        await this.connectIfNeeded();
        return this.client.get(key);
    }

    async update(key: string, value: string): Promise<void> {
        await this.connectIfNeeded();
        await this.client.set(key, value);
    }

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
            console.log(cardData);
            return cardData ? JSON.parse(cardData) : null;
        } catch (error) {
            console.error('Error reading campaign card status:', error);
            return null;
        }
    }
}

export default RedisClient;
