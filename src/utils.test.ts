import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import * as path from 'node:path';
import * as utils from './utils';

vi.mock('@actions/core', () => ({
  debug: vi.fn()
}));

const ORIGINAL_ENV = {...process.env};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  process.env = {...ORIGINAL_ENV};
});

describe('usesLinkMount', () => {
  test('true on macOS (symlink mount)', () => {
    process.env.RUNNER_OS = 'macOS';
    expect(utils.usesLinkMount()).toBe(true);
  });

  test('true on Windows (junction mount)', () => {
    process.env.RUNNER_OS = 'Windows';
    expect(utils.usesLinkMount()).toBe(true);
  });

  test('false on Linux (bind mount)', () => {
    process.env.RUNNER_OS = 'Linux';
    expect(utils.usesLinkMount()).toBe(false);
  });

  test('false when RUNNER_OS is unset', () => {
    delete process.env.RUNNER_OS;
    expect(utils.usesLinkMount()).toBe(false);
  });
});

describe('resolveHome', () => {
  test('expands a leading ~/ using HOME', () => {
    process.env.HOME = '/home/runner';
    delete process.env.USERPROFILE;
    expect(utils.resolveHome('~/.cache/go-build')).toBe(
      path.join('/home/runner', '.cache/go-build')
    );
  });

  test('falls back to USERPROFILE when HOME is unset', () => {
    delete process.env.HOME;
    process.env.USERPROFILE = 'C:\\Users\\runneradmin';
    expect(utils.resolveHome('~\\AppData\\Local')).toBe(
      path.join('C:\\Users\\runneradmin', 'AppData\\Local')
    );
  });

  test('leaves absolute paths untouched', () => {
    process.env.HOME = '/home/runner';
    expect(utils.resolveHome('/var/cache/apt')).toBe('/var/cache/apt');
    expect(utils.resolveHome('C:\\Users\\runner\\AppData\\Local')).toBe(
      'C:\\Users\\runner\\AppData\\Local'
    );
  });

  test('does not expand a bare ~', () => {
    process.env.HOME = '/home/runner';
    expect(utils.resolveHome('~')).toBe('~');
  });

  test('does not expand ~ in the middle of a path', () => {
    process.env.HOME = '/home/runner';
    expect(utils.resolveHome('/opt/~/cache')).toBe('/opt/~/cache');
  });
});
