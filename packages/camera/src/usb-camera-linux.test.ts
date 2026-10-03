import { parseAlsaCaptureDevices, parseV4l2VideoDevices } from './device-list-linux';
import { buildV4l2InputArguments, UsbCameraLinux } from './usb-camera-linux';
import { buildCameraOutputArguments } from './usb-camera-windows';

describe('parseV4l2VideoDevices', () => {
  it('keeps only USB capture nodes and ignores Raspberry Pi internal codecs', () => {
    const output = `bcm2835-codec-decode (platform:bcm2835-codec):
\t/dev/video10
\t/dev/video11

USB Camera: USB Camera (usb-0000:01:00.0-1.2):
\t/dev/video0
\t/dev/video1
\t/dev/media3
`;

    expect(parseV4l2VideoDevices(output)).toEqual([
      { deviceId: '/dev/video0', name: 'USB Camera: USB Camera' },
    ]);
  });
});

describe('parseAlsaCaptureDevices', () => {
  it('converts arecord -l output into plughw identifiers', () => {
    const output = `**** List of CAPTURE Hardware Devices ****
card 2: Device [USB Audio Device], device 0: USB Audio [USB Audio]
  Subdevices: 1/1
`;

    expect(parseAlsaCaptureDevices(output)).toEqual([
      { deviceId: 'plughw:2,0', name: 'USB Audio Device' },
    ]);
  });
});

describe('buildV4l2InputArguments', () => {
  it('captures mjpeg video from a v4l2 device', () => {
    expect(
      buildV4l2InputArguments({
        fps: 30,
        width: 1280,
        height: 720,
        format: 'mjpeg',
        devicePath: '/dev/video0',
      }),
    ).toEqual([
      '-f', 'v4l2', '-thread_queue_size', '512', '-framerate', '30', '-video_size', '1280x720',
      '-input_format', 'mjpeg', '-i', '/dev/video0',
    ]);
  });

  it('adds ALSA audio as a second input', () => {
    const args = buildV4l2InputArguments({
      fps: 30,
      width: 1280,
      height: 720,
      devicePath: '/dev/video0',
      audioDevice: 'plughw:2,0',
    });

    expect(args.slice(-6)).toEqual(['-f', 'alsa', '-thread_queue_size', '512', '-i', 'plughw:2,0']);
  });
});

describe('buildCameraOutputArguments for Linux', () => {
  it('maps audio from the second input and forces keyframes on segment boundaries', () => {
    const args = buildCameraOutputArguments({
      segmentDurationSeconds: 2,
      segmentPattern: '/tmp/segment_%06d.mp4',
      previewImagePath: '/tmp/preview.jpg',
      includeAudio: true,
      audioInputIndex: 1,
      keyframeIntervalSeconds: 2,
      segmentStartNumber: 7,
    });

    expect(args).toContain('1:a:0');
    expect(args).toContain('expr:gte(t,n_forced*2)');
    expect(args.join(' ')).toContain('-segment_start_number 7 /tmp/segment_%06d.mp4');
  });

  it('exposes the Linux camera class', () => {
    expect(UsbCameraLinux).toBeTypeOf('function');
  });
});
