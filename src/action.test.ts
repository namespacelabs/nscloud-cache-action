import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as action from "./action";

beforeEach(() => {
  vi.clearAllMocks();
});

const exportVariable = vi.hoisted(() => vi.fn());
const execFn = vi.hoisted(() => vi.fn());
const getBooleanInput = vi.hoisted(() => vi.fn());
const getMultilineInput = vi.hoisted(() => vi.fn());

beforeEach(() => {
  vi.mock('@actions/core', () => ({
    error: vi.fn(),
    exportVariable,
    getBooleanInput,
    getMultilineInput,
  }));
  vi.mock('@actions/exec', () => ({
    exec: execFn,
  }));
});

describe('isSpaceEnabled', async () => {
  test('disabled', () => {
    getBooleanInput.mockImplementation((name: string): boolean => {
      return false;
    });

    expect(action.isSpaceEnabled()).toBe(false);
  });

  test('enabled', () => {
    getBooleanInput.mockImplementation((name: string): boolean => {
      return true;
    });

    expect(action.isSpaceEnabled()).toBe(true);
  });
});

describe('getManualModesInput', async () => {
  test('no input', () => {
    getMultilineInput.mockImplementation((name: string): string[] => {
      return [];
    });

    expect(action.getManualModesInput()).toEqual([]);
  });

  test('deprecated cache input', () => {
    getMultilineInput.mockImplementation((name: string): string[] => {
      return (name === action.Input_Cache) ? ['cache-input'] : [];
    });

    expect(action.getManualModesInput()).toEqual(['cache-input']);
  });

  test('mode input', () => {
    getMultilineInput.mockImplementation((name: string): string[] => {
      return (name === action.Input_Mode) ? ['mode-input'] : [];
    });

    expect(action.getManualModesInput()).toEqual(['mode-input']);
  });

  test('both inputs', () => {
    getMultilineInput.mockImplementation((name: string): string[] => {
      switch (name) {
        case action.Input_Cache:
          return ['cache-input'];
        case action.Input_Mode:
          return ['mode-input'];
        default:
          return [];
      }
    });

    expect(action.getManualModesInput()).toEqual(['cache-input', 'mode-input']);
  });
});

describe('getMountCommand', async () => {
  test('no input', () => {
    getMultilineInput.mockImplementation((name: string): string[] => {
      return [];
    });

    expect(action.getMountCommand()).toEqual(['cache', 'mount', '--detect=*']);
  });

  test('detect input', () => {
    getMultilineInput.mockImplementation((name: string): string[] => {
      return (name === action.Input_Detect_Mode) ? ['node', 'go'] : [];
    });

    expect(action.getMountCommand()).toEqual(['cache', 'mount', '--detect=go,node']);
  });

  test('detect all', () => {
    getMultilineInput.mockImplementation((name: string): string[] => {
      return (name === action.Input_Detect_Mode) ? ['true'] : [];
    });

    expect(action.getMountCommand()).toEqual(['cache', 'mount', '--detect=*']);
  });

  test('manual mode input', () => {
    getMultilineInput.mockImplementation((name: string): string[] => {
      return (name === action.Input_Mode) ? ['go', 'node'] : [];
    });

    expect(action.getMountCommand()).toEqual(['cache', 'mount', '--mode=go,node']);
  });

  test('deprecated cache input', () => {
    getMultilineInput.mockImplementation((name: string): string[] => {
      return (name === action.Input_Cache) ? ['rust'] : [];
    });

    expect(action.getMountCommand()).toEqual(['cache', 'mount', '--mode=rust']);
  });

  test('path input', () => {
    getMultilineInput.mockImplementation((name: string): string[] => {
      return (name === action.Input_Path) ? ['/tmp/cache', '/var/data'] : [];
    });

    expect(action.getMountCommand()).toEqual(['cache', 'mount', '--path=/tmp/cache,/var/data']);
  });

  test('combined inputs', () => {
    getMultilineInput.mockImplementation((name: string): string[] => {
      switch (name) {
        case action.Input_Detect_Mode:
          return ['go'];
        case action.Input_Mode:
          return ['node'];
        case action.Input_Path:
          return ['/tmp/cache'];
        default:
          return [];
      }
    });

    expect(action.getMountCommand()).toEqual(['cache', 'mount', '--detect=go', '--mode=node', '--path=/tmp/cache']);
  });
});

describe('mount', async () => {
  beforeEach(() => {
    getMultilineInput.mockReturnValue([]);
  });

  function mockExecWithPayload(payload: object) {
    execFn.mockImplementation(async (_cmd: string, _args: string[], options: { listeners?: { stdout?: (data: Buffer) => void } }) => {
      options?.listeners?.stdout?.(Buffer.from(JSON.stringify(payload)));
      return 0;
    });
  }

  test('parses minimal response', async () => {
    const payload = {
      input: { modes: ['go'] },
      output: {
        destructive_mode: false,
        disk_usage: { total: '10G', used: '1G' },
        mounts: [
          {
            mode: 'go',
            cache_path: '/cache/go',
            mount_path: '/home/runner/go',
            cache_hit: true,
          },
          {
            cache_path: '/cache/some/path',
            mount_path: '/some/path',
            cache_hit: false,
          },
        ],
        removed_paths: [],
      },
    };

    mockExecWithPayload(payload);

    const result = await action.mount();
    expect(result).toEqual(payload);
  });

  test('parses response with add_envs', async () => {
    const payload = {
      input: { modes: ['node'] },
      output: {
        destructive_mode: false,
        disk_usage: { total: '20G', used: '5G' },
        mounts: [],
        removed_paths: [],
        add_envs: { NODE_PATH: '/cache/node_modules' },
      },
    };

    mockExecWithPayload(payload);

    const result = await action.mount();
    expect(result.output.add_envs).toEqual({ NODE_PATH: '/cache/node_modules' });
  });

  test('parses response with removed_paths', async () => {
    const payload = {
      input: { modes: ['apt'] },
      output: {
        destructive_mode: true,
        disk_usage: { total: '20G', used: '88K' },
        mounts: [
          {
            mode: 'apt',
            cache_path: '/cache/var/cache/apt/archives',
            mount_path: '/var/cache/apt/archives/',
            cache_hit: false,
          },
        ],
        removed_paths: ['/etc/apt/apt.conf.d/docker-clean'],
      },
    };

    mockExecWithPayload(payload);

    const result = await action.mount();
    expect(result.output.removed_paths).toEqual(['/etc/apt/apt.conf.d/docker-clean']);
  });

  test('parses response with input paths', async () => {
    const payload = {
      input: { modes: [], paths: ['/tmp/cache'] },
      output: {
        destructive_mode: false,
        disk_usage: { total: '10G', used: '0' },
        mounts: [],
        removed_paths: [],
      },
    };

    mockExecWithPayload(payload);

    const result = await action.mount();
    expect(result.input.paths).toEqual(['/tmp/cache']);
  });

  test('parses response with multiple mounts', async () => {
    const payload = {
      input: { modes: ['apt', 'go'] },
      output: {
        destructive_mode: true,
        disk_usage: { total: '20G', used: '88K' },
        mounts: [
          { mode: 'apt', cache_path: '/cache/apt', mount_path: '/var/cache/apt/archives/', cache_hit: false },
          { mode: 'go', cache_path: '/cache/go-build', mount_path: '/home/runner/.cache/go-build', cache_hit: false },
          { mode: 'go', cache_path: '/cache/go-mod', mount_path: '/home/runner/go/pkg/mod', cache_hit: true },
        ],
        removed_paths: ['/etc/apt/apt.conf.d/docker-clean'],
      },
    };

    mockExecWithPayload(payload);

    const result = await action.mount();
    expect(result.output.mounts).toHaveLength(3);
    expect(result.output.mounts[2].cache_hit).toBe(true);
  });
});

describe('exportAddEnvs', () => {
  test('does nothing when undefined', () => {
    action.exportAddEnvs(undefined);
    expect(exportVariable).not.toHaveBeenCalled();
  });

  test('does nothing when empty', () => {
    action.exportAddEnvs({});
    expect(exportVariable).not.toHaveBeenCalled();
  });

  test('exports single env var', () => {
    action.exportAddEnvs({ NODE_PATH: '/cache/node_modules' });
    expect(exportVariable).toHaveBeenCalledTimes(1);
    expect(exportVariable).toHaveBeenCalledWith('NODE_PATH', '/cache/node_modules');
  });

  test('exports multiple env vars', () => {
    action.exportAddEnvs({
      NODE_PATH: '/cache/node_modules',
      GOPATH: '/cache/go',
    });
    expect(exportVariable).toHaveBeenCalledTimes(2);
    expect(exportVariable).toHaveBeenCalledWith('NODE_PATH', '/cache/node_modules');
    expect(exportVariable).toHaveBeenCalledWith('GOPATH', '/cache/go');
  });
});
