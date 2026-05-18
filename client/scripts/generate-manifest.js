import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// Simple .env.local parser
function loadEnv(path) {
  try {
    const content = readFileSync(path, 'utf-8');
    const env = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      env[key] = value;
    }
    return env;
  } catch {
    return {};
  }
}

const env = loadEnv(resolve(process.cwd(), '.env.local'));
const appName = env.NEXT_PUBLIC_APP_NAME || 'CM Media';

const templatePath = resolve(process.cwd(), 'public', 'manifest.template.json');
const outputPath = resolve(process.cwd(), 'public', 'manifest.json');

const template = readFileSync(templatePath, 'utf-8');
const content = template.replace(/CM Media/g, appName);

writeFileSync(outputPath, content, 'utf-8');
console.log(`Generated manifest.json with APP_NAME="${appName}"`);
