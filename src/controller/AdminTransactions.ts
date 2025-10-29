import { Request, Response } from 'express';
import createPrismaClient from '@shared/prisma';
import HttpStatusCodes from 'http-status-codes';
import JSONBigInt from 'json-bigint';
import logger from 'jet-logger';

const { OK, BAD_REQUEST, NOT_FOUND, INTERNAL_SERVER_ERROR } = HttpStatusCodes;

/**
 * Admin controller for transaction management
 * Provides CRUD operations and analytics for transactions
 */

/**
 * Get all transactions with pagination, filtering, and search
 */
export const handleGetAllTransactions = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      transaction_type,
      network,
      status,
      search,
      start_date,
      end_date,
      sort_by = 'created_at',
      sort_order = 'desc',
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    const prisma = await createPrismaClient();

    // Build where clause for filtering
    const whereClause: any = {};

    if (transaction_type) {
      whereClause.transaction_type = transaction_type;
    }

    if (network) {
      whereClause.network = network;
    }

    if (status) {
      whereClause.status = status;
    }

    if (search) {
      whereClause.OR = [
        { transaction_id: { contains: search as string, mode: 'insensitive' } },
        { status: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (start_date || end_date) {
      whereClause.created_at = {};
      if (start_date) {
        whereClause.created_at.gte = new Date(start_date as string);
      }
      if (end_date) {
        whereClause.created_at.lte = new Date(end_date as string);
      }
    }

    // Get total count for pagination
    const totalCount = await prisma.transactions.count({ where: whereClause });

    // Get transactions
    const transactions = await prisma.transactions.findMany({
      where: whereClause,
      orderBy: {
        [sort_by as string]: sort_order as 'asc' | 'desc',
      },
      skip: offset,
      take: limitNum,
    });

    const totalPages = Math.ceil(totalCount / limitNum);

    return res.status(OK).json({
      status: 'success',
      message: 'Transactions retrieved successfully',
      data: {
        transactions: JSONBigInt.parse(JSONBigInt.stringify(transactions)),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          totalPages,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        },
      },
    });
  } catch (error) {
    logger.err(error);
    return res.status(INTERNAL_SERVER_ERROR).json({
      status: 'error',
      message: 'Internal server error while fetching transactions',
    });
  }
};

/**
 * Get transaction by ID
 */
export const handleGetTransactionById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const prisma = await createPrismaClient();

    const transaction = await prisma.transactions.findUnique({
      where: { id: BigInt(id) },
    });

    if (!transaction) {
      return res.status(NOT_FOUND).json({
        status: 'error',
        message: 'Transaction not found',
      });
    }

    return res.status(OK).json({
      status: 'success',
      message: 'Transaction retrieved successfully',
      data: JSONBigInt.parse(JSONBigInt.stringify(transaction)),
    });
  } catch (error) {
    logger.err(error);
    return res.status(INTERNAL_SERVER_ERROR).json({
      status: 'error',
      message: 'Internal server error while fetching transaction',
    });
  }
};

/**
 * Update transaction status
 */
export const handleUpdateTransactionStatus = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(BAD_REQUEST).json({
        status: 'error',
        message: 'Status is required',
      });
    }

    const prisma = await createPrismaClient();

    const updatedTransaction = await prisma.transactions.update({
      where: { id: BigInt(id) },
      data: { status },
    });

    return res.status(OK).json({
      status: 'success',
      message: 'Transaction status updated successfully',
      data: JSONBigInt.parse(JSONBigInt.stringify(updatedTransaction)),
    });
  } catch (error) {
    logger.err(error);
    return res.status(INTERNAL_SERVER_ERROR).json({
      status: 'error',
      message: 'Internal server error while updating transaction',
    });
  }
};

/**
 * Get transaction analytics/statistics
 */
export const handleGetTransactionAnalytics = async (
  req: Request,
  res: Response
) => {
  try {
    const { start_date, end_date } = req.query;

    const prisma = await createPrismaClient();

    // Build date filter
    const dateFilter: any = {};
    if (start_date || end_date) {
      dateFilter.created_at = {};
      if (start_date) {
        dateFilter.created_at.gte = new Date(start_date as string);
      }
      if (end_date) {
        dateFilter.created_at.lte = new Date(end_date as string);
      }
    }

    // Get summary statistics
    const [
      totalTransactions,
      totalAmount,
      transactionsByType,
      transactionsByNetwork,
      transactionsByStatus,
    ] = await Promise.all([
      // Total transactions count
      prisma.transactions.count({ where: dateFilter }),

      // Total amount
      prisma.transactions.aggregate({
        where: dateFilter,
        _sum: { amount: true },
      }),

      // Transactions by type
      prisma.transactions.groupBy({
        by: ['transaction_type'],
        where: dateFilter,
        _count: { transaction_type: true },
        _sum: { amount: true },
      }),

      // Transactions by network
      prisma.transactions.groupBy({
        by: ['network'],
        where: dateFilter,
        _count: { network: true },
        _sum: { amount: true },
      }),

      // Transactions by status
      prisma.transactions.groupBy({
        by: ['status'],
        where: dateFilter,
        _count: { status: true },
        _sum: { amount: true },
      }),
    ]);

    return res.status(OK).json({
      status: 'success',
      message: 'Transaction analytics retrieved successfully',
      data: {
        summary: {
          totalTransactions,
          totalAmount: totalAmount._sum.amount || 0,
        },
        byType: transactionsByType,
        byNetwork: transactionsByNetwork,
        byStatus: transactionsByStatus,
      },
    });
  } catch (error) {
    logger.err(error);
    return res.status(INTERNAL_SERVER_ERROR).json({
      status: 'error',
      message: 'Internal server error while fetching analytics',
    });
  }
};

/**
 * Delete transaction (soft delete by updating status)
 */
export const handleDeleteTransaction = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const prisma = await createPrismaClient();

    // Instead of hard delete, update status to 'DELETED'
    const deletedTransaction = await prisma.transactions.update({
      where: { id: BigInt(id) },
      data: { status: 'DELETED' },
    });

    return res.status(OK).json({
      status: 'success',
      message: 'Transaction deleted successfully',
      data: JSONBigInt.parse(JSONBigInt.stringify(deletedTransaction)),
    });
  } catch (error) {
    logger.err(error);
    return res.status(INTERNAL_SERVER_ERROR).json({
      status: 'error',
      message: 'Internal server error while deleting transaction',
    });
  }
};

/**
 * Export transactions to CSV
 */
export const handleExportTransactions = async (req: Request, res: Response) => {
  try {
    const { transaction_type, network, status, start_date, end_date } =
      req.query;

    const prisma = await createPrismaClient();

    // Build where clause (same as get all transactions)
    const whereClause: any = {};

    if (transaction_type) whereClause.transaction_type = transaction_type;
    if (network) whereClause.network = network;
    if (status) whereClause.status = status;
    if (start_date || end_date) {
      whereClause.created_at = {};
      if (start_date)
        whereClause.created_at.gte = new Date(start_date as string);
      if (end_date) whereClause.created_at.lte = new Date(end_date as string);
    }

    const transactions = await prisma.transactions.findMany({
      where: whereClause,
      orderBy: { created_at: 'desc' },
    });

    // Convert to CSV format
    const csvHeaders = [
      'ID',
      'Transaction ID',
      'Type',
      'Network',
      'Amount',
      'Status',
      'Created At',
    ].join(',');

    const csvRows = transactions.map((tx) =>
      [
        tx.id.toString(),
        tx.transaction_id,
        tx.transaction_type,
        tx.network,
        tx.amount.toString(),
        tx.status,
        tx.created_at.toISOString(),
      ].join(',')
    );

    const csvContent = [csvHeaders, ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=transactions_${
        new Date().toISOString().split('T')[0]
      }.csv`
    );

    return res.status(OK).send(csvContent);
  } catch (error) {
    logger.err(error);
    return res.status(INTERNAL_SERVER_ERROR).json({
      status: 'error',
      message: 'Internal server error while exporting transactions',
    });
  }
};
