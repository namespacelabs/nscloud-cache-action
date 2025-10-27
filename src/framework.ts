import * as fs from "node:fs";
import * as path from "node:path";

export async function detectFrameworks(rootPath = './'): Promise<string[]> {
  const detectors: Array<(rootPath: string) => Promise<string[]>> = [
    detectGo,
    detectNode,
  ];

  const detected: string[] = [];
  for (const detector of detectors) {
    const result = await detector(rootPath);
    detected.push(...result);
  }

  return detected;
}

async function detectGo(rootPath: string): Promise<string[]> {
  if (fs.existsSync(path.join(rootPath, 'go.mod'))) {
    return ['go'];
  }

  if (fs.existsSync(path.join(rootPath, 'go.work'))) {
    return ['go'];
  }

  return [];
}

async function detectNode(rootPath: string): Promise<string[]> {
  if (!fs.existsSync(path.join(rootPath, 'package.json'))) {
    return [];
  }

  let detected: string[] = [];

  if (fs.existsSync(path.join(rootPath, 'pnpm-lock.yaml'))) {
    detected.push('pnpm');
  }

  if (fs.existsSync(path.join(rootPath, 'yarn.lock'))) {
    detected.push('yarn');
  }

  return detected;
}
