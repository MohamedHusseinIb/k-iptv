# K-IPTV

**K-IPTV** is an Android IPTV player built on top of
[IPTVnator](https://github.com/4gray/iptvnator) by [@4gray](https://github.com/4gray).
It wraps the upstream Angular application in [Capacitor](https://capacitorjs.com/)
and adds the native layer Android needs for real stream playback.

> K-IPTV is an independent, rebranded fork. It is **not** affiliated with, endorsed
> by, or supported by the IPTVnator project. Please do not report K-IPTV problems on
> the upstream issue tracker.

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

Desktop-only upstream features are out of scope, exactly as they are for upstream's
PWA build: supervised MPV/VLC sessions, downloading playlist files to disk, local
XMLTV file parsing, and the desktop remote-control server.

## Building from source

See **[ANDROID.md](./ANDROID.md)** for prerequisites, build commands, and an
explanation of how the native layer works.

## Credits

K-IPTV exists because of the work of **[4gray](https://github.com/4gray)** and the
[IPTVnator contributors](https://github.com/4gray/iptvnator/graphs/contributors).
Upstream is the source of essentially all application functionality; this fork adds
Android packaging and the native playback layer.

If you find this useful, please consider supporting upstream directly:
[Ko-fi](https://ko-fi.com/4gray) · [GitHub Sponsors](https://github.com/sponsors/4gray).

Full upstream documentation, including the desktop feature set, lives at the
[IPTVnator repository](https://github.com/4gray/iptvnator) and its
[website](https://4gray.github.io/iptvnator/).

## License

MIT — see [LICENSE.md](./LICENSE.md). Copyright © 2019-2026 4gray and contributors.
The upstream copyright notice is retained in full.

## Trademark

"IPTVnator" and the IPTVnator logo are unregistered trademarks of the upstream
project owner and are **not** used by this fork — see [TRADEMARK.md](./TRADEMARK.md).
K-IPTV ships its own name and icon. References to IPTVnator in this repository are
descriptive, identifying the upstream project this software is derived from.

## Disclaimer

**K-IPTV does not provide any playlists, channels, or other digital content.** It is
a player only. You are responsible for the sources you add to it.
