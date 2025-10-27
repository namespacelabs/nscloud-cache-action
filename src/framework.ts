// TODO: tests
export async function detectFrameworks(): Promise<string[]> {
  const detectors: Array<() => Promise<string[]>> = [
    detectGo,
    detectNode,
  ];

  const detected: string[] = [];
  for (const detector of detectors) {
    const result = await detector();
    detected.push(...result);
  }

  return detected;
}

async function detectGo(): Promise<string[]> {
  return [];
}

async function detectNode(): Promise<string[]> {
  // TODO:
  // - presence of package.json
  // - get package manager (npm, pnpm, bun, yarn)
  return ["node"];
}
