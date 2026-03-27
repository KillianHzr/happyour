import React, { createContext, useContext, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import { r2Storage } from "./r2";
import { supabase } from "./supabase";
import { notifyNewPhoto } from "./notifications";

type UploadTask = {
  id: string;
  progress: number;
  status: "uploading" | "success" | "error";
  type: "photo" | "video" | "texte";
};

type UploadContextType = {
  activeUploads: UploadTask[];
  startUpload: (
    fileName: string | null, // null pour le texte
    fileUri: string | null,  // null pour le texte
    contentType: string | null,
    dbData: { group_id: string; user_id: string; note: string | null }
  ) => void;
};

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [activeUploads, setActiveUploads] = useState<UploadTask[]>([]);

  const startUpload = (
    fileName: string | null,
    fileUri: string | null,
    contentType: string | null,
    dbData: { group_id: string; user_id: string; note: string | null }
  ) => {
    const taskId = Math.random().toString(36).substring(7);
    
    // Identification plus robuste du type
    let type: "photo" | "video" | "texte" = "photo";
    if (fileName === null) {
      type = "texte";
    } else if (contentType?.includes("video") || fileName.endsWith(".mp4")) {
      type = "video";
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
          console.log(`[Upload ${taskId}] 2. Lecture du fichier...`);
          const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
          const arrayBuffer = decode(base64);
          setActiveUploads((prev) => prev.map(t => t.id === taskId ? { ...t, progress: 0.5 } : t));
          
          console.log(`[Upload ${taskId}] 2. Upload vers R2...`);
          await r2Storage.upload(fileName, arrayBuffer, contentType);
          finalPath = fileName;
        }

        setActiveUploads((prev) => prev.map(t => t.id === taskId ? { ...t, progress: 0.8 } : t));

        console.log(`[Upload ${taskId}] 3. Enregistrement en BDD...`);
        // 3. Enregistrement en BDD
        const { error: dbError } = await supabase.from("photos").insert({
          group_id: dbData.group_id,
          user_id: dbData.user_id,
          image_path: finalPath,
          note: dbData.note,
        });

        if (dbError) throw dbError;

        console.log(`[Upload ${taskId}] 4. Envoi notification...`);
        // 4. Notification
        notifyNewPhoto(dbData.group_id, groupName, username, dbData.user_id);

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
