export type Reaction = {
  id: string;
  user_id: string;
  username: string;
  avatar_url?: string | null;
  sticker_id: string; // Used for both emojis and custom text strings
};

export type PhotoEntry = {
  id: string;
  url: string;
  fallback_url?: string;
  created_at: string;
  note: string | null;
  username: string;
  avatar_url?: string | null;
  image_path: string;
  second_image_path?: string | null;
  audio_note_path?: string | null;
  user_id: string;
  reactions: Reaction[];
  groupName?: string | null;
  hasNewComments?: boolean;
};
