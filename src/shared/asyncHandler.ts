import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wrap an async Express handler or middleware so promise rejections
 * are forwarded to next(err). Use when passing async functions to
 * Express routers to satisfy the `no-misused-promises` rule.
 *
 * Supports both generic and typed Request handlers.
 */
type AsyncRequestHandler<
  P = any,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any,
  Locals extends Record<string, any> = Record<string, any>
> = (
  req: Request<P, ResBody, ReqBody, ReqQuery, Locals>,
  res: Response<ResBody, Locals>,
  next: NextFunction
) => Promise<unknown> | unknown;

export const asyncHandler = <
  P = any,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any,
  Locals extends Record<string, any> = Record<string, any>
>(
  fn: AsyncRequestHandler<P, ResBody, ReqBody, ReqQuery, Locals>
): RequestHandler<P, ResBody, ReqBody, ReqQuery, Locals> => {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default asyncHandler;
