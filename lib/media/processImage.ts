import sharp from "sharp";

const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 80;

export class MediaProcessingError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "MediaProcessingError";
    if (options?.cause) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

type ProcessImageResult = {
  buffer: Buffer;
  contentType: "image/webp";
};

export const processImage = async (input: Buffer): Promise<ProcessImageResult> => {
  try {
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
  } catch (error) {
    throw new MediaProcessingError("Failed to process image", { cause: error });
  }
};

export const mediaProcessingConfig = {
  maxDimension: MAX_DIMENSION,
  webpQuality: WEBP_QUALITY,
} as const;
