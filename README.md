# SpicyVPN 🌶️

> Invisible. Unstoppable.

## Structure

```
desktop/    Tauri desktop app (Windows · macOS · Linux)
android/    Flutter mobile app (Android + iOS)
website/    Next.js website + API (spicypepper.app)
```

## CI Builds

Every push triggers automatic builds via GitHub Actions:

| Platform | Artifact |
|----------|----------|
| Windows  | `.msi` installer |
| macOS    | `.dmg` |
| Linux    | `.AppImage` + `.deb` |
| Android  | `.apk` + `.aab` |
| iOS      | `.ipa` (unsigned) |

Download built artifacts from the **Actions** tab → latest run → **Artifacts**.

## How It Works

1. User signs in at **spicypepper.app** with Google
2. Gets a short `spx_xxxx` token
3. Pastes it into the desktop or mobile app
4. App fetches connection config from the API
5. Connected — all traffic tunnelled through the stealth server 🔒
