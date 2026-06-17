import React, { createContext, useContext, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, FlipType, SaveFormat } from "expo-image-manipulator";
import { supabase } from "./supabase";
import { r2Storage } from "./r2";

type UploadStatus = "uploading" | "success" | "error";

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
): Promise<{ finalPath: string; secondPath: string | null; captionAudioPath: string | null }> {
  let finalPath = "text_mode";
  if (fileName && fileUri && contentType) {
    const isImage = contentType.includes("image") || fileName.endsWith(".jpg") || fileName.endsWith(".jpeg");

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
    finalPath = fileName;
  }

  let secondPath: string | null = null;
  if (secondFile != null) {
    if (secondFile.fileName === null) {
      secondPath = "text_mode";
    } else if (secondFile.fileName && secondFile.fileUri && secondFile.contentType) {
      const sf = secondFile as { fileName: string; fileUri: string; contentType: string };
      const isSecondImage = sf.contentType.includes("image") || sf.fileName.endsWith(".jpg") || sf.fileName.endsWith(".jpeg");

      let secondUploadUri = sf.fileUri;

      if (isSecondImage && !sf.fileName.includes("_draw")) {
        const result2 = await manipulateAsync(sf.fileUri, [], { compress: 0.8, format: SaveFormat.JPEG });
        secondUploadUri = result2.uri;
      }

      await streamUpload(sf.fileName, secondUploadUri, sf.contentType);
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

  return { finalPath, secondPath, captionAudioPath };
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
        const { finalPath, secondPath, captionAudioPath } = await uploadFilesToR2(fileName, fileUri, contentType, secondFile, captionAudioFile, mirrorPrimary);
        
        const { error } = await supabase.from("photos").insert([{
          ...dbData,
          image_path: finalPath,
          second_image_path: secondPath,
          audio_note_path: captionAudioPath,
          waveform: waveform || null,
          caption_waveform: captionWaveform || null
        }]);

        if (error) throw error;
        setUploads(prev => prev.map(u => u.id === id ? { ...u, status: "success", progress: 100 } : u));
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
        const { finalPath, secondPath } = await uploadFilesToR2(fileName, fileUri, contentType, secondFile);
        
        const { data: insertedData, error } = await supabase.from("photos").insert([{
          ...dbData,
          image_path: finalPath,
          second_image_path: secondPath,
        }]).select();

        if (error) throw error;

        if (insertedData && insertedData[0]) {
           await supabase.from("challenge_entries").insert([{
             challenge_id: challengeId,
             photo_id: insertedData[0].id,
             is_target: isTarget || false
           }]);
        }

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
