import { expect, test } from 'vitest'
import { detectFrameworks } from "./framework";

test('detects frameworks correctly', async () => {
  const detected = await detectFrameworks();
  expect(detected).toContain('node');
});
