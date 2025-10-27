import * as fs from "node:fs";
import * as path from "node:path";

export async function detectFrameworks(rootPath = './'): Promise<string[]> {
  const detectors: Array<(rootPath: string) => Promise<string[]>> = [
    detectGo,
    detectNode,
    detectPhp,
    detectPython,
    detectRuby,
    detectRust,
  ];

  const detected: string[] = [];
  for (const detector of detectors) {
    const result = await detector(rootPath);
    detected.push(...result);
  }

  return detected;
}

async function detectGo(rootPath: string): Promise<string[]> {
  let detected: string[] = [];

  if (fs.existsSync(path.join(rootPath, 'go.mod'))) {
    detected.push('go');
  }

  if (fs.existsSync(path.join(rootPath, 'go.work'))) {
    detected.push('go');
  }

  return detected;
}

async function detectNode(rootPath: string): Promise<string[]> {
  let detected: string[] = [];

  if (fs.existsSync(path.join(rootPath, 'pnpm-lock.yaml'))) {
    detected.push('pnpm');
  }

  if (fs.existsSync(path.join(rootPath, 'yarn.lock'))) {
    detected.push('yarn');
  }

  return detected;
}

async function detectPhp(rootPath: string): Promise<string[]> {
  let detected: string[] = [];

  if (fs.existsSync(path.join(rootPath, 'composer.json'))) {
    detected.push('composer');
  }

  return detected;
}

async function detectPython(rootPath: string): Promise<string[]> {
  let detected: string[] = [];

  if (fs.existsSync(path.join(rootPath, 'poetry.lock'))) {
    detected.push('poetry');
  }

  if (fs.existsSync(path.join(rootPath, 'uv.lock'))) {
    detected.push('uv');
  }

  return detected;
}

async function detectRuby(rootPath: string): Promise<string[]> {
  let detected: string[] = [];

  if (fs.existsSync(path.join(rootPath, 'Gemfile'))) {
    detected.push('ruby');
  }

  return detected;
}

async function detectRust(rootPath: string): Promise<string[]> {
  let detected: string[] = [];

  if (fs.existsSync(path.join(rootPath, 'Cargo.toml'))) {
    detected.push('rust');
  }

  return detected;
}
