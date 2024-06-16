// RedisCRUD.ts

import { createClient, RedisClientType } from 'redis';
import util from "util"
import { LYFCycleStages } from './campaignLyfcycle-service';
import moment from 'moment';


interface CampaignLyfCycle {
    isCreaeted?: boolean,
    adminReview?: boolean,
    contractAccountCreated?: boolean,
}

interface RedisCardStatusUpdate {
    card_contract_id: string,
    LYFCycleStage: LYFCycleStages,
    subTask?: string
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
        /** For live server */

        // this.client = createClient({
        //     url: 'redis://alice:foobared@awesome.redis.server:6380'
        // });

        this.client = createClient(); // Initialize Redis client
        this.client.on('error', (err) => console.error('Redis Client Error', err));
    }

    // Create a new record
    async create(key: string, value: string): Promise<void> {
        await this.client.set(key, value);
    }

    // Read a record by key
    async read(key: string): Promise<string | null> {
        const getAsync = util.promisify(this.client.get).bind(this.client);
        return await getAsync(key);
    }

    // Update a record by key
    async update(key: string, value: string): Promise<void> {
        await this.client.set(key, value);
    }

    // Delete a record by key
    async delete(key: string): Promise<void> {
        await this.client.del(key);
    }

    // public async updateCmapignCardStatus(params: RedisCardStatusUpdate) {
    //     const cardData = await this.read(params.card_contract_id)
    //     if (cardData) {
    //         const data = JSON.parse(cardData);
    //         data[params.LYFCycleStage] = params.subTask ? {
    //             [params.subTask]: {
    //                 isSuccess: params.isSuccess,
    //                 timestamp: new Date().getTime()
    //             }
    //         } : {
    //             isSuccess: params.isSuccess,
    //             timestamp: new Date().getTime()
    //         }
    //         await this.update(params.card_contract_id, JSON.stringify(data))
    //     } else {
    //         const data = {
    //             [params.LYFCycleStage]: params.subTask ? {
    //                 [params.subTask]: {
    //                     isSuccess: params.isSuccess,
    //                     timestamp: new Date().getTime()
    //                 }
    //             } : {
    //                 isSuccess: params.isSuccess,
    //                 timestamp: new Date().getTime()
    //             }
    //         }
    //         await this.create(params.card_contract_id, JSON.stringify(data))
    //     }
    // }

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
