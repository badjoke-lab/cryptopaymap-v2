import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

type SubmissionMediaKind = "gallery" | "proof" | "evidence";

type R2Env = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

let cachedClient: S3Client | null = null;
let cachedEnv: R2Env | null = null;

const getR2Env = (): R2Env => {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("R2_NOT_CONFIGURED");
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
  };
};

const getR2Client = () => {
  if (cachedClient && cachedEnv) {
    return { client: cachedClient, env: cachedEnv };
  }

  const env = getR2Env();
  const endpoint = `https://${env.accountId}.r2.cloudflarestorage.com`;

  cachedClient = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
  });
  cachedEnv = env;

  return { client: cachedClient, env };
};

export const buildSubmissionMediaKey = (
  submissionId: string,
  kind: SubmissionMediaKind,
  mediaId: string,
) => `submissions/${submissionId}/${kind}/${mediaId}.webp`;

export const uploadSubmissionMediaObject = async (params: {
  submissionId: string;
  kind: SubmissionMediaKind;
  mediaId: string;
  body: Buffer;
  contentType: "image/webp";
}) => {
  const { client, env } = getR2Client();
  const key = buildSubmissionMediaKey(params.submissionId, params.kind, params.mediaId);

  await client.send(
    new PutObjectCommand({
      Bucket: env.bucket,
      Key: key,
      Body: params.body,
      ContentType: params.contentType,
    }),
  );

  return { key };
};

export const deleteSubmissionMediaObject = async (key: string) => {
  const { client, env } = getR2Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: env.bucket,
      Key: key,
    }),
  );
};

export type { SubmissionMediaKind };
