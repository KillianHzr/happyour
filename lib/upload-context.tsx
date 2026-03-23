import React, { createContext, useContext, useState } from "react";
import { r2Storage } from "./r2";
import { supabase } from "./supabase";
import { notifyNewPhoto } from "./notifications";

type UploadTask = {
  id: string;
  progress: number;
  status: "uploading" | "success" | "error";
  type: "photo" | "video";
};

type UploadContextType = {
  activeUploads: UploadTask[];
  startUpload: (
    fileName: string,
    body: ArrayBuffer,
    contentType: string,
    dbData: { group_id: string; user_id: string; note: string | null; groupName: string; username: string }
  ) => Promise<void>;
};

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [activeUploads, setActiveUploads] = useState<UploadTask[]>([]);

  const startUpload = async (
    fileName: string,
    body: ArrayBuffer,
    contentType: string,
    dbData: { group_id: string; user_id: string; note: string | null; groupName: string; username: string }
  ) => {
    const taskId = Math.random().toString(36).substring(7);
    const type = contentType.includes("video") ? "video" : "photo";

    // Ajouter à la file d'attente
    setActiveUploads((prev) => [...prev, { id: taskId, progress: 0.1, status: "uploading", type }]);

    try {
      // 1. Upload vers R2
      // Note: Le SDK S3 ne donne pas de progression native facilement en RN, 
      // on simule une progression ou on attend la fin.
      await r2Storage.upload(fileName, body, contentType);
      
      setActiveUploads((prev) => prev.map(t => t.id === taskId ? { ...t, progress: 0.8 } : t));

      // 2. Enregistrement en BDD
      await supabase.from("photos").insert({
        group_id: dbData.group_id,
        user_id: dbData.user_id,
        image_path: fileName,
        note: dbData.note,
      });

      // 3. Notification aux autres membres
      notifyNewPhoto(dbData.group_id, dbData.groupName, dbData.username, dbData.user_id);

      // Succès
      setActiveUploads((prev) => prev.map(t => t.id === taskId ? { ...t, progress: 1, status: "success" } : t));
      
      // Retirer de la liste après 3 secondes
      setTimeout(() => {
        setActiveUploads((prev) => prev.filter((t) => t.id !== taskId));
      }, 3000);

    } catch (error) {
      console.error("Background Upload Error:", error);
      setActiveUploads((prev) => prev.map(t => t.id === taskId ? { ...t, status: "error" } : t));
    }
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
