// RedisCRUD.ts

import { createClient, RedisClientType } from 'redis';
import util from "util"


interface CampaignLyfCycle {
    isCreaeted?: boolean,
    adminReview?:boolean,
    contractAccountCreated?: boolean,

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
}

export default RedisClient;
