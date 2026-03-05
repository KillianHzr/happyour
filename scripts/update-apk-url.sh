#!/bin/bash
# Fetches the latest EAS Android build URL and updates Supabase app_config

set -e

# Load .env
DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$DIR/.env"

echo "⏳ Fetching latest Android build from EAS..."

APK_URL=$(eas build:list --platform android --status finished --limit 1 --json --non-interactive \
  | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const b=JSON.parse(d); console.log(b[0]?.artifacts?.buildUrl ?? '')")

if [ -z "$APK_URL" ]; then
  echo "❌ No build found or no artifact URL"
  exit 1
fi

echo "✅ Latest APK URL: $APK_URL"
echo ""
echo "⏳ Updating Supabase app_config..."

# Upsert apk_url in app_config via Supabase REST API
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X PATCH \
  "${EXPO_PUBLIC_SUPABASE_URL}/rest/v1/app_config?key=eq.apk_url" \
  -H "apikey: ${EXPO_PUBLIC_SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${EXPO_PUBLIC_SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{\"value\": \"${APK_URL}\"}")

if [ "$HTTP_STATUS" -ge 200 ] && [ "$HTTP_STATUS" -lt 300 ]; then
  echo "✅ apk_url updated in Supabase!"
else
  echo "❌ Failed to update Supabase (HTTP $HTTP_STATUS)"
  exit 1
fi
