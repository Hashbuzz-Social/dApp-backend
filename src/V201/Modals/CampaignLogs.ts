import { PrismaClient, Prisma } from '@prisma/client';

class CampaignLogsModel {
    private prisma: PrismaClient;

    constructor(prismaClient: PrismaClient) {
        this.prisma = prismaClient;
    }

    async getAllLogs() {
        try {
            return await this.prisma.campaignLog.findMany();
        } catch (error) {
            console.error('Error fetching campaign logs:', error);
            throw new Error('Could not fetch campaign logs.');
        }
    }

    async getLogById(id: bigint) {
        try {
            return await this.prisma.campaignLog.findUnique({
                where: { id },
            });
        } catch (error) {
            console.error('Error fetching campaign log by ID:', error);
            throw new Error('Could not fetch campaign log by ID.');
        }
    }

    async createLog(data: Prisma.CampaignLogCreateInput) {
        try {
            return await this.prisma.campaignLog.create({
                data,
            });
        } catch (error) {
            console.error('Error creating campaign log:', error);
            throw new Error('Could not create campaign log.');
        }
    }

    async updateLog(id: bigint, data:Prisma.CampaignLogUpdateInput) {
        try {
            return await this.prisma.campaignLog.update({
                where: { id },
                data,
            });
        } catch (error) {
            console.error('Error updating campaign log:', error);
            throw new Error('Could not update campaign log.');
        }
    }

    async deleteLog(id: bigint | number) {
        try {
            return await this.prisma.campaignLog.delete({
                where: { id },
            });
        } catch (error) {
            console.error('Error deleting campaign log:', error);
            throw new Error('Could not delete campaign log.');
        }
    }

    async getLogsByCampaignId(campaignId: bigint) {
        try {
            return await this.prisma.campaignLog.findMany({
                where: { campaign_id: campaignId },
            });
        } catch (error) {
            console.error('Error fetching campaign logs by campaign ID:', error);
            throw new Error('Could not fetch campaign logs by campaign ID.');
        }
    }

    getCampaignLogModel() {
        return this.prisma.campaignLog;
    }
}

export default CampaignLogsModel;