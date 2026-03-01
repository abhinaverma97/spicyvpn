# SpicyVPN - Flutter App

## Setup

1. Install Flutter: https://flutter.dev/docs/get-started/install
2. Clone/copy this folder to your machine
3. Run: `flutter pub get`
4. Connect Android device or start emulator
5. Run: `flutter run`

## Build APK

```bash
flutter build apk --release
```
APK will be at: `build/app/outputs/flutter-apk/app-release.apk`

## Build for Play Store (AAB)

```bash
flutter build appbundle --release
```

## How It Works

1. User opens app
2. Taps "Enter your token"
3. Pastes their `spx_xxxx` token from spicypepper.app
4. App calls `GET https://spicypepper.app/api/connect?token=spx_xxxx`
5. Server returns connection config (JSON)
6. App starts VPN tunnel using flutter_v2ray
7. User is connected

## Dependencies

- `flutter_v2ray` — Xray/V2Ray core for Android VPN tunnel
- `http` — API calls to your backend
- `shared_preferences` — Save token locally
- `permission_handler` — Request VPN permission

## Customization

- App name: `pubspec.yaml` → `name`
- API URL: `lib/services/api_service.dart` → `baseUrl`
- Colors/theme: `lib/main.dart` → `ThemeData`
