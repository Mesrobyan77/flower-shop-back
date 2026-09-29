import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { ApiError, type FieldErrors } from '../utils/ApiError';
import { MAX_UPLOAD_BYTES } from './upload';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
}

function normalize(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  if (err instanceof ZodError) {
    const errors: FieldErrors = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      (errors[key] ||= []).push(issue.message);
    }
    return ApiError.unprocessable('Validation error', errors);
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const errors: FieldErrors = {};
    for (const [key, detail] of Object.entries(err.errors)) errors[key] = [detail.message];
    return ApiError.unprocessable('Validation error', errors);
  }

  if (err instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for "${err.path}"`);
  }

  const mongoErr = err as { code?: number; keyValue?: Record<string, unknown> };
  if (mongoErr?.code === 11000) {
    const field = Object.keys(mongoErr.keyValue ?? {})[0] ?? 'field';
    return ApiError.conflict(`This ${field} is already in use`, { [field]: ['already in use'] });
  }

  if ((err as { type?: string })?.type === 'entity.too.large') {
    return new ApiError(413, 'Payload too large');
  }

  /**
   * Multer rejects an upload before any route code runs, so its limits surface
   * here: a file over the size cap is a 413 and the count/field limits are client
   * errors - never a 500 for something the caller got wrong.
   */
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return new ApiError(413, `Upload is larger than the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit`);
    return ApiError.badRequest(`Upload rejected: ${err.message}`);
  }

  return ApiError.internal(err instanceof Error ? err.message : 'Internal server error');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const apiError = normalize(err);

  if (apiError.statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} -> ${apiError.statusCode}`, {
      message: apiError.message,
      stack: err instanceof Error ? err.stack : undefined,
    });
  } else {
    logger.warn(`${req.method} ${req.originalUrl} -> ${apiError.statusCode}`, apiError.message);
  }

  const body: Record<string, unknown> = {
    success: false,
    message: apiError.statusCode >= 500 && env.isProd ? 'Internal server error' : apiError.message,
  };
  if (apiError.code) body.code = apiError.code;
  if (apiError.errors) body.errors = apiError.errors;
  if (!env.isProd && err instanceof Error && apiError.statusCode >= 500) body.stack = err.stack;

  res.status(apiError.statusCode).json(body);
}
