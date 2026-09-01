import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.S3_ENDPOINT;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const bucketName = process.env.S3_BUCKET_NAME || "pdf-intelligence-storage";
const region = process.env.S3_REGION || "auto";

export const s3Client = new S3Client({
  region,
  endpoint,
  credentials:
    accessKeyId && secretAccessKey
      ? {
          accessKeyId,
          secretAccessKey,
        }
      : undefined,
  // Cloudflare R2 and most S3 providers require path-style URLs disabled or standard virtual-hosted
  forcePathStyle: false,
});

/**
 * Upload a file buffer directly to R2 from the server
 */
export async function uploadBufferToStorage(
  storageKey: string,
  buffer: Buffer,
  contentType: string = "application/pdf"
): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: storageKey,
    Body: buffer,
    ContentType: contentType,
  });

  await s3Client.send(command);
}

/**
 * Generate a presigned URL for direct client-to-R2 upload
 */
export async function getUploadPresignedUrl(
  storageKey: string,
  contentType: string = "application/pdf",
  expiresInSeconds: number = 300
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: storageKey,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Generate a presigned URL for viewing/downloading the PDF
 */
export async function getDownloadPresignedUrl(
  storageKey: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: storageKey,
  });

  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Fetch raw PDF bytes from R2 storage for server-side text extraction & chunking
 */
export async function getFileBuffer(storageKey: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: storageKey,
  });

  const response = await s3Client.send(command);
  if (!response.Body) {
    throw new Error(`File not found at storageKey: ${storageKey}`);
  }

  const byteArray = await response.Body.transformToByteArray();
  return Buffer.from(byteArray);
}

/**
 * Delete a file from R2 storage
 */
export async function deleteFileFromStorage(storageKey: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: storageKey,
  });

  await s3Client.send(command);
}
