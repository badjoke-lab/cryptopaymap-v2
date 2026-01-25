import sharp from "sharp";

const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 80;

type ProcessImageResult = {
  buffer: Buffer;
  contentType: "image/webp";
};

export const processImage = async (input: Buffer): Promise<ProcessImageResult> => {
  const pipeline = sharp(input, { failOn: "error" })
    .rotate()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY });

  const buffer = await pipeline.toBuffer();

  return {
    buffer,
    contentType: "image/webp",
  };
};

export const mediaProcessingConfig = {
  maxDimension: MAX_DIMENSION,
  webpQuality: WEBP_QUALITY,
} as const;
