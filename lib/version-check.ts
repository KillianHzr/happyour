import Constants from "expo-constants";
import { supabase } from "./supabase";

/**
 * Compare two semver strings (e.g. "1.2.3").
 * Returns true if `current` is older than `minimum`.
 */
function isVersionOutdated(current: string, minimum: string): boolean {
  const cur = current.split(".").map(Number);
  const min = minimum.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const c = cur[i] ?? 0;
    const m = min[i] ?? 0;
    if (c < m) return true;
    if (c > m) return false;
  }
  return false;
}

export async function checkAppVersion(): Promise<{
  needsUpdate: boolean;
  apkUrl: string;
}> {
  try {
    const { data, error } = await supabase
      .from("app_config")
      .select("key, value")
      .in("key", ["min_app_version", "apk_url"]);

    if (error || !data) return { needsUpdate: false, apkUrl: "" };

    const config = Object.fromEntries(data.map((r) => [r.key, r.value]));
    const minVersion = config["min_app_version"] ?? "1.0.0";
    const apkUrl = config["apk_url"] ?? "";
    const currentVersion = Constants.expoConfig?.version ?? "1.0.0";

    return {
      needsUpdate: isVersionOutdated(currentVersion, minVersion),
      apkUrl,
    };
  } catch {
    return { needsUpdate: false, apkUrl: "" };
  }
}
