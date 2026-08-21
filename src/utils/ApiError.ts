export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errors?: FieldErrors;
  public readonly code?: string;
  public readonly isOperational = true;

  constructor(statusCode: number, message: string, errors?: FieldErrors, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', errors?: FieldErrors) {
    return new ApiError(400, message, errors, 'BAD_REQUEST');
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message, undefined, 'UNAUTHORIZED');
  }
  static forbidden(message = 'You do not have access to this resource') {
    return new ApiError(403, message, undefined, 'FORBIDDEN');
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, message, undefined, 'NOT_FOUND');
  }
  static conflict(message = 'Resource already exists', errors?: FieldErrors) {
    return new ApiError(409, message, errors, 'CONFLICT');
  }
  static unprocessable(message = 'Validation error', errors?: FieldErrors) {
    return new ApiError(422, message, errors, 'VALIDATION_ERROR');
  }
  static tooMany(message = 'Too many requests') {
    return new ApiError(429, message, undefined, 'RATE_LIMITED');
  }
  static internal(message = 'Internal server error') {
    return new ApiError(500, message, undefined, 'INTERNAL_ERROR');
  }
}
