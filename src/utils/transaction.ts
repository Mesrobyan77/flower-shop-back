import mongoose, { type ClientSession } from 'mongoose';
import { logger } from '../config/logger';

let transactionsSupported: boolean | null = null;

/**
 * Atlas (replica set) supports multi-document transactions; a standalone local
 * mongod does not. Run inside a transaction when possible and degrade to a plain
 * sequential write otherwise, so development against a single node still works.
 */
export async function runInTransaction<T>(fn: (session?: ClientSession) => Promise<T>): Promise<T> {
  if (transactionsSupported === false) return fn(undefined);

  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    transactionsSupported = true;
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const unsupported =
      message.includes('Transaction numbers are only allowed') ||
      message.includes('replica set') ||
      message.includes('IllegalOperation');

    if (unsupported && transactionsSupported === null) {
      transactionsSupported = false;
      logger.warn('MongoDB transactions unavailable on this deployment - falling back to non-atomic writes');
      return fn(undefined);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}
