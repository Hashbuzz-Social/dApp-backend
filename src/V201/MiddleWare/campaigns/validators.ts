import { getValidationRules } from '@V201/modules/common';
import { DraftCampaignBody, PubishCampaignBody } from '@V201/types';
import { checkSchema, Schema } from 'express-validator';

// 🔹 Define Schema Using Type Inference
const DraftCampaignSchema: Schema = getValidationRules<DraftCampaignBody>({
  name: {
    in: ['body'],
    notEmpty: { errorMessage: 'Name cannot be empty' },
  },
  tweet_text: {
    in: ['body'],
    notEmpty: { errorMessage: 'Tweet text cannot be empty' },
  },
  expected_engaged_users: {
    in: ['body'],
    isInt: { errorMessage: 'Expected engaged users must be an integer' },
    toInt: true,
  },
  campaign_budget: {
    in: ['body'],
    isFloat: { errorMessage: 'Campaign budget must be a number' },
    toFloat: true,
  },
  type: {
    in: ['body'],
    notEmpty: { errorMessage: 'Type cannot be empty' },
  },
  media: {
    in: ['body'],
    optional: true,
    isArray: { errorMessage: 'Media must be an array' },
  },
  fungible_token_id: {
    in: ['body'],
    optional: true, // Allows it to be omitted
    custom: {
      options: (value, { req }) => {
        if (req.body.type === 'FUNGIBLE' && !value) {
          throw new Error(
            'Fungible token ID is required when type is FUNGIBLE'
          );
        }
        return true;
      },
    },
  },
});

const publishCampaignSchema: Schema = getValidationRules<PubishCampaignBody>({
  campaignId: {
    in: ['body'],
    notEmpty: { errorMessage: 'Campaign ID cannot be empty' },
    isInt: { errorMessage: 'Campaign ID must be an integer' },
    toInt: true,
  },
  campaignDuration: {
    in: ['body'],
    optional: true,
    isInt: { errorMessage: 'Campaign duration must be an integer' },
    toInt: true,
  },
  anyFinalComment: {
    in: ['body'],
    optional: true,
  },
});

// 🔹 Middleware to Apply Schema Validation
export const validateDraftCampaignBody = checkSchema(DraftCampaignSchema);
export const validatePublishCampaignBody = checkSchema(publishCampaignSchema);
