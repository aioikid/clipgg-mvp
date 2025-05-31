import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import type { NextApiRequest, NextApiResponse } from 'next';

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { url, fields } = await createPresignedPost(s3Client, {
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: `uploads/${Date.now()}-${Math.random().toString(36).substring(7)}`,
      Conditions: [
        ['content-length-range', 0, 104857600], // up to 100MB
        ['starts-with', '$Content-Type', 'video/'],
      ],
      Expires: 600, // 10 minutes
    });

    res.status(200).json({ url, fields });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    res.status(500).json({ message: 'Error generating upload URL' });
  }
}