import {
  AppUpdate,
  describeVersionGap,
  parseAheadBehind,
  redactGitError,
  VERSION_UPDATE_UNAVAILABLE,
  type CommandResult,
  type CommandRunner,
} from './app-update';

function ok(stdout = ''): CommandResult {
  return { code: 0, stdout, stderr: '' };
}

function linuxStatusRunner(options: {
  ahead?: string;
  behind?: string;
  active?: string;
  fetchCode?: number;
  fetchStderr?: string;
}): CommandRunner {
  return async (args) => {
    const command = args[0];
    if (command === 'fetch') {
      return { code: options.fetchCode ?? 0, stdout: '', stderr: options.fetchStderr ?? '' };
    }
    if (command === 'rev-parse' && args.includes('HEAD')) {
      return ok('09c4fb9');
    }
    if (command === 'rev-parse') {
      return ok('002dd94');
    }
    if (command === 'log' && args.includes('HEAD')) {
      return ok('Versão deste aparelho');
    }
    if (command === 'log') {
      return ok('Versão da main');
    }
    if (command === 'rev-list') {
      return ok(`${options.ahead ?? '0'}\t${options.behind ?? '1'}`);
    }
    if (command === 'systemctl') {
      return ok(options.active ?? 'inactive');
    }
    return ok('');
  };
}

describe('parseAheadBehind', () => {
  it('reads the ahead and behind counts', () => {
    expect(parseAheadBehind('0\t2\n')).toEqual({ ahead: 0, behind: 2 });
  });

  it('rejects a malformed count', () => {
    expect(parseAheadBehind('nenhum')).toBeUndefined();
  });
});

describe('describeVersionGap', () => {
  it('offers the button only when main is strictly ahead', () => {
    expect(describeVersionGap(0, 2).updateAvailable).toBe(true);
    expect(describeVersionGap(0, 0).updateAvailable).toBe(false);
    expect(describeVersionGap(1, 0).updateAvailable).toBe(false);
    expect(describeVersionGap(1, 1).updateAvailable).toBe(false);
  });
});

describe('redactGitError', () => {
  it('removes credentials embedded in the remote address', () => {
    const raw = 'fatal: https://usuario:segredo-do-git@github.com/org/repo.git not found';
    const cleaned = redactGitError(raw);
    expect(cleaned).not.toContain('segredo-do-git');
    expect(cleaned).not.toContain('usuario');
    expect(cleaned).toContain('https://github.com/org/repo.git');
  });
});

describe('AppUpdate', () => {
  it('does not call git outside linux', async () => {
    let calls = 0;
    const runner: CommandRunner = async () => {
      calls += 1;
      return ok();
    };
    const update = new AppUpdate(runner, 'win32');
    expect(await update.status()).toMatchObject({ available: false, message: VERSION_UPDATE_UNAVAILABLE });
    expect(await update.start()).toEqual({ ok: false, message: VERSION_UPDATE_UNAVAILABLE });
    expect(calls).toBe(0);
  });

  it('enables the update when main has new commits', async () => {
    const update = new AppUpdate(linuxStatusRunner({ behind: '2' }), 'linux');
    const status = await update.status();
    expect(status.updateAvailable).toBe(true);
    expect(status.current).toEqual({ hash: '09c4fb9', subject: 'Versão deste aparelho' });
    expect(status.remote?.hash).toBe('002dd94');
    expect(status.message).toMatch(/2 commits novos/);
  });

  it('keeps the button off when the device already matches main', async () => {
    const update = new AppUpdate(linuxStatusRunner({ behind: '0' }), 'linux');
    const status = await update.status();
    expect(status.updateAvailable).toBe(false);
    expect(status.message).toMatch(/já está na main/);
  });

  it('reports an update already running', async () => {
    const update = new AppUpdate(linuxStatusRunner({ behind: '1', active: 'activating' }), 'linux');
    const status = await update.status();
    expect(status.updating).toBe(true);
    expect(status.updateAvailable).toBe(false);
  });

  it('starts the helper only for a fast-forward and hides a leaked token', async () => {
    const calls: string[] = [];
    const update = new AppUpdate(async (args) => {
      calls.push(args[0]);
      if (args[0] === 'systemctl') {
        return ok('inactive');
      }
      if (args[0] === 'rev-list') {
        return ok('0\t1');
      }
      return { code: 1, stdout: '', stderr: 'https://usuario:segredo-do-git@github.com/org/repo.git' };
    }, 'linux');
    const result = await update.start();
    expect(calls).toEqual(['systemctl', 'rev-list', 'update-helper']);
    expect(result.ok).toBe(false);
    expect(result.message).not.toContain('segredo-do-git');
  });

  it('does not start the helper when main is not ahead', async () => {
    const calls: string[] = [];
    const update = new AppUpdate(async (args) => {
      calls.push(args[0]);
      if (args[0] === 'systemctl') {
        return ok('inactive');
      }
      return ok('1\t0');
    }, 'linux');
    const result = await update.start();
    expect(result.ok).toBe(false);
    expect(calls).not.toContain('update-helper');
  });
});
