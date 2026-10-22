import { readFileSync } from 'node:fs';
import { manageKitchenPhase } from '../../src/lib/services/kitchen-inventory-service';
import type { RequestPrincipal } from '../../src/lib/services/auth-service';
process.stdout.write('ready\n');
const { principal, command } = JSON.parse(readFileSync(0, 'utf8')) as {
  principal: RequestPrincipal;
  command: unknown;
};
try {
  manageKitchenPhase(principal, command);
  process.stdout.write(JSON.stringify({ accepted: true }) + '\n');
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      accepted: false,
      message: error instanceof Error ? error.message : 'Unexpected error',
    }) + '\n',
  );
}
