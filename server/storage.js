import * as Minio from 'minio';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

// Supports generic S3_* environment variables as well as MINIO_* aliases
const rawEndpoint = (
  process.env.S3_ENDPOINT ||
  process.env.MINIO_ENDPOINT ||
  'localhost'
)
  .replace(/^https?:\/\//i, '')
  .replace(/\/+$/, '');

const useSSL =
  String(process.env.S3_USE_SSL ?? process.env.MINIO_USE_SSL ?? 'false').toLowerCase() === 'true';

const bucketName = process.env.S3_BUCKET || process.env.MINIO_BUCKET || 'bugsted';
const accessKey = process.env.S3_ACCESS_KEY || process.env.MINIO_ACCESS_KEY || '';
const secretKey = process.env.S3_SECRET_KEY || process.env.MINIO_SECRET_KEY || '';
const region = (process.env.S3_REGION || process.env.MINIO_REGION || '').trim() || undefined;

const rawPort = process.env.S3_PORT || process.env.MINIO_PORT;
const explicitPort = rawPort ? Number(rawPort) : undefined;

const rawPathStyle = process.env.S3_PATH_STYLE ?? process.env.MINIO_PATH_STYLE;
const pathStyle =
  rawPathStyle !== undefined
    ? String(rawPathStyle).toLowerCase() === 'true'
    : !rawEndpoint.endsWith('amazonaws.com');

export const storageConfig = {
  endPoint: rawEndpoint,
  useSSL,
  bucket: bucketName,
  region: region || 'default',
  pathStyle,
  ...(explicitPort ? { port: explicitPort } : {}),
};

// Keep minioConfig alias for backward compatibility
export const minioConfig = storageConfig;

export const s3Client = new Minio.Client({
  endPoint: rawEndpoint,
  useSSL,
  accessKey,
  secretKey,
  pathStyle,
  ...(region ? { region } : {}),
  ...(explicitPort ? { port: explicitPort } : {}),
});

let bucketVerified = false;

export async function ensureStorageBucket() {
  if (bucketVerified) return true;
  const exists = await s3Client.bucketExists(bucketName);
  if (!exists) {
    await s3Client.makeBucket(bucketName, region || '');
    console.log(`[Storage] Created S3/MinIO bucket: ${bucketName}`);
  }
  bucketVerified = true;
  return true;
}

export const ensureMinioBucket = ensureStorageBucket;

export async function verifyStorageConnection() {
  const exists = await s3Client.bucketExists(bucketName);
  if (!exists) {
    await s3Client.makeBucket(bucketName, region || '');
  }
  bucketVerified = true;
  return {
    connected: true,
    endPoint: rawEndpoint,
    bucket: bucketName,
    useSSL,
    region: region || 'default',
  };
}

export const verifyMinioConnection = verifyStorageConnection;

export async function uploadFileToStorage({ localPath, folder, filename, mimeType }) {
  await ensureStorageBucket();
  const objectKey = `${folder}/${filename}`;
  const metaData = {
    'Content-Type': mimeType || guessMimeType(filename),
  };

  await s3Client.fPutObject(bucketName, objectKey, localPath, metaData);
  return {
    objectKey,
    storedPath: `/uploads/${objectKey}`,
  };
}

export const uploadFileToMinio = uploadFileToStorage;

export async function deleteObjectFromStorage(storedPath) {
  if (!storedPath) return;
  const objectKey = String(storedPath).replace(/^\/+uploads\/+/, '');
  if (!objectKey) return;
  try {
    await s3Client.removeObject(bucketName, objectKey);
  } catch (err) {
    console.error(`[Storage] Error deleting object (${objectKey}):`, err.message);
  }
}

export const deleteObjectFromMinio = deleteObjectFromStorage;

function guessMimeType(filename = '') {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webm': 'video/webm',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
  };
  return map[ext] || 'application/octet-stream';
}

export async function streamStorageObject(req, res, objectKey) {
  let stat;
  try {
    stat = await s3Client.statObject(bucketName, objectKey);
  } catch (err) {
    if (err.code === 'NotFound' || err.code === 'NoSuchKey' || err.statusCode === 404) {
      return res.status(404).json({ error: 'File not found in S3/MinIO storage.' });
    }
    console.error('[Storage] statObject error:', err.message);
    return res.status(502).json({ error: 'Error communicating with S3/MinIO storage.' });
  }

  const totalSize = stat.size;
  const contentType =
    stat.metaData?.['content-type'] ||
    stat.metaData?.['Content-Type'] ||
    guessMimeType(objectKey);

  const range = req.headers.range;

  if (range && totalSize > 0) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? Math.min(parseInt(parts[1], 10), totalSize - 1) : totalSize - 1;

    if (Number.isNaN(start) || start < 0 || start >= totalSize || end < start) {
      res.status(416).set('Content-Range', `bytes */${totalSize}`).end();
      return;
    }

    const chunkLength = end - start + 1;
    const partialStream = await s3Client.getPartialObject(
      bucketName,
      objectKey,
      start,
      chunkLength
    );

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkLength,
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=86400',
    });

    req.on('close', () => {
      if (typeof partialStream.destroy === 'function') partialStream.destroy();
    });

    partialStream.on('error', (err) => {
      console.error('[Storage] Partial stream error:', err.message);
      if (!res.headersSent) res.status(502).end();
      else res.end();
    });

    partialStream.pipe(res);
    return;
  }

  const fullStream = await s3Client.getObject(bucketName, objectKey);
  res.writeHead(200, {
    'Content-Length': totalSize,
    'Accept-Ranges': 'bytes',
    'Content-Type': contentType,
    'Cache-Control': 'private, max-age=86400',
  });

  req.on('close', () => {
    if (typeof fullStream.destroy === 'function') fullStream.destroy();
  });

  fullStream.on('error', (err) => {
    console.error('[Storage] Stream error:', err.message);
    if (!res.headersSent) res.status(502).end();
    else res.end();
  });

  fullStream.pipe(res);
}

export const streamMinioObject = streamStorageObject;
