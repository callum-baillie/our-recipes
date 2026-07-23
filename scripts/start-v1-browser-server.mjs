import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const standaloneRoot = resolve('.next/standalone');
const standaloneServer = resolve(standaloneRoot, 'server.js');

if (!existsSync(standaloneServer)) {
  throw new Error('Standalone release server is missing. Run pnpm build:release first.');
}

cpSync(resolve('.next/static'), resolve(standaloneRoot, '.next/static'), {
  recursive: true,
  force: true,
});
cpSync(resolve('public'), resolve(standaloneRoot, 'public'), {
  recursive: true,
  force: true,
});

process.env.HOSTNAME = '127.0.0.1';
process.env.PORT = '3100';

await import(pathToFileURL(standaloneServer).href);
