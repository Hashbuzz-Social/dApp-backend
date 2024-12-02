import { user_user, user_roles } from '@prisma/client';
import createPrismaClient from '@shared/prisma';


export class User {
    id: bigint;
    accountAddress: string;
    last_login?: Date;
    name?: string;
    profile_image_url: string;
    is_active: boolean;
    date_joined: Date;
    personal_twitter_handle?: string;
    business_twitter_handle?: string;
    consent: boolean;
    available_budget: number;
    twitter_access_token?: string;
    twitter_access_token_secret?: string;
    business_twitter_access_token?: string;
    business_twitter_access_token_secret?: string;
    personal_twitter_id?: string;
    total_rewarded: number;
    role: user_roles;
    hash?: string;
    salt?: string;
    hedera_wallet_id: string;
    whitelistUser?: boolean;

    constructor(user: user_user) {
        this.id = user.id;
        this.accountAddress = user.accountAddress;
        this.last_login = user.last_login;
        this.name = user.name;
        this.profile_image_url = user.profile_image_url;
        this.is_active = user.is_active;
        this.date_joined = user.date_joined;
        this.personal_twitter_handle = user.personal_twitter_handle;
        this.business_twitter_handle = user.business_twitter_handle;
        this.consent = user.consent;
        this.available_budget = user.available_budget;
        this.twitter_access_token = user.twitter_access_token;
        this.twitter_access_token_secret = user.twitter_access_token_secret;
        this.business_twitter_access_token = user.business_twitter_access_token;
        this.business_twitter_access_token_secret = user.business_twitter_access_token_secret;
        this.personal_twitter_id = user.personal_twitter_id;
        this.total_rewarded = user.total_rewarded;
        this.role = user.role;
        this.hash = user.hash;
        this.salt = user.salt;
        this.hedera_wallet_id = user.hedera_wallet_id;
        this.whitelistUser = user.whitelistUser;
    }

    private static prisma = async () => await createPrismaClient();

    static async findById(id: bigint): Promise<User | null> {
        const user = await this.prisma().user_user.findUnique({ where: { id } });
        return user ? new User(user) : null;
    }

    static async findAll(): Promise<User[]> {
        const users = await this.prisma.user_user.findMany();
        return users.map(user => new User(user));
    }

    static async create(data: Omit<user_user, 'id'>): Promise<User> {
        const user = await this.prisma.user_user.create({ data: this.validateData(data) as user_user });
        return new User(user);
    }

    static async update(id: bigint, data: Partial<user_user>): Promise<User | null> {
        const user = await this.prisma.user_user.update({ where: { id }, data: this.validateData(data) });
        return user ? new User(user) : null;
    }

    static async delete(id: bigint): Promise<void> {
        await this.prisma.user_user.delete({ where: { id } });
    }

    private static validateData(data: Partial<user_user>): Partial<user_user> {
        // Add validation logic here
        if (data.accountAddress && typeof data.accountAddress !== 'string') {
            throw new Error('Invalid accountAddress');
        }
        if (data.profile_image_url && typeof data.profile_image_url !== 'string') {
            throw new Error('Invalid profile_image_url');
        }
        if (data.is_active !== undefined && typeof data.is_active !== 'boolean') {
            throw new Error('Invalid is_active');
        }
        if (data.consent !== undefined && typeof data.consent !== 'boolean') {
            throw new Error('Invalid consent');
        }
        if (data.available_budget !== undefined && typeof data.available_budget !== 'number') {
            throw new Error('Invalid available_budget');
        }
        if (data.total_rewarded !== undefined && typeof data.total_rewarded !== 'number') {
            throw new Error('Invalid total_rewarded');
        }
        if (data.role && !Object.values(user_roles).includes(data.role)) {
            throw new Error('Invalid role');
        }
        // Add more validation as needed
        return data;
    }
}