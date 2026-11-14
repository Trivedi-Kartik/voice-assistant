# Karvix — voice assistant for your computer

Talk to it, it talks back, and it can open apps, search the web, set reminders and more on your PC.

## Install (2 minutes)

### Windows
1. Download **[Karvix-Setup-0.1.0.exe](https://github.com/Trivedi-Kartik/voice-assistant/releases/download/nightly/Karvix-Setup-0.1.0.exe)**.
2. Double-click the downloaded file.
3. If a blue **"Windows protected your PC"** box appears, click **More info**, then **Run anyway**. (This happens because the app isn't code-signed yet — it is safe to continue if you downloaded it from this page.)
4. Click through the installer. Karvix opens when it finishes.

### Linux
1. Download **[Karvix-0.1.0.AppImage](https://github.com/Trivedi-Kartik/voice-assistant/releases/download/nightly/Karvix-0.1.0.AppImage)**.
2. Open a terminal in the folder where it was saved and run:
   ```bash
   chmod +x Karvix-0.1.0.AppImage
   ./Karvix-0.1.0.AppImage
   ```
3. If it doesn't open, run it with `--no-sandbox`:
   ```bash
   ./Karvix-0.1.0.AppImage --no-sandbox
   ```

### First use
Accept the consent screen, **Sign up** with an email and password (8+ characters), allow the microphone,
then click the mic button — or press **Ctrl+Shift+Space** — and speak. Press it again to stop.

> All downloads are on the [Releases page](https://github.com/Trivedi-Kartik/voice-assistant/releases/tag/nightly);
> it is refreshed automatically on every update. There is no phone app — the assistant's abilities
> (opening apps, screenshots, clipboard, computer control) need a desktop.

## For developers

See [`docs/README.md`](docs/README.md) (overview), [`docs/SETUP.md`](docs/SETUP.md) (run it locally) and
[`CLAUDE.md`](CLAUDE.md) (architecture and commands).

## License

[MIT](LICENSE) © 2026 Kartik Trivedi
