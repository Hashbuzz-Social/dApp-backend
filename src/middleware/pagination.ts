import { NextFunction, Request, Response } from 'express';

// Pagination middleware for /all
export const parseQueryPagination = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.max(
    1,
    Math.min(100, parseInt(req.query.limit as string) || 20)
  );
  (req as any).pagination = { page, limit };
  next();
};
