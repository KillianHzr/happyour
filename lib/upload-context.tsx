import React, { createContext, useContext, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, FlipType, SaveFormat } from "expo-image-manipulator";
import { supabase } from "./supabase";
import { r2Storage } from "./r2";
import { scheduleNoShareReminder } from "./notifications";

type UploadStatus = "uploading" | "success" | "error";

let VideoThumbnails: any = null;
try {
  VideoThumbnails = require("expo-video-thumbnails");
} catch (e) {
  console.warn("expo-video-thumbnails is not available natively:", e);
}

interface UploadState {
  id: string;
  progress: number;
  status: UploadStatus;
  type: string;
}

type SecondFile = {
  fileName: string | null;
  fileUri: string | null;
  contentType: string | null;
};

type CaptionAudioFile = {
  fileName: string;
  fileUri: string;
  contentType: string;
};

interface UploadContextType {
  uploads: UploadState[];
  startUpload: (
    fileName: string | null,
    fileUri: string | null,
    contentType: string | null,
    dbData: any,
    secondFile?: SecondFile,
    captionAudioFile?: CaptionAudioFile,
    waveform?: number[],
    captionWaveform?: number[],
    mirrorPrimary?: boolean
  ) => void;
  startChallengeUpload: (
    challengeId: string,
    fileName: string | null,
    fileUri: string | null,
    contentType: string | null,
    dbData: any,
    secondFile?: SecondFile,
    isTarget?: boolean,
    waveform?: number[]
  ) => void;
  clearUpload: (id: string) => void;
}

const UploadContext = createContext<UploadContextType | null>(null);

/** Upload streaming natif (presigned PUT) — aucune lecture base64 sur le thread JS, donc pas de freeze. */
async function streamUpload(fileName: string, fileUri: string, contentType: string) {
  const presignedUrl = await r2Storage.getPresignedUploadUrl(fileName, contentType);
  const res = await FileSystem.uploadAsync(presignedUrl, fileUri, {
    httpMethod: "PUT",
    headers: { "Content-Type": contentType },
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Upload échoué: HTTP ${res.status}`);
  }
}

async function uploadFilesToR2(
  fileName: string | null,
  fileUri: string | null,
  contentType: string | null,
  secondFile: SecondFile | undefined,
  captionAudioFile?: { fileName: string; fileUri: string; contentType: string } | null,
  mirrorPrimary?: boolean
): Promise<{
  finalPath: string;
  secondPath: string | null;
  captionAudioPath: string | null;
  videoThumbnailPath: string | null;
  secondVideoThumbnailPath: string | null;
}> {
  let finalPath = "text_mode";
  let videoThumbnailPath: string | null = null;
  let secondVideoThumbnailPath: string | null = null;

  if (fileName && fileUri && contentType) {
    const isImage = contentType.includes("image") || fileName.endsWith(".jpg") || fileName.endsWith(".jpeg");
    const isVideo = contentType.includes("video") || fileName.endsWith(".mp4");

    let uploadUri = fileUri;

    // Compression (+ miroir caméra avant) différée à l'ENVOI pour les images (hors dessins).
    // manipulateAsync est natif/async → ne bloque pas le thread JS.
    if (isImage && !fileName.includes("_draw")) {
      const ops = mirrorPrimary ? [{ flip: FlipType.Horizontal }] : [];
      const result = await manipulateAsync(fileUri, ops, { compress: 0.8, format: SaveFormat.JPEG });
      uploadUri = result.uri;
    }

    // Tout (image/vidéo/audio) part en streaming natif — plus de base64 bloquant.
    await streamUpload(fileName, uploadUri, contentType);

    // Vignette pour les vidéos (1er slot) — générée puis uploadée elle aussi en streaming natif.
    if (isVideo && VideoThumbnails) {
      try {
        const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(uploadUri, {
          time: 0,
        });
        const thumbResult = await manipulateAsync(thumbUri, [], { compress: 0.7, format: SaveFormat.JPEG });
        const thumbFileName = fileName.substring(0, fileName.lastIndexOf('.')) + "_thumb.jpg";
        await streamUpload(thumbFileName, thumbResult.uri, "image/jpeg");
        videoThumbnailPath = thumbFileName;
      } catch (e) {
        console.error("Failed to generate video thumbnail:", e);
      }
    }
    finalPath = fileName;
  }

  let secondPath: string | null = null;
  if (secondFile != null) {
    if (secondFile.fileName === null) {
      secondPath = "text_mode";
    } else if (secondFile.fileName && secondFile.fileUri && secondFile.contentType) {
      const sf = secondFile as { fileName: string; fileUri: string; contentType: string };
      const isSecondImage = sf.contentType.includes("image") || sf.fileName.endsWith(".jpg") || sf.fileName.endsWith(".jpeg");
      const isSecondVideo = sf.contentType.includes("video") || sf.fileName.endsWith(".mp4");

      let secondUploadUri = sf.fileUri;

      if (isSecondImage && !sf.fileName.includes("_draw")) {
        const result2 = await manipulateAsync(sf.fileUri, [], { compress: 0.8, format: SaveFormat.JPEG });
        secondUploadUri = result2.uri;
      }

      await streamUpload(sf.fileName, secondUploadUri, sf.contentType);

      // Vignette pour les vidéos (2e slot) — uploadée elle aussi en streaming natif.
      if (isSecondVideo && VideoThumbnails) {
        try {
          const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(secondUploadUri, {
            time: 0,
          });
          const thumbResult = await manipulateAsync(thumbUri, [], { compress: 0.7, format: SaveFormat.JPEG });
          const thumbFileName = sf.fileName.substring(0, sf.fileName.lastIndexOf('.')) + "_thumb.jpg";
          await streamUpload(thumbFileName, thumbResult.uri, "image/jpeg");
          secondVideoThumbnailPath = thumbFileName;
        } catch (e) {
          console.error("Failed to generate second video thumbnail:", e);
        }
      }
      secondPath = sf.fileName;
    }
  }

  let captionAudioPath: string | null = null;
  if (captionAudioFile) {
    const presignedUrl = await r2Storage.getPresignedUploadUrl(captionAudioFile.fileName, captionAudioFile.contentType);
    await FileSystem.uploadAsync(presignedUrl, captionAudioFile.fileUri, {
      httpMethod: "PUT",
      headers: { "Content-Type": captionAudioFile.contentType },
    });
    captionAudioPath = captionAudioFile.fileName;
  }

  return { finalPath, secondPath, captionAudioPath, videoThumbnailPath, secondVideoThumbnailPath };
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [uploads, setUploads] = useState<UploadState[]>([]);

  const startUpload = (
    fileName: string | null,
    fileUri: string | null,
    contentType: string | null,
    dbData: any,
    secondFile?: SecondFile,
    captionAudioFile?: CaptionAudioFile,
    waveform?: number[],
    captionWaveform?: number[],
    mirrorPrimary?: boolean
  ) => {
    const id = Date.now().toString();
    const uploadType = contentType?.startsWith("video") ? "video" : contentType?.startsWith("audio") ? "audio" : !fileName ? "texte" : fileName.includes("_draw") ? "dessin" : "photo";
    setUploads(prev => [...prev, { id, progress: 0, status: "uploading", type: uploadType }]);

    (async () => {
      try {
        const { finalPath, secondPath, captionAudioPath, videoThumbnailPath, secondVideoThumbnailPath } = await uploadFilesToR2(fileName, fileUri, contentType, secondFile, captionAudioFile, mirrorPrimary);
        
        const { error } = await supabase.from("photos").insert([{
          ...dbData,
          image_path: finalPath,
          second_image_path: secondPath,
          audio_note_path: captionAudioPath,
          video_thumbnail_path: videoThumbnailPath,
          second_video_thumbnail_path: secondVideoThumbnailPath,
          waveform: waveform || null,
          caption_waveform: captionWaveform || null
        }]);

        if (error) throw error;
        setUploads(prev => prev.map(u => u.id === id ? { ...u, status: "success", progress: 100 } : u));

        // Re-arm the "Tu dors ?" reminder: it now fires 24h from THIS share (i.e. only if the
        // user stays silent for a full day).
        scheduleNoShareReminder().catch(() => {});

        // Notification de partage : gérée désormais CÔTÉ SERVEUR (trigger AFTER INSERT sur
        // `photos` → Edge Function `share-notify`), avec digest "leading + trailing" (1 notif
        // immédiate, puis regroupement par fenêtre de 30 min). Le client n'envoie plus de push
        // ici pour éviter le spam dans les grands groupes (et les doublons avec le backend).
      } catch (error) {
        console.error("[Upload Error]", error);
        setUploads(prev => prev.map(u => u.id === id ? { ...u, status: "error" } : u));
      }
    })();
  };

  const startChallengeUpload = (
    challengeId: string,
    fileName: string | null,
    fileUri: string | null,
    contentType: string | null,
    dbData: any,
    secondFile?: SecondFile,
    isTarget?: boolean,
    waveform?: number[]
  ) => {
    const id = Date.now().toString();
    const challengeUploadType = contentType?.startsWith("video") ? "video" : contentType?.startsWith("audio") ? "audio" : !fileName ? "texte" : fileName.includes("_draw") ? "dessin" : "photo";
    setUploads(prev => [...prev, { id, progress: 0, status: "uploading", type: challengeUploadType }]);

    (async () => {
      try {
        const { finalPath, secondPath, videoThumbnailPath, secondVideoThumbnailPath } = await uploadFilesToR2(fileName, fileUri, contentType, secondFile);
        
        const { error } = await supabase.from("challenge_responses").insert([{
          challenge_id: challengeId,
          user_id: dbData.user_id,
          image_path: finalPath,
          second_image_path: secondPath,
          note: dbData.note,
          video_thumbnail_path: videoThumbnailPath,
          second_video_thumbnail_path: secondVideoThumbnailPath,
          is_target_response: isTarget || false,
          waveform: waveform || null,
        }]);

        if (error) throw error;

        setUploads(prev => prev.map(u => u.id === id ? { ...u, status: "success", progress: 100 } : u));
      } catch (error) {
        console.error("[Challenge Upload Error]", error);
        setUploads(prev => prev.map(u => u.id === id ? { ...u, status: "error" } : u));
      }
    })();
  };

  const clearUpload = (id: string) => {
    setUploads(prev => prev.filter(u => u.id !== id));
  };

  return (
    <UploadContext.Provider value={{ uploads, startUpload, startChallengeUpload, clearUpload }}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  const context = useContext(UploadContext);
  if (!context) throw new Error("useUpload must be used within UploadProvider");
  return context;
}
