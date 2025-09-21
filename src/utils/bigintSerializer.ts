/**
 * BigInt Serialization Utilities
 * Handles BigInt values in JSON serialization across the application
 */

/**
 * Custom JSON stringifier that converts BigInt values to strings
 * @param key - The object key
 * @param value - The value to stringify
 * @returns The serialized value
 */
export const bigIntReplacer = (key: string, value: any): any => {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
};

/**
 * Safely stringify an object that may contain BigInt values
 * @param obj - The object to stringify
 * @param space - Optional spacing for pretty printing
 * @returns JSON string with BigInt values converted to strings
 */
export const safeJsonStringify = (obj: any, space?: number): string => {
  return JSON.stringify(obj, bigIntReplacer, space);
};

/**
 * Deep convert BigInt values to strings in an object
 * @param obj - The object to convert
 * @returns A new object with BigInt values converted to strings
 */
export const convertBigIntToString = (obj: any): unknown => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'bigint') {
    return obj.toString();
  }

  if (Array.isArray(obj)) {
    return (obj as unknown[]).map(convertBigIntToString);
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = convertBigIntToString(value);
    }
    return result;
  }

  return obj;
};

import { Response } from 'express';

/**
 * Express response helper that safely handles BigInt serialization
 * @param res - Express response object
 * @param statusCode - HTTP status code
 * @param data - Data to send (may contain BigInt values)
 * @returns Express response
 */
export const safeJsonResponse = (
  res: Response,
  statusCode: number,
  data: any
): Response => {
  const safeData = convertBigIntToString(data);
  return res.status(statusCode).json(safeData);
};
