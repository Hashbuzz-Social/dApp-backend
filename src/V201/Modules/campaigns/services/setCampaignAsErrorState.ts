import { campaign_twittercard, campaignstatus } from '@prisma/client';
import logger from 'jet-logger';
import JSONBigInt from 'json-bigint';

import createPrismaClient from '@shared/prisma';
import CampaignLogsModel from '@V201/Modals/CampaignLogs';
import CampaignTwitterCardModel from '@V201/Modals/CampaignTwitterCard';

type SetCampaignErrorParams = {
	campaignId: number | bigint;
	reason: string;
	error?: unknown;
	requestId?: string;
};

const generateRequestId = () =>
	`v201-campaign-error-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const toBigInt = (value: number | bigint) =>
	typeof value === 'bigint' ? value : BigInt(value);

const buildLogPayload = (
	campaign: campaign_twittercard,
	params: SetCampaignErrorParams,
	normalizedError: string,
	requestId: string
) => ({
	requestId,
	reason: params.reason,
	previousStatus: campaign.card_status,
	error: normalizedError,
});

const containsBigInt = (value: unknown, seen = new WeakSet<object>()): boolean => {
	if (typeof value === 'bigint') {
		return true;
	}

	if (!value || typeof value !== 'object') {
		return false;
	}

	if (seen.has(value)) {
		return false;
	}

	seen.add(value);

	if (Array.isArray(value)) {
		return value.some((item) => containsBigInt(item, seen));
	}

	const record = value as Record<string, unknown>;

	for (const key of Object.keys(record)) {
		if (containsBigInt(record[key], seen)) {
			return true;
		}
	}

	return false;
};

const serializeUnknown = (input: unknown): string => {
	if (input === undefined || input === null) {
		return 'N/A';
	}

	if (input instanceof Error) {
		return input.message;
	}

	if (typeof input === 'bigint') {
		return input.toString();
	}

	if (containsBigInt(input)) {
		try {
			return JSONBigInt.stringify(input);
		} catch (error) {
			logger.err(`Failed to stringify bigint payload using JSONBigInt: ${String(error)}`);
		}
	}

	try {
		return JSON.stringify(input);
	} catch (error) {
		logger.err(`Failed to stringify payload using JSON.stringify: ${String(error)}`);
		try {
			return JSONBigInt.stringify(input);
		} catch (fallbackError) {
			logger.err(
				`Fallback JSONBigInt stringify failed: ${String(fallbackError)} | value discarded`
			);
			return 'Unable to serialize error payload';
		}
	}
};

export const setCampaignAsErrorState = async (
	params: SetCampaignErrorParams
) => {
	const requestId = params.requestId ?? generateRequestId();
	const prisma = await createPrismaClient();
	const campaignModel = new CampaignTwitterCardModel(prisma);
	const campaignLogsModel = new CampaignLogsModel(prisma);
	const campaignId = toBigInt(params.campaignId);

	try {
		const campaign = await campaignModel.getCampaignById(campaignId);

		if (!campaign) {
			logger.err(
				`[${requestId}] Campaign ${campaignId.toString()} not found while setting error state`
			);
			return;
		}

		if (campaign.card_status === campaignstatus.InternalError) {
			logger.info(
				`[${requestId}] Campaign ${campaignId.toString()} already marked as InternalError`
			);
			return;
		}

		const formattedError = serializeUnknown(params.error);

		await campaignModel.updateCampaign(campaignId, {
			card_status: campaignstatus.InternalError,
			is_added_to_queue: false,
		});

		await campaignLogsModel.createLog({
			campaign: { connect: { id: campaignId } },
			status: campaignstatus.InternalError,
			message: params.reason,
			data: buildLogPayload(campaign, params, formattedError, requestId),
		});

		logger.info(
			`[${requestId}] Campaign ${campaignId.toString()} marked as InternalError`
		);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.err(
			`[${requestId}] Failed to mark campaign ${campaignId.toString()} as InternalError: ${errorMessage}`
		);
		throw error;
	} finally {
		await prisma.$disconnect().catch((disconnectError) => {
			logger.err(
				`[${requestId}] Failed to disconnect prisma after error-state update: ${String(
					disconnectError
				)}`
			);
		});
	}
};

export default setCampaignAsErrorState;
