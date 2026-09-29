import mongoose, { type ClientSession } from 'mongoose';
import { logger } from '../config/logger';
import { ApiError } from './ApiError';

let transactionsSupported: boolean | null = null;

/**
 * Only a replica set or a sharded cluster can run multi-document transactions:
 * `hello` reports `setName` for the former and `msg: 'isdbgrid'` for the latter.
 * A standalone mongod reports neither.
 */
async function detectTransactions(): Promise<boolean> {
  const admin = mongoose.connection.db?.admin();
  if (!admin) return false;

  try {
    const info = (await admin.command({ hello: 1 })) as { setName?: string; msg?: string };
    return Boolean(info.setName) || info.msg === 'isdbgrid';
  } catch {
    // MongoDB < 4.4 only knows the legacy name of the same command.
    const info = (await admin.command({ isMaster: 1 })) as { setName?: string; msg?: string };
    return Boolean(info.setName) || info.msg === 'isdbgrid';
  }
}

/**
 * Order writes touch several documents at once - order, stock, sales counters,
 * bonus points and the cart - so they only ever run inside a transaction. A
 * deployment that cannot provide one is refused outright instead of silently
 * degrading to sequential writes: an order without its stock movement, or stock
 * moved without an order, is worse for the shop than a failed request.
 */
export async function runInTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  if (transactionsSupported === null) {
    transactionsSupported = await detectTransactions();
    if (!transactionsSupported) {
      logger.error('MongoDB deployment cannot run transactions - order writes are refused');
    }
  }

  if (!transactionsSupported) {
    throw new ApiError(
      503,
      'Placing an order is temporarily unavailable: this database cannot guarantee atomic writes',
      undefined,
      'TRANSACTIONS_UNAVAILABLE',
    );
  }

  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
