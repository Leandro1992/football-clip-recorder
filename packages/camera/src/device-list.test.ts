import { parseDirectShowAudioDevices, parseDirectShowVideoDevices } from './device-list';

describe('parseDirectShowVideoDevices', () => {
  it('extracts DirectShow video devices from current ffmpeg output', () => {
    const output = `
[in#0 @ 0000023e101ad700] "Web Camera" (video)
[in#0 @ 0000023e101ad700]   Alternative name "@device_pnp_\\\\?\\usb#vid_2232..."
[in#0 @ 0000023e101ad700] "USB Camera" (video)
[in#0 @ 0000023e101ad700]   Alternative name "@device_pnp_\\\\?\\usb#vid_4c4a..."
[in#0 @ 0000023e101ad700] "Microfone (2- USB Audio)" (audio)
Error opening input file dummy.
`;

    expect(parseDirectShowVideoDevices(output)).toEqual(['Web Camera', 'USB Camera']);
  });

  describe('parseDirectShowAudioDevices', () => {
    it('extracts DirectShow audio devices from current ffmpeg output', () => {
      const output = `
  [in#0 @ 0000023e101ad700] "Web Camera" (video)
  [in#0 @ 0000023e101ad700] "USB Camera" (video)
  [in#0 @ 0000023e101ad700] "Microfone (2- USB Audio)" (audio)
  [in#0 @ 0000023e101ad700] "Microfone (Realtek Audio)" (audio)
  Error opening input file dummy.
  `;

      expect(parseDirectShowAudioDevices(output)).toEqual([
        'Microfone (2- USB Audio)',
        'Microfone (Realtek Audio)',
      ]);
    });
  });
});
