import "react-native-url-polyfill/auto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Polyfill pour crypto.getRandomValues
 * Indispensable pour le SDK AWS S3 sur React Native sans modules natifs additionnels.
 * Utilise Math.random comme fallback pour éviter l'erreur "Native module not found".
 */
if (typeof global.crypto !== "object") {
  // @ts-ignore
  global.crypto = {};
}
if (typeof global.crypto.getRandomValues !== "function") {
  // @ts-ignore
  global.crypto.getRandomValues = (array: any) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  };
}

const R2_ACCESS_KEY_ID = process.env.EXPO_PUBLIC_R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.EXPO_PUBLIC_R2_SECRET_ACCESS_KEY!;
const R2_ENDPOINT = process.env.EXPO_PUBLIC_R2_ENDPOINT!;
const R2_BUCKET_NAME = process.env.EXPO_PUBLIC_R2_BUCKET_NAME!;

// Initialisation du client S3 pour Cloudflare R2
const s3Client = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export const r2Storage = {
  /**
   * Upload un fichier (en format Buffer/ArrayBuffer) vers R2
   */
  async upload(fileName: string, body: ArrayBuffer, contentType: string) {
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fileName,
      Body: new Uint8Array(body),
      ContentType: contentType,
    });

    try {
      await s3Client.send(command);
      return { success: true, key: fileName };
    } catch (error) {
      console.error("R2 Upload Error:", error);
      throw error;
    }
  },

  /**
   * Génère une presigned URL pour uploader un fichier directement vers R2 sans passer par la mémoire JS.
   */
  async getPresignedUploadUrl(fileName: string, contentType: string, expiresIn = 3600) {
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fileName,
      ContentType: contentType,
    });
    return getSignedUrl(s3Client, command, { expiresIn });
  },

  /**
   * Génère l'URL publique pour un fichier stocké sur R2.
   */
  getPublicUrl(key: string) {
    const publicUrl = process.env.EXPO_PUBLIC_R2_PUBLIC_URL;
    
    if (publicUrl) {
      return `${publicUrl.replace(/\/$/, "")}/${key}`;
    }

    return `${R2_ENDPOINT}/${R2_BUCKET_NAME}/${key}`;
  },
};
