import {beforeEach, describe, expect, test, vi} from 'vitest';
import * as action from './action';

beforeEach(() => {
  vi.clearAllMocks();
});

const exportVariable = vi.hoisted(() => vi.fn());
const getMultilineInput = vi.hoisted(() => vi.fn());
const spacectlExec = vi.hoisted(() => vi.fn());

beforeEach(() => {
  vi.mock('@actions/core', () => ({
    exportVariable,
    getMultilineInput
  }));
  vi.mock('@namespacelabs/actions-toolkit/spacectl', () => ({
    exec: spacectlExec,
    SpacectlExecError: class SpacectlExecError extends Error {
      exitCode: number;
      stdout: string;
      stderr: string;
      command: string;
      constructor(
        message: string,
        exitCode: number,
        stdout: string,
        stderr: string,
        command: string
      ) {
        super(message);
        this.name = 'SpacectlExecError';
        this.exitCode = exitCode;
        this.stdout = stdout;
        this.stderr = stderr;
        this.command = command;
      }
    }
  }));
});

describe('getManualModesInput', async () => {
  test('no input', () => {
    getMultilineInput.mockImplementation((name: string): string[] => {
      return [];
    });

    expect(action.getManualModesInput()).toEqual([]);
  });

  test('cache input', () => {
    getMultilineInput.mockImplementation((name: string): string[] => {
      return name === action.Input_Cache ? ['cache-input'] : [];
    });

    expect(action.getManualModesInput()).toEqual(['cache-input']);
  });

  test('sorts cache modes', () => {
    getMultilineInput.mockImplementation((name: string): string[] => {
      return name === action.Input_Cache ? ['rust', 'go', 'yarn'] : [];
    });

    expect(action.getManualModesInput()).toEqual(['go', 'rust', 'yarn']);
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
      return name === action.Input_Detect_Mode ? ['node', 'go'] : [];
    });

    expect(action.getMountCommand()).toEqual([
      'cache',
      'mount',
      '--detect=go,node'
    ]);
  });

  test('detect all', () => {
    getMultilineInput.mockImplementation((name: string): string[] => {
      return name === action.Input_Detect_Mode ? ['true'] : [];
    });

    expect(action.getMountCommand()).toEqual(['cache', 'mount', '--detect=*']);
  });

  test('cache input', () => {
    getMultilineInput.mockImplementation((name: string): string[] => {
      return name === action.Input_Cache ? ['go', 'node'] : [];
    });

    expect(action.getMountCommand()).toEqual([
      'cache',
      'mount',
      '--mode=go,node'
    ]);
  });

  test('path input', () => {
    getMultilineInput.mockImplementation((name: string): string[] => {
      return name === action.Input_Path ? ['/tmp/cache', '/var/data'] : [];
    });

    expect(action.getMountCommand()).toEqual([
      'cache',
      'mount',
      '--path=/tmp/cache,/var/data'
    ]);
  });

  test('combined inputs', () => {
    getMultilineInput.mockImplementation((name: string): string[] => {
      switch (name) {
        case action.Input_Detect_Mode:
          return ['go'];
        case action.Input_Cache:
          return ['node'];
        case action.Input_Path:
          return ['/tmp/cache'];
        default:
          return [];
      }
    });

    expect(action.getMountCommand()).toEqual([
      'cache',
      'mount',
      '--detect=go',
      '--mode=node',
      '--path=/tmp/cache'
    ]);
  });
});

describe('mount', async () => {
  beforeEach(() => {
    getMultilineInput.mockReturnValue([]);
  });

  function mockExecWithPayload(payload: object) {
    spacectlExec.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(payload),
      stderr: ''
    });
  }

  test('parses minimal response', async () => {
    const payload = {
      input: {modes: ['go']},
      output: {
        destructive_mode: false,
        disk_usage: {total: '10G', used: '1G'},
        mounts: [
          {
            mode: 'go',
            cache_path: '/cache/go',
            mount_path: '/home/runner/go',
            cache_hit: true
          },
          {
            cache_path: '/cache/some/path',
            mount_path: '/some/path',
            cache_hit: false
          }
        ],
        removed_paths: []
      }
    };

    mockExecWithPayload(payload);

    const result = await action.mount();
    expect(result).toEqual(payload);
  });

  test('parses response with add_envs', async () => {
    const payload = {
      input: {modes: ['node']},
      output: {
        destructive_mode: false,
        disk_usage: {total: '20G', used: '5G'},
        mounts: [],
        removed_paths: [],
        add_envs: {NODE_PATH: '/cache/node_modules'}
      }
    };

    mockExecWithPayload(payload);

    const result = await action.mount();
    expect(result.output.add_envs).toEqual({NODE_PATH: '/cache/node_modules'});
  });

  test('parses response with removed_paths', async () => {
    const payload = {
      input: {modes: ['apt']},
      output: {
        destructive_mode: true,
        disk_usage: {total: '20G', used: '88K'},
        mounts: [
          {
            mode: 'apt',
            cache_path: '/cache/var/cache/apt/archives',
            mount_path: '/var/cache/apt/archives/',
            cache_hit: false
          }
        ],
        removed_paths: ['/etc/apt/apt.conf.d/docker-clean']
      }
    };

    mockExecWithPayload(payload);

    const result = await action.mount();
    expect(result.output.removed_paths).toEqual([
      '/etc/apt/apt.conf.d/docker-clean'
    ]);
  });

  test('parses response with input paths', async () => {
    const payload = {
      input: {modes: [], paths: ['/tmp/cache']},
      output: {
        destructive_mode: false,
        disk_usage: {total: '10G', used: '0'},
        mounts: [],
        removed_paths: []
      }
    };

    mockExecWithPayload(payload);

    const result = await action.mount();
    expect(result.input.paths).toEqual(['/tmp/cache']);
  });

  test('parses response with undefined mounts', async () => {
    const payload = {
      input: {modes: ['pnpm']},
      output: {
        destructive_mode: false,
        disk_usage: {total: '10G', used: '0'},
        removed_paths: []
      }
    };

    mockExecWithPayload(payload);

    const result = await action.mount();
    expect(result.output.mounts).toBeUndefined();
  });

  test('parses response with multiple mounts', async () => {
    const payload = {
      input: {modes: ['apt', 'go']},
      output: {
        destructive_mode: true,
        disk_usage: {total: '20G', used: '88K'},
        mounts: [
          {
            mode: 'apt',
            cache_path: '/cache/apt',
            mount_path: '/var/cache/apt/archives/',
            cache_hit: false
          },
          {
            mode: 'go',
            cache_path: '/cache/go-build',
            mount_path: '/home/runner/.cache/go-build',
            cache_hit: false
          },
          {
            mode: 'go',
            cache_path: '/cache/go-mod',
            mount_path: '/home/runner/go/pkg/mod',
            cache_hit: true
          }
        ],
        removed_paths: ['/etc/apt/apt.conf.d/docker-clean']
      }
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
    action.exportAddEnvs({NODE_PATH: '/cache/node_modules'});
    expect(exportVariable).toHaveBeenCalledTimes(1);
    expect(exportVariable).toHaveBeenCalledWith(
      'NODE_PATH',
      '/cache/node_modules'
    );
  });

  test('exports multiple env vars', () => {
    action.exportAddEnvs({
      NODE_PATH: '/cache/node_modules',
      GOPATH: '/cache/go'
    });
    expect(exportVariable).toHaveBeenCalledTimes(2);
    expect(exportVariable).toHaveBeenCalledWith(
      'NODE_PATH',
      '/cache/node_modules'
    );
    expect(exportVariable).toHaveBeenCalledWith('GOPATH', '/cache/go');
  });
});
