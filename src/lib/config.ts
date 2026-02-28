import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';

export interface AnvilConfig {
  target: {
    baseUrl: string;
    auth?: { type: string; token?: string; header?: string };
  };
  llm: {
    provider: 'openai' | 'claude' | 'gemini';
    model: string;
    apiKey: string;
  };
  knowledge: {
    dir: string;
  };
}

export function loadConfig(configPath?: string): AnvilConfig {
  const file = configPath || findConfigFile();
  if (!file) {
    throw new Error('No anvil.config.yaml found. Copy anvil.config.example.yaml and configure it.');
  }
  const raw = fs.readFileSync(file, 'utf-8');
  const config = parseYaml(raw) as AnvilConfig;

  // Resolve knowledge dir relative to config file
  if (config.knowledge?.dir && !path.isAbsolute(config.knowledge.dir)) {
    config.knowledge.dir = path.resolve(path.dirname(file), config.knowledge.dir);
  }

  return config;
}

function findConfigFile(): string | null {
  const candidates = ['anvil.config.yaml', 'anvil.config.yml'];
  for (const name of candidates) {
    const full = path.resolve(process.cwd(), name);
    if (fs.existsSync(full)) return full;
  }
  // Try project root
  const projectRoot = path.resolve(__dirname, '../../..');
  for (const name of candidates) {
    const full = path.join(projectRoot, name);
    if (fs.existsSync(full)) return full;
  }
  return null;
}
