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

test('detects homebrew', async () => {
  const detected = await detectFrameworks('./src/testdata/homebrew');
  expect(detected).toContain('brew');
});

test('detects java', async () => {
  const detected = await detectFrameworks('./src/testdata/java');
  expect(detected).toContain('gradle');
});

test('detects node', async () => {
  const detected = await detectFrameworks('./src/testdata/node');
  expect(detected).toContain('pnpm');
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

test('detects ruby', async () => {
  const detected = await detectFrameworks('./src/testdata/ruby');
  expect(detected).toContain('ruby');
});

test('detects rust', async () => {
  const detected = await detectFrameworks('./src/testdata/rust');
  expect(detected).toContain('rust');
});
