import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

mongoose.set('strictQuery', true);

let connected = false;

export async function connectDatabase(): Promise<typeof mongoose> {
  if (connected) return mongoose;

  mongoose.connection.on('connected', () => logger.info('MongoDB connected', { db: env.MONGODB_DB }));
  mongoose.connection.on('error', (err) => logger.error('MongoDB error', String(err)));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

  await mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB,
    serverSelectionTimeoutMS: 15_000,
    maxPoolSize: 20,
    autoIndex: !env.isProd,
  });

  connected = true;
  return mongoose;
}

export async function disconnectDatabase(): Promise<void> {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
}
