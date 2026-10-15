import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// Next copies root dotenv files into standalone output independently of tracing
// exclusions. Deployments must supply runtime secrets outside the artifact.
export function sanitizeStandaloneEnvironment(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (/^\.env(?:\.|$)/u.test(entry.name) && (entry.isFile() || entry.isSymbolicLink())) {
      rmSync(join(directory, entry.name));
    }
  }
}
