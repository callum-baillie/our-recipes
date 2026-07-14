import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

rmSync(resolve(process.cwd(), '.test-data'), { recursive: true, force: true });
