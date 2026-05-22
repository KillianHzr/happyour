import React, { createContext, useContext, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { r2Storage } from "./r2";
import { supabase } from "./supabase";
import { notifyNewPhoto, cancelFirstMomentReminder, cancelPostReminderNotification } from "./notifications";

type UploadTask = {
  id: string;
  progress: number;
  status: "uploading" | "success" | "error";
  type: "photo" | "video" | "texte" | "audio" | "dessin";
};

type SecondFile = {
  fileName: string | null;
  fileUri: string | null;
  contentType: string | null;
  note?: string | null; // texte de la 2e capture si text_mode
} | null;

type CaptionAudioFile = {
  fileName: string;
  fileUri: string;
  contentType: string;
} | null;

type UploadContextType = {
  activeUploads: UploadTask[];
  startUpload: (
    fileName: string | null,
    fileUri: string | null,
    contentType: string | null,
    dbData: { group_id: string; user_id: string; note: string | null },
    secondFile?: SecondFile,
    captionAudioFile?: CaptionAudioFile
  ) => void;
  startChallengeUpload: (
    challengeId: string,
    fileName: string | null,
    fileUri: string | null,
    contentType: string | null,
    dbData: { group_id: string; user_id: string; note: string | null },
    secondFile?: SecondFile,
    isTargetResponse?: boolean
  ) => void;
};

async function uploadFilesToR2(
  fileName: string | null,
  fileUri: string | null,
  contentType: string | null,
  secondFile: SecondFile | undefined,
  captionAudioFile?: { fileName: string; fileUri: string; contentType: string } | null
): Promise<{ finalPath: string; secondPath: string | null; captionAudioPath: string | null }> {
  let finalPath = "text_mode";
  if (fileName && fileUri && contentType) {
    const isVideo = contentType.includes("video") || fileName.endsWith(".mp4");
    const isAudio = contentType.includes("audio") || fileName.endsWith(".m4a");
    const isImage = contentType.includes("image") || fileName.endsWith(".jpg") || fileName.endsWith(".jpeg");

    let uploadUri = fileUri;

    // Compression différée pour les images (Photos et Dessins)
    if (isImage && !fileName.includes("_draw")) {
       const result = await manipulateAsync(fileUri, [], { compress: 0.8, format: SaveFormat.JPEG });
       uploadUri = result.uri;
    }

    if (isVideo || isAudio) {
      const presignedUrl = await r2Storage.getPresignedUploadUrl(fileName, contentType);
      const uploadResult = await FileSystem.uploadAsync(presignedUrl, uploadUri, {
        httpMethod: "PUT",
        headers: { "Content-Type": contentType },
      });
      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error(`Upload échoué: HTTP ${uploadResult.status}`);
      }
    } else {
      const base64 = await FileSystem.readAsStringAsync(uploadUri, { encoding: FileSystem.EncodingType.Base64 });
      await r2Storage.upload(fileName, decode(base64), contentType);
    }
    finalPath = fileName;
  }

  let secondPath: string | null = null;
  if (secondFile != null) {
    if (secondFile.fileName === null) {
      secondPath = "text_mode";
    } else if (secondFile.fileName && secondFile.fileUri && secondFile.contentType) {
      const sf = secondFile as { fileName: string; fileUri: string; contentType: string };
      const isSecondVideo = sf.contentType.includes("video") || sf.fileName.endsWith(".mp4");
      const isSecondAudio = sf.contentType.includes("audio") || sf.fileName.endsWith(".m4a");
      const isSecondImage = sf.contentType.includes("image") || sf.fileName.endsWith(".jpg") || sf.fileName.endsWith(".jpeg");

      let secondUploadUri = sf.fileUri;

      if (isSecondImage && !sf.fileName.includes("_draw")) {
        const result2 = await manipulateAsync(sf.fileUri, [], { compress: 0.8, format: SaveFormat.JPEG });
        secondUploadUri = result2.uri;
      }

      if (isSecondVideo || isSecondAudio) {
        const presignedUrl2 = await r2Storage.getPresignedUploadUrl(sf.fileName, sf.contentType);
        const uploadResult2 = await FileSystem.uploadAsync(presignedUrl2, secondUploadUri, {
          httpMethod: "PUT",
          headers: { "Content-Type": sf.contentType },
        });
        if (uploadResult2.status < 200 || uploadResult2.status >= 300) {
          throw new Error(`Upload 2e capture échoué: HTTP ${uploadResult2.status}`);
        }
      } else {
        const base64b = await FileSystem.readAsStringAsync(secondUploadUri, { encoding: FileSystem.EncodingType.Base64 });
        await r2Storage.upload(sf.fileName, decode(base64b), sf.contentType);
      }
      secondPath = sf.fileName;
    }
  }

  let captionAudioPath: string | null = null;
  if (captionAudioFile && captionAudioFile.fileName && captionAudioFile.fileUri) {
    const presignedUrl3 = await r2Storage.getPresignedUploadUrl(captionAudioFile.fileName, captionAudioFile.contentType);
    const uploadResult3 = await FileSystem.uploadAsync(presignedUrl3, captionAudioFile.fileUri, {
      httpMethod: "PUT",
      headers: { "Content-Type": captionAudioFile.contentType },
    });
    if (uploadResult3.status >= 200 && uploadResult3.status < 300) {
      captionAudioPath = captionAudioFile.fileName;
    }
  }

  return { finalPath, secondPath, captionAudioPath };
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [activeUploads, setActiveUploads] = useState<UploadTask[]>([]);

  const startUpload = (
    fileName: string | null,
    fileUri: string | null,
    contentType: string | null,
    dbData: { group_id: string; user_id: string; note: string | null },
    secondFile?: SecondFile,
    captionAudioFile?: CaptionAudioFile
  ) => {
    const taskId = Math.random().toString(36).substring(7);
    
    // Identification plus robuste du type
    let type: "photo" | "video" | "texte" | "audio" | "dessin" = "photo";
    if (fileName === null) {
      type = "texte";
    } else if (contentType?.includes("audio") || fileName.endsWith(".m4a")) {
      type = "audio";
    } else if (contentType?.includes("video") || fileName.endsWith(".mp4")) {
      type = "video";
    } else if (fileName.includes("_draw")) {
      type = "dessin";
    }

    setActiveUploads((prev) => [...prev, { id: taskId, progress: 0.1, status: "uploading", type }]);

    (async () => {
      try {
        const [groupRes, profileRes] = await Promise.all([
          supabase.from("groups").select("name").eq("id", dbData.group_id).single(),
          supabase.from("profiles").select("username").eq("id", dbData.user_id).single(),
        ]);
        
        const groupName = groupRes.data?.name ?? "Groupe";
        const username = profileRes.data?.username ?? "Quelqu'un";
        setActiveUploads((prev) => prev.map(t => t.id === taskId ? { ...t, progress: 0.3 } : t));

        const { finalPath, secondPath, captionAudioPath } = await uploadFilesToR2(fileName, fileUri, contentType, secondFile, captionAudioFile);
        setActiveUploads((prev) => prev.map(t => t.id === taskId ? { ...t, progress: 0.8 } : t));

        const { error: dbError } = await supabase.from("photos").insert({
          group_id: dbData.group_id,
          user_id: dbData.user_id,
          image_path: finalPath,
          note: dbData.note,
          ...(secondPath !== null ? { second_image_path: secondPath } : {}),
          ...(captionAudioPath !== null ? { audio_note_path: captionAudioPath } : {}),
        });

        if (dbError) throw dbError;

        notifyNewPhoto(dbData.group_id, groupName, username, dbData.user_id);
        cancelFirstMomentReminder(dbData.group_id);
        cancelPostReminderNotification(dbData.group_id);

        setActiveUploads((prev) => prev.map(t => t.id === taskId ? { ...t, progress: 1, status: "success" } : t));
        
        setTimeout(() => {
          setActiveUploads((prev) => prev.filter((t) => t.id !== taskId));
        }, 4000);

      } catch (error) {
        console.error(`[Upload ${taskId}] Erreur:`, error);
        setActiveUploads((prev) => prev.map(t => t.id === taskId ? { ...t, status: "error" } : t));
        setTimeout(() => {
          setActiveUploads((prev) => prev.filter((t) => t.id !== taskId));
        }, 10000);
      }
    })();
  };

  const startChallengeUpload = (
    challengeId: string,
    fileName: string | null,
    fileUri: string | null,
    contentType: string | null,
    dbData: { group_id: string; user_id: string; note: string | null },
    secondFile?: SecondFile,
    isTargetResponse = false
  ) => {
    const taskId = Math.random().toString(36).substring(7);

    let type: "photo" | "video" | "texte" | "audio" | "dessin" = "photo";
    if (fileName === null) {
      type = "texte";
    } else if (contentType?.includes("audio") || fileName.endsWith(".m4a")) {
      type = "audio";
    } else if (contentType?.includes("video") || fileName.endsWith(".mp4")) {
      type = "video";
    } else if (fileName.includes("_draw")) {
      type = "dessin";
    }

    setActiveUploads((prev) => [...prev, { id: taskId, progress: 0.1, status: "uploading", type }]);

    (async () => {
      try {
        setActiveUploads((prev) => prev.map(t => t.id === taskId ? { ...t, progress: 0.3 } : t));

        const { finalPath, secondPath } = await uploadFilesToR2(fileName, fileUri, contentType, secondFile);
        setActiveUploads((prev) => prev.map(t => t.id === taskId ? { ...t, progress: 0.8 } : t));

        const { error: dbError } = await supabase.from("challenge_responses").insert({
          challenge_id: challengeId,
          user_id: dbData.user_id,
          image_path: finalPath,
          note: dbData.note,
          is_target_response: isTargetResponse,
          ...(secondPath !== null ? { second_image_path: secondPath } : {}),
        });

        if (dbError) throw dbError;

        cancelFirstMomentReminder(dbData.group_id);
        cancelPostReminderNotification(dbData.group_id);

        setActiveUploads((prev) => prev.map(t => t.id === taskId ? { ...t, progress: 1, status: "success" } : t));
        setTimeout(() => {
          setActiveUploads((prev) => prev.filter((t) => t.id !== taskId));
        }, 4000);
      } catch (error) {
        console.error(`[ChallengeUpload ${taskId}] Erreur:`, error);
        setActiveUploads((prev) => prev.map(t => t.id === taskId ? { ...t, status: "error" } : t));
        setTimeout(() => {
          setActiveUploads((prev) => prev.filter((t) => t.id !== taskId));
        }, 10000);
      }
    })();
  };

  return (
    <UploadContext.Provider value={{ activeUploads, startUpload, startChallengeUpload }}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  const context = useContext(UploadContext);
  if (!context) throw new Error("useUpload must be used within UploadProvider");
  return context;
}
