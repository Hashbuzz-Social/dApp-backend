import { getValidationRules } from '@V201/modules/common';
import { checkSchema, Schema } from 'express-validator';

/**
 * Quest Campaign Validators
 *
 * This module contains validation schemas for all quest campaign endpoints
 * using express-validator.
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface DraftQuestBody {
  name: string;
  tweet_text: string;
  expected_engaged_users: number;
  campaign_budget: number;
  type: 'HBAR' | 'FUNGIBLE';
  fungible_token_id?: string;
  media: string[];
}

export interface PublishQuestBody {
  questId: string;
}

export interface GradeQuestSubmissionsBody {
  submissions: Array<{
    submissionId: string;
    approved: boolean;
    rewardAmount?: number;
    rejectionReason?: string;
  }>;
}

export interface CloseQuestBody {
  reason?: string;
  refundRemaining?: boolean;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Validation schema for POST /v2/quest/draft
 *
 * Creates a new quest campaign draft
 */
const DraftQuestSchema: Schema = getValidationRules<DraftQuestBody>({
  name: {
    in: ['body'],
    notEmpty: {
      errorMessage: 'Quest campaign name is required',
    },
    isString: {
      errorMessage: 'Quest campaign name must be a string',
    },
    trim: true,
    isLength: {
      options: { min: 3, max: 200 },
      errorMessage: 'Quest campaign name must be between 3 and 200 characters',
    },
  },
  tweet_text: {
    in: ['body'],
    notEmpty: {
      errorMessage: 'Tweet text is required',
    },
    isString: {
      errorMessage: 'Tweet text must be a string',
    },
    trim: true,
    isLength: {
      options: { min: 10, max: 280 },
      errorMessage: 'Tweet text must be between 10 and 280 characters',
    },
  },
  expected_engaged_users: {
    in: ['body'],
    notEmpty: {
      errorMessage: 'Expected engaged users is required',
    },
    isInt: {
      options: { min: 1, max: 1000000 },
      errorMessage: 'Expected engaged users must be an integer between 1 and 1,000,000',
    },
    toInt: true,
  },
  campaign_budget: {
    in: ['body'],
    notEmpty: {
      errorMessage: 'Campaign budget is required',
    },
    isFloat: {
      options: { min: 0.01 },
      errorMessage: 'Campaign budget must be a positive number (minimum 0.01)',
    },
    toFloat: true,
  },
  type: {
    in: ['body'],
    notEmpty: {
      errorMessage: 'Campaign type is required',
    },
    isIn: {
      options: [['HBAR', 'FUNGIBLE']],
      errorMessage: 'Campaign type must be either HBAR or FUNGIBLE',
    },
  },
  fungible_token_id: {
    in: ['body'],
    optional: true,
    custom: {
      options: (value, { req }) => {
        if (req.body.type === 'FUNGIBLE' && !value) {
          throw new Error('Fungible token ID is required when type is FUNGIBLE');
        }
        if (value && typeof value !== 'string') {
          throw new Error('Fungible token ID must be a string');
        }
        if (value && typeof value === 'string' && !/^0\.0\.\d+$/.test(value)) {
          throw new Error('Fungible token ID must be in format 0.0.XXX');
        }
        return true;
      },
    },
  },
  media: {
    in: ['body'],
    isArray: {
      errorMessage: 'Media must be an array',
    },
    custom: {
      options: (value) => {
        if (!Array.isArray(value)) {
          throw new Error('Media must be an array');
        }
        if (value.length > 4) {
          throw new Error('Maximum 4 media files allowed');
        }
        // Validate each media item is a string (URL or file path)
        value.forEach((item, index) => {
          if (typeof item !== 'string') {
            throw new Error(`Media item at index ${index} must be a string`);
          }
        });
        return true;
      },
    },
  },
});

/**
 * Validation schema for POST /v2/quest/publish
 *
 * Publishes a quest campaign
 */
const PublishQuestSchema: Schema = getValidationRules<PublishQuestBody>({
  questId: {
    in: ['body'],
    notEmpty: {
      errorMessage: 'Quest ID is required',
    },
    isString: {
      errorMessage: 'Quest ID must be a string',
    },
    trim: true,
    custom: {
      options: (value) => {
        // Ensure value is a string
        const stringValue = String(value);
        // Validate it's a valid bigint string
        if (!/^\d+$/.test(stringValue)) {
          throw new Error('Quest ID must be a valid number');
        }
        // Check if it can be converted to BigInt
        try {
          BigInt(stringValue);
        } catch {
          throw new Error('Quest ID is too large or invalid');
        }
        return true;
      },
    },
  },
});

/**
 * Validation schema for POST /v2/quest/:questId/grade
 *
 * Grades quest submissions and distributes rewards
 */
const GradeQuestSubmissionsSchema: Schema = getValidationRules<GradeQuestSubmissionsBody>({
  submissions: {
    in: ['body'],
    notEmpty: {
      errorMessage: 'Submissions array is required',
    },
    isArray: {
      errorMessage: 'Submissions must be an array',
    },
    custom: {
      options: (value) => {
        if (!Array.isArray(value)) {
          throw new Error('Submissions must be an array');
        }

        if (value.length === 0) {
          throw new Error('At least one submission is required');
        }

        if (value.length > 1000) {
          throw new Error('Maximum 1000 submissions can be graded at once');
        }

        // Validate each submission object
        value.forEach((submission, index) => {
          if (!submission || typeof submission !== 'object') {
            throw new Error(`Submission at index ${index} must be an object`);
          }

          // Check required fields
          if (!submission.submissionId) {
            throw new Error(`Submission at index ${index} is missing submissionId`);
          }

          if (typeof submission.submissionId !== 'string') {
            throw new Error(`Submission at index ${index}: submissionId must be a string`);
          }

          if (typeof submission.approved !== 'boolean') {
            throw new Error(`Submission at index ${index}: approved must be a boolean`);
          }

          // If approved, check rewardAmount
          if (submission.approved) {
            if (submission.rewardAmount !== undefined) {
              if (typeof submission.rewardAmount !== 'number' || submission.rewardAmount < 0) {
                throw new Error(`Submission at index ${index}: rewardAmount must be a positive number`);
              }
            }
          } else {
            // If rejected, check rejectionReason
            if (submission.rejectionReason !== undefined) {
              if (typeof submission.rejectionReason !== 'string') {
                throw new Error(`Submission at index ${index}: rejectionReason must be a string`);
              }
              if (submission.rejectionReason.length > 500) {
                throw new Error(`Submission at index ${index}: rejectionReason must be less than 500 characters`);
              }
            }
          }
        });

        return true;
      },
    },
  },
});

/**
 * Validation schema for POST /v2/quest/:questId/close
 *
 * Manually closes a quest campaign
 */
const CloseQuestSchema: Schema = getValidationRules<CloseQuestBody>({
  reason: {
    in: ['body'],
    optional: true,
    isString: {
      errorMessage: 'Reason must be a string',
    },
    trim: true,
    isLength: {
      options: { max: 1000 },
      errorMessage: 'Reason must be less than 1000 characters',
    },
  },
  refundRemaining: {
    in: ['body'],
    optional: true,
    isBoolean: {
      errorMessage: 'refundRemaining must be a boolean',
    },
    toBoolean: true,
  },
});

/**
 * Validation schema for quest ID parameter
 * Used in routes with :questId param
 */
const QuestIdParamSchema: Schema = {
  questId: {
    in: ['params'],
    notEmpty: {
      errorMessage: 'Quest ID parameter is required',
    },
    custom: {
      options: (value) => {
        // Ensure value is a string
        const stringValue = String(value);
        // Validate it's a valid bigint string
        if (!/^\d+$/.test(stringValue)) {
          throw new Error('Quest ID must be a valid number');
        }
        // Check if it can be converted to BigInt
        try {
          BigInt(stringValue);
        } catch {
          throw new Error('Quest ID is too large or invalid');
        }
        return true;
      },
    },
  },
};

// ============================================================================
// EXPORTED VALIDATORS
// ============================================================================

/**
 * Middleware to validate POST /v2/quest/draft body
 */
export const validateDraftQuestBody = checkSchema(DraftQuestSchema);

/**
 * Middleware to validate POST /v2/quest/publish body
 */
export const validatePublishQuestBody = checkSchema(PublishQuestSchema);

/**
 * Middleware to validate POST /v2/quest/:questId/grade body
 */
export const validateGradeQuestSubmissionsBody = checkSchema(GradeQuestSubmissionsSchema);

/**
 * Middleware to validate POST /v2/quest/:questId/close body
 */
export const validateCloseQuestBody = checkSchema(CloseQuestSchema);

/**
 * Middleware to validate :questId parameter in routes
 */
export const validateQuestIdParam = checkSchema(QuestIdParamSchema);
