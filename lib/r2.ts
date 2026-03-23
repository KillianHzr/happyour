import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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
   * Génère l'URL publique pour un fichier stocké sur R2.
   * Note : Nécessite que le bucket soit configuré en accès public 
   * ou qu'un domaine personnalisé soit configuré dans le dashboard Cloudflare.
   */
  getPublicUrl(key: string) {
    const publicUrl = process.env.EXPO_PUBLIC_R2_PUBLIC_URL;
    
    if (publicUrl) {
      // Supprime le slash final s'il existe et ajoute la clé
      return `${publicUrl.replace(/\/$/, "")}/${key}`;
    }

    // fallback par défaut (ne fonctionnera que si le bucket est public)
    // Format typique R2 Public : https://pub-<hash>.r2.dev/<key>
    return `${R2_ENDPOINT}/${R2_BUCKET_NAME}/${key}`;
  },
};
