import { createApp } from './src/app';
import { connectDatabase, disconnectDatabase } from './src/config/db';
import { env } from './src/config/env';
import { logger } from './src/config/logger';
import { ensureCloudinary } from './src/config/cloudinary';

async function bootstrap() {
  await connectDatabase();
  ensureCloudinary();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT}${env.API_PREFIX}`, { env: env.NODE_ENV });
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection', String(reason)));
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
