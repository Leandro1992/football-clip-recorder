import { hostname } from 'node:os';
import {
  accessPointMac,
  accessPointSsid,
  DIRECT_NETWORK_UNAVAILABLE,
  normalizeWifiNetworks,
  omitOwnAccessPoint,
  parseNetworkStatus,
  redactSecret,
  validateVenueWifiInput,
  VenueWifi,
  type WifiCommandResult,
  type WifiCommandRunner,
} from './venue-wifi';

function ok(stdout: string): WifiCommandResult {
  return { code: 0, stdout, stderr: '' };
}

describe('accessPointMac', () => {
  it('marks the address as locally administered and keeps it different from the client', () => {
    expect(accessPointMac('dc:a6:32:01:02:03')).toBe('de:a6:32:01:02:03');
  });

  it('flips the last octet when the address is already local', () => {
    expect(accessPointMac('02:00:00:00:00:01')).toBe('02:00:00:00:00:00');
  });

  it('rejects a malformed address', () => {
    expect(() => accessPointMac('não-é-mac')).toThrow(/Invalid MAC address/);
  });
});

describe('accessPointSsid', () => {
  it('uses the last four hex digits so two units do not share a name', () => {
    expect(accessPointSsid('dc:a6:32:ab:cd:ef')).toBe('Olho no lance CDEF');
    expect(accessPointSsid('DC-A6-32-AB-CD-10', 'Quadra')).toBe('Quadra CD10');
  });
});

describe('validateVenueWifiInput', () => {
  it('accepts an open network and a normal password', () => {
    expect(validateVenueWifiInput('Smart Home', '')).toBeUndefined();
    expect(validateVenueWifiInput('Smart Home', '12345678')).toBeUndefined();
  });

  it('rejects a short password and a blank name', () => {
    expect(validateVenueWifiInput('Smart Home', 'curta')).toMatch(/8 e 63/);
    expect(validateVenueWifiInput('  ', '12345678')).toMatch(/nome da rede/);
    expect(validateVenueWifiInput('Quadra\n', '12345678')).toMatch(/nome da rede/);
  });
});

describe('redactSecret', () => {
  it('removes the venue password from text', () => {
    expect(redactSecret('falha segredo-da-quadra no rádio', 'segredo-da-quadra')).toBe('falha *** no rádio');
  });
});

describe('normalizeWifiNetworks', () => {
  it('drops empty names and keeps the strongest reading of each name', () => {
    expect(
      normalizeWifiNetworks([
        { ssid: '', signal: 90, security: 'WPA2', inUse: false },
        { ssid: 'Quadra', signal: 40, security: 'WPA2', inUse: false },
        { ssid: 'Quadra', signal: 80, security: 'WPA2', inUse: true },
        { ssid: 'Vizinha', signal: 70, security: '--', inUse: false },
      ]),
    ).toEqual([
      { ssid: 'Quadra', signal: 80, security: 'WPA2', inUse: true },
      { ssid: 'Vizinha', signal: 70, security: '--', inUse: false },
    ]);
  });
});

describe('parseNetworkStatus', () => {
  it('reads the access point and the venue link', () => {
    expect(
      parseNetworkStatus(
        JSON.stringify({
          available: true,
          accessPoint: { ssid: 'Olho no lance CDEF', address: '192.168.4.1', active: true, password: 'olhonolance' },
          venue: { connected: true, ssid: 'Smart Home', signal: 91 },
        }),
      ),
    ).toEqual({
      available: true,
      message: undefined,
      accessPoint: { ssid: 'Olho no lance CDEF', address: '192.168.4.1', active: true, password: 'olhonolance' },
      venue: { connected: true, ssid: 'Smart Home', signal: 91 },
    });
  });
});

describe('omitOwnAccessPoint', () => {
  it('hides the device network from the venue list', () => {
    const networks = [
      { ssid: 'Olho no lance CDEF', signal: 100, security: 'WPA2', inUse: false },
      { ssid: 'Smart Home', signal: 90, security: 'WPA2', inUse: true },
    ];
    expect(omitOwnAccessPoint(networks, 'Olho no lance CDEF').map((network) => network.ssid)).toEqual(['Smart Home']);
  });
});

describe('VenueWifi', () => {
  it('does not call the helper outside linux', async () => {
    let calls = 0;
    const runner: WifiCommandRunner = async () => {
      calls += 1;
      return ok('{}');
    };
    const wifi = new VenueWifi(runner, 'win32');
    expect(await wifi.status()).toEqual({ available: false, message: DIRECT_NETWORK_UNAVAILABLE });
    expect(await wifi.scan()).toEqual({ available: false, networks: [], message: DIRECT_NETWORK_UNAVAILABLE });
    expect(await wifi.connect('Quadra', '12345678')).toEqual({ ok: false, message: DIRECT_NETWORK_UNAVAILABLE });
    expect(calls).toBe(0);
  });

  it('removes the venue password from the helper message and from a thrown error', async () => {
    const wifi = new VenueWifi(async (_args, stdin) => {
      expect(stdin).toContain('segredo-da-quadra');
      return ok(JSON.stringify({ ok: false, message: 'falha segredo-da-quadra' }));
    }, 'linux');
    const result = await wifi.connect('Quadra', 'segredo-da-quadra');
    expect(result.ok).toBe(false);
    expect(result.message).not.toContain('segredo-da-quadra');
    expect(result.message).toContain('***');

    const throwing = new VenueWifi(async () => {
      throw new Error('pipe segredo-da-quadra');
    }, 'linux');
    const failed = await throwing.connect('Quadra', 'segredo-da-quadra');
    expect(failed.message).not.toContain('segredo-da-quadra');
  });

  it('does not call the helper when the password is too short', async () => {
    let calls = 0;
    const wifi = new VenueWifi(async () => {
      calls += 1;
      return ok('{}');
    }, 'linux');
    const result = await wifi.connect('Quadra', 'curta');
    expect(result.ok).toBe(false);
    expect(calls).toBe(0);
  });

  it('drops the device network from the scan', async () => {
    const wifi = new VenueWifi(async (args) => {
      if (args[0] === 'scan') {
        return ok(
          JSON.stringify({
            available: true,
            networks: [
              { ssid: 'Olho no lance CDEF', signal: 100, security: 'WPA2', inUse: false },
              { ssid: 'Smart Home', signal: 91, security: 'WPA2', inUse: true },
            ],
          }),
        );
      }
      return ok(
        JSON.stringify({
          available: true,
          accessPoint: { ssid: 'Olho no lance CDEF', address: '192.168.4.1', active: true },
          venue: { connected: true, ssid: 'Smart Home', signal: 91 },
        }),
      );
    }, 'linux');
    const scan = await wifi.scan();
    expect(scan.networks.map((network) => network.ssid)).toEqual(['Smart Home']);
  });

  it('adds the host name when the helper answers', async () => {
    const wifi = new VenueWifi(async () => {
      return ok(JSON.stringify({ available: true, venue: { connected: false } }));
    }, 'linux');
    const status = await wifi.status();
    expect(status.available).toBe(true);
    expect(status.hostname).toBe(hostname());
  });
});
