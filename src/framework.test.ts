import { expect, test } from 'vitest'
import { detectFrameworks } from "./framework";

test('detects composer', async () => {
  const detected = await detectFrameworks('./src/testdata/composer');
  expect(detected).toContain('composer');
});

test('detects go.mod', async () => {
  const detected = await detectFrameworks('./src/testdata/go/mod');
  expect(detected).toContain('go');
});

test('detects go.work', async () => {
  const detected = await detectFrameworks('./src/testdata/go/work');
  expect(detected).toContain('go');
});

test('detects pnpm', async () => {
  const detected = await detectFrameworks('./src/testdata/pnpm');
  expect(detected).toContain('pnpm');
});

test('detects yarn', async () => {
  const detected = await detectFrameworks('./src/testdata/yarn');
  expect(detected).toContain('yarn');
});
