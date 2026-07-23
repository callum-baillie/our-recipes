import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const routeRoot = resolve('src/app/api/v1');
const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);

function filesBelow(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    return statSync(path).isDirectory() ? filesBelow(path) : [path];
  });
}

function routePath(file) {
  const parts = relative(routeRoot, file).split(sep).slice(0, -1);
  return `/${parts
    .map((part) => {
      const match = part.match(/^\[([^\]]+)\]$/u);
      return match ? `{${match[1]}}` : part;
    })
    .join('/')}`;
}

const handlers = new Set();
for (const file of filesBelow(routeRoot).filter((file) => file.endsWith(`${sep}route.ts`))) {
  const source = readFileSync(file, 'utf8');
  for (const method of methods) {
    const upper = method.toUpperCase();
    const declared = new RegExp(`export\\s+(?:async\\s+)?function\\s+${upper}\\b`, 'u').test(
      source,
    );
    const reexported = new RegExp(`export\\s*\\{[^}]*\\b${upper}\\b[^}]*\\}`, 'u').test(source);
    if (declared || reexported) handlers.add(`${method.toUpperCase()} ${routePath(file)}`);
  }
}

const spec = readFileSync(resolve('docs/openapi.yaml'), 'utf8').split(/\r?\n/u);
const documented = new Set();
let currentPath = null;
for (const line of spec) {
  const pathMatch = line.match(/^  (\/[^:]+):\s*$/u);
  if (pathMatch) {
    currentPath = pathMatch[1];
    continue;
  }
  const methodMatch = line.match(/^    (get|post|put|patch|delete):\s*$/u);
  if (currentPath && methodMatch) documented.add(`${methodMatch[1].toUpperCase()} ${currentPath}`);
}

const internal = new Set(
  JSON.parse(readFileSync(resolve('docs/openapi-internal-routes.json'), 'utf8')).map(
    (entry) => `${entry.method} ${entry.path}`,
  ),
);
const uncovered = [...handlers].filter(
  (handler) => !documented.has(handler) && !internal.has(handler),
);
const staleInternal = [...internal].filter((handler) => !handlers.has(handler));
if (uncovered.length || staleInternal.length) {
  if (uncovered.length) console.error(`Undocumented API handlers:\n${uncovered.sort().join('\n')}`);
  if (staleInternal.length)
    console.error(`Stale internal-route declarations:\n${staleInternal.sort().join('\n')}`);
  process.exit(1);
}
console.log(
  `OpenAPI route coverage is complete: ${documented.size} documented operations and ${internal.size} explicitly internal operations.`,
);
