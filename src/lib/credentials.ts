import * as fs from 'fs';
import * as path from 'path';

export interface AnvilCredentials {
  provider: 'anthropic' | 'openai';
  authMode: 'api-key' | 'oauth-token';
  apiKey?: string;
  oauthToken?: string;
}

interface CredentialFile {
  credentials: AnvilCredentials;
}

function isDevMode(): boolean {
  // Running from source if __dirname is inside a src/ or has no node_modules ancestor
  return __dirname.includes(path.sep + 'src' + path.sep) ||
    fs.existsSync(path.resolve(__dirname, '../../tsconfig.json'));
}

function getCredentialDir(): string {
  if (isDevMode()) {
    // Store in workspace/.anvil/
    const workspaceRoot = path.resolve(__dirname, '../..');
    return path.join(workspaceRoot, '.anvil');
  }
  // Published: ~/.anvil/
  return path.join(process.env.HOME || process.env.USERPROFILE || '~', '.anvil');
}

function getCredentialPath(): string {
  return path.join(getCredentialDir(), 'config.json');
}

export function loadCredentials(): AnvilCredentials | null {
  const filePath = getCredentialPath();
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw) as CredentialFile;
    return data.credentials || null;
  } catch {
    return null;
  }
}

export function saveCredentials(credentials: AnvilCredentials): void {
  const dir = getCredentialDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filePath = getCredentialPath();
  const data: CredentialFile = { credentials };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

  // Auto-add .anvil/ to .gitignore if storing locally (dev mode)
  if (isDevMode()) {
    ensureGitignore(path.resolve(dir, '..'));
  }
}

function ensureGitignore(projectRoot: string): void {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const entry = '.anvil/';

  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    if (content.includes(entry)) return;
    fs.appendFileSync(gitignorePath, `\n# Anvil credentials\n${entry}\n`);
  } else {
    fs.writeFileSync(gitignorePath, `# Anvil credentials\n${entry}\n`, 'utf-8');
  }
}

export function getResolvedApiKey(credentials: AnvilCredentials): string {
  if (credentials.authMode === 'oauth-token') return credentials.oauthToken || '';
  return credentials.apiKey || '';
}

export function hasCredentials(): boolean {
  const creds = loadCredentials();
  if (!creds) return false;
  return Boolean(getResolvedApiKey(creds));
}
