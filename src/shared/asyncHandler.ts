import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wrap an async Express handler or middleware so promise rejections
 * are forwarded to next(err). Use when passing async functions to
 * Express routers to satisfy the `no-misused-promises` rule.
 */
type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;

export const asyncHandler = (fn: AsyncRequestHandler): RequestHandler => {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default asyncHandler;
