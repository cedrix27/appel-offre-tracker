#!/usr/bin/env node
/**
 * Lance l'API (port 4000) et le web (port 3000) ensemble, sorties préfixées.
 *   node scripts/dev.mjs          → mode développement (watch)
 *   node scripts/dev.mjs --prod   → binaires compilés (lancer `pnpm build` avant)
 * Ctrl+C arrête les deux processus ; si l'un s'arrête, l'autre est arrêté aussi.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const prod = process.argv.includes('--prod');

if (!existsSync(join(root, '.env'))) {
  console.error('Fichier .env absent : lancez `pnpm setup` (ou copiez .env.example en .env).');
  process.exit(1);
}
if (prod && !existsSync(join(root, 'apps/api/dist/main.js'))) {
  console.error('Build absent : lancez `pnpm build` avant `pnpm start`.');
  process.exit(1);
}

const services = [
  { name: 'api', color: 36, args: ['--filter', 'api', prod ? 'start:prod' : 'start:dev'] },
  { name: 'web', color: 35, args: ['--filter', 'web', prod ? 'start' : 'dev'] },
];

const children = [];
let stopping = false;

function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500).unref();
}

for (const s of services) {
  const child = spawn('pnpm', s.args, {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const prefix = `\x1b[${s.color}m[${s.name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) out.write(prefix + line + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`${prefix}arrêté (code ${code ?? 'signal'}) — arrêt des autres services.`);
      stopAll(code ?? 1);
    }
  });
  children.push(child);
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
