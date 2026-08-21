import { Client } from 'minio';
import { env } from './env';
import { logger } from './logger';

export const minioClient = new Client({
  endPoint: env.MINIO_ENDPOINT,
  port: env.MINIO_PORT,
  useSSL: env.MINIO_USE_SSL,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

/** Anonymous read policy so <img src> works straight from the bucket. */
function publicReadPolicy(bucket: string) {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  });
}

let ready = false;

export async function ensureBucket(): Promise<boolean> {
  if (ready) return true;
  try {
    const exists = await minioClient.bucketExists(env.MINIO_BUCKET);
    if (!exists) {
      await minioClient.makeBucket(env.MINIO_BUCKET, 'us-east-1');
      logger.info('MinIO bucket created', { bucket: env.MINIO_BUCKET });
    }
    await minioClient.setBucketPolicy(env.MINIO_BUCKET, publicReadPolicy(env.MINIO_BUCKET));
    ready = true;
    logger.info('MinIO ready', { bucket: env.MINIO_BUCKET });
    return true;
  } catch (err) {
    // The API must still boot when object storage is down; uploads fail loudly instead.
    logger.warn('MinIO unavailable — media uploads will fail until it is reachable', String(err));
    return false;
  }
}

export function publicUrl(objectKey: string): string {
  return `${env.MINIO_PUBLIC_URL.replace(/\/$/, '')}/${env.MINIO_BUCKET}/${objectKey}`;
}
