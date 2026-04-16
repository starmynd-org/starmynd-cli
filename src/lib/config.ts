import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { StarMyndConfig, Credentials } from '../types/cli.js';

const CREDENTIALS_DIR = path.join(process.env.HOME || '~', '.starmynd');
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'credentials.json');
const LOCAL_CONFIG_DIR = '.starmynd';
const LOCAL_CONFIG_FILE = path.join(LOCAL_CONFIG_DIR, 'config.yaml');

// ---------------------------------------------------------------------------
// Credentials (global, stored in ~/.starmynd/credentials.json)
// ---------------------------------------------------------------------------

export function getCredentials(): Credentials | null {
  if (!fs.existsSync(CREDENTIALS_FILE)) return null;
  try {
    const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: Credentials): void {
  fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), 'utf-8');
  fs.chmodSync(CREDENTIALS_FILE, 0o600);
}

export function clearCredentials(): void {
  if (fs.existsSync(CREDENTIALS_FILE)) {
    fs.unlinkSync(CREDENTIALS_FILE);
  }
}

export function getAuthToken(): string | null {
  const creds = getCredentials();
  if (!creds) return null;
  if (creds.api_key) return creds.api_key;
  if (creds.oauth_token) {
    if (creds.token_expires && new Date(creds.token_expires) < new Date()) {
      return null;
    }
    return creds.oauth_token;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Local config (.starmynd/config.yaml in project directory)
// ---------------------------------------------------------------------------

export function getLocalConfig(): StarMyndConfig | null {
  if (!fs.existsSync(LOCAL_CONFIG_FILE)) return null;
  try {
    const raw = fs.readFileSync(LOCAL_CONFIG_FILE, 'utf-8');
    return yaml.load(raw) as StarMyndConfig;
  } catch {
    return null;
  }
}

export function saveLocalConfig(config: StarMyndConfig): void {
  fs.mkdirSync(LOCAL_CONFIG_DIR, { recursive: true });
  fs.writeFileSync(LOCAL_CONFIG_FILE, yaml.dump(config, { lineWidth: 120 }), 'utf-8');
}

export function ensureLocalDir(): void {
  fs.mkdirSync(LOCAL_CONFIG_DIR, { recursive: true });
}

export function getApiEndpoint(): string {
  const local = getLocalConfig();
  if (local?.api_endpoint) return local.api_endpoint;
  return process.env.STARMYND_API_ENDPOINT || 'https://app.starmynd.com';
}

export function getWorkspaceId(): string | null {
  const local = getLocalConfig();
  if (local?.workspace_id) return local.workspace_id;
  const creds = getCredentials();
  return creds?.workspace_id || null;
}
