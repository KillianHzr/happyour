import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";

const MANIFEST_KEY = "media_cache_v2";
// Marker stored in manifest for images handled by expo-image's own disk cache
const PREFETCHED = "prefetched";

/**
 * Singleton in-memory manifest.
 * - audio/video paths → local filesystem URI (FileSystem.cacheDirectory/...)
 * - photo/drawing paths → "prefetched" (expo-image disk cache, access via same R2 URL)
 */
class MediaCacheManager {
  private manifest: Record<string, string> = {};
  private loadPromise: Promise<void> | null = null;

  /** Load manifest from AsyncStorage and validate that local files still exist. */
  async load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(MANIFEST_KEY);
        if (!raw) return;
        const stored: Record<string, string> = JSON.parse(raw);

        // Validate local files — remove entries whose file was deleted (e.g. cache cleared)
        const validated: Record<string, string> = {};
        await Promise.all(
          Object.entries(stored).map(async ([path, uri]) => {
            if (uri === PREFETCHED) {
              validated[path] = uri; // expo-image manages its own eviction
            } else {
              try {
                const info = await FileSystem.getInfoAsync(uri);
                if (info.exists) validated[path] = uri;
                // else: file gone → entry dropped, getLocalUri() returns null → R2 URL used
              } catch {
                validated[path] = uri; // keep on stat error, will be re-checked next open
              }
            }
          })
        );

        this.manifest = validated;
        // Persist cleaned manifest if some stale entries were removed
        if (Object.keys(validated).length !== Object.keys(stored).length) {
          await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(validated));
        }
      } catch {}
    })();
    return this.loadPromise;
  }

  /**
   * Returns the local URI for audio/video files that have been downloaded.
   * Returns null for photos (expo-image uses the original URL from its own cache).
   */
  getLocalUri(path: string): string | null {
    const entry = this.manifest[path];
    if (!entry || entry === PREFETCHED) return null;
    return entry;
  }

  /** Returns true if this path has already been handled (prefetched or downloaded). */
  isCached(path: string): boolean {
    return !!this.manifest[path];
  }

  /**
   * Background sync: for each photo (primary + secondary capture) that hasn't been
   * cached yet, either prefetch it into expo-image's disk cache (photos/drawings)
   * or download it to the local filesystem (audio/video).
   * Fire-and-forget — does not block the UI.
   */
  sync(photos: Array<{ image_path: string; second_image_path?: string | null; url: string; second_url?: string }>): void {
    this._syncAsync(photos).catch(() => {});
  }

  private async _syncAsync(
    photos: Array<{ image_path: string; second_image_path?: string | null; url: string; second_url?: string }>
  ): Promise<void> {
    await this.load();

    const newEntries: Record<string, string> = {};

    const process = async (path: string, url: string) => {
      if (!path || path === "text_mode" || this.manifest[path]) return;

      const isAudio = path.endsWith(".m4a");
      const isVideo = path.endsWith(".mp4");

      if (isAudio || isVideo) {
        const filename = "hc_" + path.replace(/\//g, "_");
        const localUri = (FileSystem.cacheDirectory ?? "") + filename;
        try {
          const info = await FileSystem.getInfoAsync(localUri);
          if (!info.exists) {
            await FileSystem.downloadAsync(url, localUri);
          }
          newEntries[path] = localUri;
          this.manifest[path] = localUri;
        } catch {
          // Network failure — will retry next sync
        }
      } else {
        try {
          await Image.prefetch(url);
          newEntries[path] = PREFETCHED;
          this.manifest[path] = PREFETCHED;
        } catch {}
      }
    };

    // Process all photos in parallel (batched to avoid hammering the network)
    const tasks: Promise<void>[] = [];
    for (const p of photos) {
      tasks.push(process(p.image_path, p.url));
      if (p.second_image_path && p.second_image_path !== "text_mode" && p.second_url) {
        tasks.push(process(p.second_image_path, p.second_url));
      }
    }

    // Run in batches of 5 to avoid saturating the network
    for (let i = 0; i < tasks.length; i += 5) {
      await Promise.all(tasks.slice(i, i + 5));
    }

    if (Object.keys(newEntries).length > 0) {
      try {
        await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(this.manifest));
      } catch {}
    }
  }

  /**
   * Remove cached entries that are no longer in the current week's media set.
   * - Audio/video: deletes the local file from the filesystem.
   * - Photos (prefetched): just removes the manifest entry (expo-image handles eviction itself).
   * Call this after fetchAllData with the full set of active paths.
   */
  async cleanup(activePaths: string[]): Promise<void> {
    await this.load();
    const activeSet = new Set(activePaths);
    const stale = Object.keys(this.manifest).filter((p) => !activeSet.has(p));
    if (stale.length === 0) return;

    await Promise.all(
      stale.map(async (path) => {
        const entry = this.manifest[path];
        if (entry && entry !== PREFETCHED) {
          // Local filesystem file — delete it
          await FileSystem.deleteAsync(entry, { idempotent: true }).catch(() => {});
        }
        delete this.manifest[path];
      })
    );

    try {
      await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(this.manifest));
    } catch {}
  }

  /** Clear the manifest (useful for debugging / forced refresh). */
  async clear(): Promise<void> {
    this.manifest = {};
    this.loadPromise = null;
    await AsyncStorage.removeItem(MANIFEST_KEY);
  }
}

export const mediaCache = new MediaCacheManager();
