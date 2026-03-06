# April Mobile

iOS and Android app for April, built with Expo SDK 55 (React Native 0.83, New Architecture).

## Prerequisites

- **Node.js** 18+
- **Xcode** 16.1+ (iOS builds)
- **CocoaPods** — install with `sudo gem install cocoapods` if not present
- **Apple Developer account** — free tier works for development builds on device

From the monorepo root, install all dependencies:

```bash
npm install
```

Build the core package (required before the first mobile run):

```bash
npm run build -w @april/core
```

## Development — iOS Simulator

```bash
# From monorepo root
npm run ios

# Or from packages/mobile
npx expo run:ios
```

The first run prebuilds the native `ios/` directory, installs pods, and compiles the Xcode project. Subsequent runs skip compilation if native code hasn't changed.

To target a specific simulator:

```bash
npx expo run:ios --device "iPhone 16 Pro"
```

After the initial native build, you can iterate on JS changes faster by starting only Metro:

```bash
npx expo start
```

Then press `i` to open in the already-installed simulator app.

## Development — Physical iOS Device

### One-time Xcode signing setup

1. Generate the native project if it doesn't exist yet:

   ```bash
   npx expo prebuild -p ios
   ```

2. Open the Xcode workspace:

   ```bash
   xed ios
   ```

3. In Xcode, select the **April** target → **Signing & Capabilities** tab:
   - Check **Automatically manage signing**
   - Select your **Development Team** (sign in to your Apple ID if prompted)

4. Connect your iPhone via USB or Wi-Fi. Xcode registers the device automatically.

5. On the device, trust the developer certificate:
   **Settings → General → VPN & Device Management** → tap your certificate → **Trust**

This setup is a one-time step per machine and Apple account.

### Running on device

Connect your device and run:

```bash
npx expo run:ios --device
```

Expo lists connected devices and lets you pick one. You can also pass the device name directly:

```bash
npx expo run:ios --device "Tom's iPhone"
```

Metro serves the JS bundle over your local network. Make sure the device and your Mac are on the same Wi-Fi.

## Release Build on Device

A release build bundles JS ahead-of-time (no Metro needed), enables optimizations, and disables dev tools.

### Local release build

```bash
npx expo run:ios --configuration Release --device
```

This compiles the app in Release mode and installs it directly on the connected device. You need the same Xcode signing setup described above.

> **Tip:** Add `--eager` to bundle JS with Metro before Xcode compiles. This catches JS errors earlier:
>
> ```bash
> npx expo run:ios --configuration Release --device --eager
> ```

### EAS Build (cloud)

For CI or distributing to testers via TestFlight:

1. Install the EAS CLI:

   ```bash
   npm install -g eas-cli
   ```

2. Configure:

   ```bash
   eas build:configure
   ```

3. Build:

   ```bash
   eas build --platform ios --profile production
   ```

EAS handles certificate management, provisioning profiles, and uploads to App Store Connect. Run `eas credentials` to manage signing credentials.

## Project Structure

```
packages/mobile/
  app/                  # Expo Router screens
    _layout.tsx         # Root layout (drawer navigation, init)
    index.tsx           # Main chat screen
    settings.tsx        # Settings screen
  src/
    components/         # React Native components
    hooks/              # useChat, useVoice
    platform/           # Storage, secure store, file CRUD
    stores/             # Zustand stores (settings, conversations)
    theme/              # Dark/light themes, ThemeProvider
    models.ts           # Model catalog
  ios/                  # Generated native project (gitignored)
  android/              # Generated native project (gitignored)
```

## Useful Commands

| Command | Description |
|---------|-------------|
| `npx expo start` | Start Metro dev server only |
| `npx expo run:ios` | Build and run on iOS simulator |
| `npx expo run:ios --device` | Build and run on physical device |
| `npx expo run:ios --configuration Release` | Local release build |
| `npx expo prebuild -p ios` | Generate/regenerate native `ios/` directory |
| `npx expo-doctor@latest` | Check environment for common issues |
| `npx tsc --noEmit` | Type-check without emitting |
| `xed ios` | Open Xcode workspace |

## Troubleshooting

**Pod install fails** — Delete `ios/Pods` and `ios/Podfile.lock`, then run `npx expo run:ios` again to reinstall.

**Metro can't resolve `@april/core`** — Make sure you ran `npm run build -w @april/core` from the monorepo root. Metro needs the compiled `dist/` output.

**Device doesn't appear** — Ensure the device is unlocked, connected via USB, and you tapped "Trust" on the pairing prompt. Run `xcrun xctrace list devices` to verify Xcode sees it.

**Signing errors** — Open Xcode (`xed ios`), go to Signing & Capabilities, and verify your team is selected. For release builds, ensure you have a valid Distribution Certificate.

**JS bundle errors on release** — Use `--eager` flag to surface JS errors at build time rather than at app launch.
