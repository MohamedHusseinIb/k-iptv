# K-IPTV

**K-IPTV** is an IPTV player for Android. It wraps an Angular application in
[Capacitor](https://capacitorjs.com/) and adds the native layer Android needs for
real stream playback.

## Install

Download the latest `K-IPTV.apk` from the [Releases](../../releases) page and open it
on your device.

> [!IMPORTANT]
> This APK is **debug-signed**, so Android will warn you that it comes from an
> unknown developer. You will need to allow installs from unknown sources for your
> browser or file manager. A debug-signed build also cannot be upgraded in place by a
> differently signed build later — uninstall the old copy if you hit a signature
> mismatch.

Requires **Android 6.0 (API 23)** or newer. Android TV is supported through a
leanback launcher entry.

## Features

- M3U / M3U8 playlists from a remote URL or a local file
- Xtream Codes and Stalker / Ministra portals
- Movies and series with resume positions
- Global search, favourites, and group-based channel lists
- HLS playback through a native stream proxy, so streams a browser would refuse
  (mixed content, redirects, custom `User-Agent`) still play
- Hand-off to an external player such as VLC or MX Player when a stream needs a
  codec the system cannot decode
- Touch-friendly fullscreen controls
- 21 languages

### Not included

Desktop-only features are out of scope for this Android build: supervised MPV/VLC
sessions, downloading playlist files to disk, local XMLTV file parsing, and the
desktop remote-control server.

## Building from source

You need Node.js (`^22.23.4 || ^24.22.1`), pnpm 10, JDK 21, and the Android SDK
with Platform 35 and Build-Tools 35.0.0. Point `JAVA_HOME` and `ANDROID_HOME` at
them, and set `sdk.dir` in `android/local.properties`.

```bash
pnpm install

pnpm run build:android   # Angular bundle only -> dist/apps/web
pnpm run android:sync    # bundle + copy into the native project
pnpm run android:apk     # bundle + sync + debug APK
```

The APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`. Install it
with `adb install -r <path>`, or copy it to the device and open it with
"install from unknown sources" enabled.

## License

MIT — see [LICENSE.md](./LICENSE.md), which retains the copyright notices of the
original authors of the code this project is derived from, as the licence requires.

## Disclaimer

**K-IPTV does not provide any playlists, channels, or other digital content.** It is
a player only. You are responsible for the sources you add to it.


<img width="1280" height="904" alt="image" src="https://github.com/user-attachments/assets/95c7463b-3b63-46b5-b24d-7b7aa42f8eab" />

<img width="1280" height="904" alt="image" src="https://github.com/user-attachments/assets/b5dde849-06f3-4cad-81ab-9717453dc63b" />

<img width="1280" height="904" alt="image" src="https://github.com/user-attachments/assets/a0df23a5-cb69-4f7a-9518-15815da078b7" />

<img width="581" height="1280" alt="image" src="https://github.com/user-attachments/assets/69b6c312-a5b4-4fd7-a5b8-ddc3f4bf2b71" />


