import {
  handleGetAllTransactions,
  handleGetTransactionById,
  handleUpdateTransactionStatus,
  handleGetTransactionAnalytics,
  handleDeleteTransaction,
  handleExportTransactions
} from '@controller/AdminTransactions';
import auth from '@middleware/auth';
import userInfo from '@middleware/userInfo';
import admin from '@middleware/admin';
import { asyncHandler } from '@shared/asyncHandler';
import { checkErrResponse } from '@validator/userRoutes.validator';
import { Router } from 'express';
import { body, param, query } from 'express-validator';

const router = Router();

// All admin transaction routes require authentication and admin role
router.use(asyncHandler(auth.isHavingValidAst));
router.use(asyncHandler(userInfo.getCurrentUserInfo));
router.use(asyncHandler(admin.isAdmin));

/**
 * Get all transactions with pagination and filtering
 * 
 * @api GET /api/admin/transactions
 * @query {number} [page=1] - Page number
 * @query {number} [limit=20] - Items per page
 * @query {string} [transaction_type] - Filter by transaction type
 * @query {string} [network] - Filter by network
 * @query {string} [status] - Filter by status
 * @query {string} [search] - Search in transaction_id or status
 * @query {string} [start_date] - Filter by start date
 * @query {string} [end_date] - Filter by end date
 * @query {string} [sort_by=created_at] - Sort field
 * @query {string} [sort_order=desc] - Sort order (asc/desc)
 */
router.get(
  '/',
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('transaction_type').optional().isIn(['topup', 'reimburse', 'campaign_top_up', 'reward']),
  query('network').optional().isIn(['testnet', 'mainnet', 'previewnet']),
  query('status').optional().isString(),
  query('search').optional().isString(),
  query('start_date').optional().isISO8601(),
  query('end_date').optional().isISO8601(),
  query('sort_by').optional().isIn(['id', 'transaction_id', 'amount', 'status', 'created_at']),
  query('sort_order').optional().isIn(['asc', 'desc']),
  checkErrResponse,
  asyncHandler(handleGetAllTransactions)
);

/**
 * Get transaction by ID
 * 
 * @api GET /api/admin/transactions/:id
 * @param {string} id - Transaction ID
 */
router.get(
  '/:id',
  param('id').isNumeric(),
  checkErrResponse,
  asyncHandler(handleGetTransactionById)
);

/**
 * Update transaction status
 * 
 * @api PUT /api/admin/transactions/:id/status
 * @param {string} id - Transaction ID
 * @body {string} status - New status
 */
router.put(
  '/:id/status',
  param('id').isNumeric(),
  body('status').isString().notEmpty(),
  checkErrResponse,
  asyncHandler(handleUpdateTransactionStatus)
);

/**
 * Get transaction analytics/statistics
 * 
 * @api GET /api/admin/transactions/analytics/summary
 * @query {string} [start_date] - Filter by start date
 * @query {string} [end_date] - Filter by end date
 */
router.get(
  '/analytics/summary',
  query('start_date').optional().isISO8601(),
  query('end_date').optional().isISO8601(),
  checkErrResponse,
  asyncHandler(handleGetTransactionAnalytics)
);

/**
 * Export transactions to CSV
 * 
 * @api GET /api/admin/transactions/export/csv
 * @query {string} [transaction_type] - Filter by transaction type
 * @query {string} [network] - Filter by network
 * @query {string} [status] - Filter by status
 * @query {string} [start_date] - Filter by start date
 * @query {string} [end_date] - Filter by end date
 */
router.get(
  '/export/csv',
  query('transaction_type').optional().isIn(['topup', 'reimburse', 'campaign_top_up', 'reward']),
  query('network').optional().isIn(['testnet', 'mainnet', 'previewnet']),
  query('status').optional().isString(),
  query('start_date').optional().isISO8601(),
  query('end_date').optional().isISO8601(),
  checkErrResponse,
  asyncHandler(handleExportTransactions)
);

/**
 * Soft delete transaction (update status to DELETED)
 * 
 * @api DELETE /api/admin/transactions/:id
 * @param {string} id - Transaction ID
 */
router.delete(
  '/:id',
  param('id').isNumeric(),
  checkErrResponse,
  asyncHandler(handleDeleteTransaction)
);

export default router;