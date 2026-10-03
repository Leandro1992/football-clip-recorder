# Windows development

## Prerequisites

- Node.js 20+
- FFmpeg available on `PATH`

## Install dependencies

```powershell
npm install
```

## Discover webcam devices with FFmpeg

The project includes:

```powershell
npm run camera:list
```

If `ffmpeg` is installed but not yet available in the current terminal session, you can set [`.env`](/C:/Projetos/proto-olha-o-gol/football-clip-recorder/.env):

```powershell
FFMPEG_PATH=C:\path\to\ffmpeg.exe
```

This script internally uses the same DirectShow discovery approach as:

```powershell
ffmpeg -hide_banner -list_devices true -f dshow -i dummy
```

Use the returned device name in `CAMERA_DEVICE` when you need to force a specific webcam.
The same FFmpeg output also lists `(audio)` devices; use that exact name in `AUDIO_DEVICE`.

## Enable audio capture (optional)

Audio is disabled by default. To include audio in generated clips:

```powershell
ENABLE_AUDIO=true
AUDIO_DEVICE=Microfone (2- USB Audio)
```

If `ENABLE_AUDIO=true` and `AUDIO_DEVICE` is empty, the first DirectShow audio device will be used.
Use `AUDIO_GAIN_DB` to boost a quiet microphone and `AUDIO_DENOISE=true` to reduce noise.

## Run the desktop app

```powershell
npm run dev
```n
Or run without Electron (browser at `http://localhost:3000`):

```powershell
npm run build
npm start
```

## Build, lint, and test

```powershell
npm run build
npm run lint
npm run test
```

## Notes

- The renderer preview uses `navigator.mediaDevices.getUserMedia`.
- The rolling recording pipeline uses FFmpeg segment files for clip capture.
- By default uploads go to `mock-s3/`; AWS is not contacted while `STORAGE_PROVIDER=mock`. Only the 5 most recent clips are kept in mock mode.
