import { buildCameraOutputArguments, buildDirectShowInputArguments } from './usb-camera-windows';

describe('buildDirectShowInputArguments', () => {
  it('uses vcodec for mjpeg capture on DirectShow', () => {
    expect(
      buildDirectShowInputArguments({
        fps: 30,
        width: 1920,
        height: 1080,
        format: 'mjpeg',
        deviceName: 'USB Camera',
      }),
    ).toEqual([
      '-f',
      'dshow',
      '-rtbufsize',
      '256M',
      '-framerate',
      '30',
      '-video_size',
      '1920x1080',
      '-vcodec',
      'mjpeg',
      '-i',
      'video=USB Camera',
    ]);
  });

  it('captures video and audio when an audio device is configured', () => {
    expect(
      buildDirectShowInputArguments({
        fps: 30,
        width: 1920,
        height: 1080,
        format: 'mjpeg',
        deviceName: 'USB Camera',
        audioDeviceName: 'Microfone (USB Audio)',
      }),
    ).toEqual([
      '-f',
      'dshow',
      '-rtbufsize',
      '256M',
      '-framerate',
      '30',
      '-video_size',
      '1920x1080',
      '-vcodec',
      'mjpeg',
      '-i',
      'video=USB Camera:audio=Microfone (USB Audio)',
    ]);
  });

  it('uses pixel_format for raw capture formats', () => {
    expect(
      buildDirectShowInputArguments({
        fps: 30,
        width: 640,
        height: 480,
        format: 'yuyv422',
        deviceName: 'USB Camera',
      }),
    ).toEqual([
      '-f',
      'dshow',
      '-rtbufsize',
      '256M',
      '-framerate',
      '30',
      '-video_size',
      '640x480',
      '-pixel_format',
      'yuyv422',
      '-i',
      'video=USB Camera',
    ]);
  });

  it('adds segment and preview outputs to the ffmpeg command', () => {
    expect(
      buildCameraOutputArguments({
        segmentDurationSeconds: 1,
        segmentPattern: 'C:\\runtime\\segments\\segment_%06d.mp4',
        previewImagePath: 'C:\\runtime\\preview\\current.jpg',
        includeAudio: false,
      }),
    ).toEqual([
      '-map',
      '0:v',
      '-an',
      '-r',
      '15',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-tune',
      'zerolatency',
      '-pix_fmt',
      'yuv420p',
      '-f',
      'segment',
      '-segment_time',
      '1',
      '-reset_timestamps',
      '1',
      'C:\\runtime\\segments\\segment_%06d.mp4',
      '-map',
      '0:v',
      '-vf',
      'fps=1/2,scale=480:-1:flags=fast_bilinear',
      '-q:v',
      '5',
      '-update',
      '1',
      '-f',
      'image2',
      'C:\\runtime\\preview\\current.jpg',
    ]);
  });

  it('maps and encodes audio when enabled', () => {
    expect(
      buildCameraOutputArguments({
        segmentDurationSeconds: 1,
        segmentPattern: 'C:\\runtime\\segments\\segment_%06d.mp4',
        previewImagePath: 'C:\\runtime\\preview\\current.jpg',
        includeAudio: true,
      }),
    ).toEqual([
      '-map',
      '0:v',
      '-map',
      '0:a:0',
      '-af',
      'aresample=async=1:first_pts=0',
      '-ar',
      '48000',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-r',
      '15',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-tune',
      'zerolatency',
      '-pix_fmt',
      'yuv420p',
      '-f',
      'segment',
      '-segment_time',
      '1',
      '-reset_timestamps',
      '1',
      'C:\\runtime\\segments\\segment_%06d.mp4',
      '-map',
      '0:v',
      '-vf',
      'fps=1/2,scale=480:-1:flags=fast_bilinear',
      '-q:v',
      '5',
      '-update',
      '1',
      '-f',
      'image2',
      'C:\\runtime\\preview\\current.jpg',
    ]);
  });

  it('uses the Raspberry Pi hardware encoder without the software preset', () => {
    const args = buildCameraOutputArguments({
      segmentDurationSeconds: 1,
      segmentPattern: '/tmp/segment_%06d.mp4',
      previewImagePath: '/tmp/preview.jpg',
      includeAudio: false,
      outputFps: 15,
      encoder: 'h264_v4l2m2m',
      bitrateKbps: 4000,
    });

    expect(args).toContain('h264_v4l2m2m');
    expect(args).toContain('4000k');
    expect(args).toContain('-g');
    expect(args).toContain('-an');
    expect(args).not.toContain('ultrafast');
    expect(args).not.toContain('aac');
  });
});
