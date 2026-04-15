import React, { createContext, useContext, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import { r2Storage } from "./r2";
import { supabase } from "./supabase";
import { notifyNewPhoto, cancelFirstMomentReminder } from "./notifications";

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

type UploadContextType = {
  activeUploads: UploadTask[];
  startUpload: (
    fileName: string | null, // null pour le texte
    fileUri: string | null,  // null pour le texte
    contentType: string | null,
    dbData: { group_id: string; user_id: string; note: string | null },
    secondFile?: SecondFile
  ) => void;
};

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [activeUploads, setActiveUploads] = useState<UploadTask[]>([]);

  const startUpload = (
    fileName: string | null,
    fileUri: string | null,
    contentType: string | null,
    dbData: { group_id: string; user_id: string; note: string | null },
    secondFile?: SecondFile
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

    console.log(`[Upload] Nouveau moment: ${type} (ID: ${taskId})`);
    setActiveUploads((prev) => [...prev, { id: taskId, progress: 0.1, status: "uploading", type }]);

    (async () => {
      try {
        console.log(`[Upload ${taskId}] 1. Récupération des infos groupe/profil...`);
        // 1. Récupérer les noms pour la notif (en parallèle de la lecture si besoin)
        const [groupRes, profileRes] = await Promise.all([
          supabase.from("groups").select("name").eq("id", dbData.group_id).single(),
          supabase.from("profiles").select("username").eq("id", dbData.user_id).single(),
        ]);
        
        const groupName = groupRes.data?.name ?? "Groupe";
        const username = profileRes.data?.username ?? "Quelqu'un";
        setActiveUploads((prev) => prev.map(t => t.id === taskId ? { ...t, progress: 0.3 } : t));

        // 2. Gestion du fichier (si c'est une photo/vidéo)
        let finalPath = "text_mode";
        if (fileName && fileUri && contentType) {
          const isVideo = contentType.includes("video") || fileName.endsWith(".mp4");
          const isAudio = contentType.includes("audio") || fileName.endsWith(".m4a");

          if (isVideo || isAudio) {
            // Vidéo : presigned URL + streaming natif (pas de lecture en mémoire JS)
            console.log(`[Upload ${taskId}] 2. Génération presigned URL...`);
            const presignedUrl = await r2Storage.getPresignedUploadUrl(fileName, contentType);
            console.log(`[Upload ${taskId}] 2. Upload vidéo en streaming...`);
            const uploadResult = await FileSystem.uploadAsync(presignedUrl, fileUri, {
              httpMethod: "PUT",
              headers: { "Content-Type": contentType },
            });
            if (uploadResult.status < 200 || uploadResult.status >= 300) {
              throw new Error(`Upload échoué: HTTP ${uploadResult.status}`);
            }
          } else {
            // Photo : lecture base64 (fichier petit, pas de freeze)
            console.log(`[Upload ${taskId}] 2. Lecture du fichier...`);
            const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
            const arrayBuffer = decode(base64);
            console.log(`[Upload ${taskId}] 2. Upload vers R2...`);
            await r2Storage.upload(fileName, arrayBuffer, contentType);
          }

          setActiveUploads((prev) => prev.map(t => t.id === taskId ? { ...t, progress: 0.5 } : t));
          finalPath = fileName;
        }

        // 2b. Upload du fichier secondaire (double capture)
        let secondPath: string | null = null;
        if (secondFile != null) {
          if (secondFile.fileName === null) {
            // text_mode second capture
            secondPath = "text_mode";
          } else if (secondFile.fileName && secondFile.fileUri && secondFile.contentType) {
            const sf = secondFile as { fileName: string; fileUri: string; contentType: string };
            const isSecondVideo = sf.contentType.includes("video") || sf.fileName.endsWith(".mp4");
            const isSecondAudio = sf.contentType.includes("audio") || sf.fileName.endsWith(".m4a");
            if (isSecondVideo || isSecondAudio) {
              const presignedUrl2 = await r2Storage.getPresignedUploadUrl(sf.fileName, sf.contentType);
              const uploadResult2 = await FileSystem.uploadAsync(presignedUrl2, sf.fileUri, {
                httpMethod: "PUT",
                headers: { "Content-Type": sf.contentType },
              });
              if (uploadResult2.status < 200 || uploadResult2.status >= 300) {
                throw new Error(`Upload 2e capture échoué: HTTP ${uploadResult2.status}`);
              }
            } else {
              const base64b = await FileSystem.readAsStringAsync(sf.fileUri, { encoding: FileSystem.EncodingType.Base64 });
              await r2Storage.upload(sf.fileName, decode(base64b), sf.contentType);
            }
            secondPath = sf.fileName;
          }
        }

        setActiveUploads((prev) => prev.map(t => t.id === taskId ? { ...t, progress: 0.8 } : t));

        console.log(`[Upload ${taskId}] 3. Enregistrement en BDD... secondPath=${secondPath}`);
        // 3. Enregistrement en BDD
        const { error: dbError } = await supabase.from("photos").insert({
          group_id: dbData.group_id,
          user_id: dbData.user_id,
          image_path: finalPath,
          note: dbData.note,
          ...(secondPath !== null ? { second_image_path: secondPath } : {}),
          ...(secondPath === "text_mode" && secondFile?.note ? { second_note: secondFile.note } : {}),
        });

        if (dbError) throw dbError;

        console.log(`[Upload ${taskId}] 4. Envoi notification...`);
        // 4. Notification + annulation reminder premier moment
        notifyNewPhoto(dbData.group_id, groupName, username, dbData.user_id);
        cancelFirstMomentReminder(dbData.group_id);

        console.log(`[Upload ${taskId}] 5. Succès !`);
        // Succès
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

  return (
    <UploadContext.Provider value={{ activeUploads, startUpload }}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  const context = useContext(UploadContext);
  if (!context) throw new Error("useUpload must be used within UploadProvider");
  return context;
}
