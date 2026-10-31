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

See **[ANDROID.md](./ANDROID.md)** for prerequisites, build commands, and an
explanation of how the native layer works.

## License

MIT — see [LICENSE.md](./LICENSE.md), which retains the copyright notices of the
original authors of the code this project is derived from, as the licence requires.

## Disclaimer

**K-IPTV does not provide any playlists, channels, or other digital content.** It is
a player only. You are responsible for the sources you add to it.
