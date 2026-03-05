# HappyOur

App React Native (Expo SDK 55) de partage de moments en groupe. Backend Supabase.

## Setup

```bash
npm install
cp .env.example .env  # remplir les variables Supabase
npx expo start
```

## Commandes utiles

**Build APK + mettre à jour l'URL dans Supabase :**
```bash
eas build --platform android --profile preview && ./scripts/update-apk-url.sh
```

**Push une mise à jour OTA (sans rebuild) :**
```bash
eas update --branch preview --environment preview --platform android --message "description"
```

**Forcer les utilisateurs à mettre à jour l'APK :**
```sql
UPDATE app_config SET value = '2.0.0' WHERE key = 'min_app_version';
```
Puis incrémenter `version` dans `app.json` pour correspondre.

## Comment ça marche

- **OTA** : au lancement, l'app check s'il y a un update JS disponible et se recharge automatiquement
- **Mise à jour forcée** : l'app compare sa version avec `min_app_version` dans Supabase. Si elle est trop vieille → popup bloquante qui télécharge et installe le nouvel APK
