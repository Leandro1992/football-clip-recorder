# Architecture

## Goals

- Keep business logic independent from Electron, Windows, Raspberry Pi GPIO, and AWS specifics.
- Capture webcam video continuously in short MP4 segments.
- Preserve only the most recent buffer window.
- Build clips from buffered segments plus configurable post-event duration.
- Upload clips asynchronously without blocking capture.

## Package responsibilities

- `packages/config`: central environment-driven configuration and runtime paths.
- `packages/core`: domain types, structured logging, queueing, and clip orchestration.
- `packages/video`: `VideoBuffer`, `VideoSegment`, and `ClipBuilder`.
- `packages/camera`: camera discovery and USB capture with FFmpeg segmentation (`UsbCameraWindows` via DirectShow, `UsbCameraLinux` via v4l2/ALSA).
- `packages/hardware`: `VirtualButton`, `GpioButton` (libgpiod) and `CompositeTriggerButton`.
- `packages/storage`: `MockStorage` (keeps the 5 most recent clips), `S3Storage`, and provider selection.
- `apps/desktop`: React renderer UI, optionally wrapped in Electron (Windows).
- `apps/server`: headless Node server (HTTP + SSE) that serves the UI and API; used on Raspberry Pi.

## Event flow

1. `UsbCameraWindows` / `UsbCameraLinux` write 1-second MP4 segments with FFmpeg.
2. The same FFmpeg pipeline refreshes a JPEG preview frame for the desktop UI.
3. New completed segments are emitted to `VideoBuffer`.
4. `VideoBuffer` keeps only the configured rolling window and removes old files.
5. `VirtualButton` (UI) or `GpioButton` emits a trigger event.
6. `ClipRecorderApplication` waits for the post-event window, selects the relevant segments, and calls `ClipBuilder`.
7. `ClipBuilder` concatenates the segments into a final MP4.
8. `UploadQueue` sends the clip to the active storage provider.
9. The UI receives status, preview, and clip-history updates through Electron IPC or, in the headless server, REST + Server-Sent Events.

## Non-blocking processing

- Camera capture continues in its own FFmpeg process.
- Buffer management is independent from clip creation and upload.
- Uploads are serialized through `UploadQueue`, so clip generation can finish and return control to the UI quickly.
- Failed uploads keep the local MP4 and return the clip to `pending` status for manual retry.

## Runtime directories

- `runtime/segments/`: rolling capture segments.
- `runtime/clips/`: generated final clips.
- `runtime/preview/`: latest preview JPEG written by the camera pipeline.
- `runtime/temp/`: temporary concat manifests.
- `mock-s3/`: local development upload target.
