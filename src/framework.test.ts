import { beforeEach, expect, test, vi } from 'vitest';
import { vol } from 'memfs';
import { detectFrameworks } from "./framework";

vi.mock('node:fs');

beforeEach(() => {
  vol.reset(); // reset the state of in-memory fs
});

test('detects go - mod', async () => {
  vol.fromJSON({
    'mockdata/go.mod': '',
  });

  const detected = await detectFrameworks('mockdata');
  expect(detected).toContain('go');
});

test('detects go - work', async () => {
  vol.fromJSON({
    'mockdata/go.work': '',
  });

  const detected = await detectFrameworks('mockdata');
  expect(detected).toContain('go');
});

test('detects homebrew', async () => {
  vol.fromJSON({
    'mockdata/Brewfile': '',
  });

  const detected = await detectFrameworks('mockdata');
  expect(detected).toContain('brew');
});

test('detects java', async () => {
  vol.fromJSON({
    'mockdata/gradlew': '',
    'mockdata/pom.xml': '',
  });

  const detected = await detectFrameworks('mockdata');
  expect(detected).toContain('gradle');
  expect(detected).toContain('maven');
});

test('detects node', async () => {
  vol.fromJSON({
    'mockdata/pnpm-lock.yaml': '',
    'mockdata/yarn.lock': '',
  });

  const detected = await detectFrameworks('mockdata');
  expect(detected).toContain('pnpm');
  expect(detected).toContain('yarn');
});

test('detects php', async () => {
  vol.fromJSON({
    'mockdata/composer.json': '',
  });

  const detected = await detectFrameworks('mockdata');
  expect(detected).toContain('composer');
});

test('detects python', async () => {
  vol.fromJSON({
    'mockdata/poetry.lock': '',
    'mockdata/uv.lock': '',
  });

  const detected = await detectFrameworks('mockdata');
  expect(detected).toContain('poetry');
  expect(detected).toContain('uv');
});

test('detects ruby', async () => {
  vol.fromJSON({
    'mockdata/Gemfile': '',
  });

  const detected = await detectFrameworks('mockdata');
  expect(detected).toContain('ruby');
});

test('detects rust', async () => {
  vol.fromJSON({
    'mockdata/Cargo.toml': '',
  });

  const detected = await detectFrameworks('mockdata');
  expect(detected).toContain('rust');
});

test('detects xcode', async () => {
  vol.fromJSON({
    'mockdata/Podfile': '',
  });

  const detected = await detectFrameworks('mockdata');
  expect(detected).toContain('cocoapods');
});
