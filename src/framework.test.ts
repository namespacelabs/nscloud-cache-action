import { expect, test } from 'vitest'
import { detectFrameworks } from "./framework";

test('detects go - mod', async () => {
  const detected = await detectFrameworks('./src/testdata/go/mod');
  expect(detected).toContain('go');
});

test('detects go - work', async () => {
  const detected = await detectFrameworks('./src/testdata/go/work');
  expect(detected).toContain('go');
});

test('detects node', async () => {
  const detected = await detectFrameworks('./src/testdata/node');
  expect(detected).toContain('pnpm');
});

test('detects node', async () => {
  const detected = await detectFrameworks('./src/testdata/node');
  expect(detected).toContain('yarn');
});

test('detects php', async () => {
  const detected = await detectFrameworks('./src/testdata/php');
  expect(detected).toContain('composer');
});

test('detects python', async () => {
  const detected = await detectFrameworks('./src/testdata/python');
  expect(detected).toContain('poetry');
  expect(detected).toContain('uv');
});
