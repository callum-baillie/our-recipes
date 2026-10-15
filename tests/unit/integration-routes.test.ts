import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { integrationRoutes, integrationPermission } from '@/lib/domain/integration-routes';

describe('integration operation registry', () => {
  it('maps every declared operation to an authenticated route handler', () => {
    for (const route of integrationRoutes) {
      const file = `src/app/api/v1${route.path.replace(/\{([^}]+)\}/gu, '[$1]')}/route.ts`;
      let source = readFileSync(file, 'utf8');
      const alias = source.match(/export \{[^}]+\} from '([^']+)'/u);
      if (alias) source = readFileSync(resolve(dirname(file), `${alias[1]}.ts`), 'utf8');
      expect(source, file).toMatch(/authorizeApi|authorizeCoreApi/u);
      for (const [method, action] of Object.entries(route.methods)) {
        expect(source, `${method} ${file}`).toMatch(
          new RegExp(`export (?:async )?function ${method}\\b`),
        );
        expect(
          integrationPermission(
            `/api/v1${route.path.replace(/\{[^}]+\}/gu, 'example-id')}`,
            method,
          ),
        ).toEqual({ resource: route.resource, action });
      }
    }
  });
  it('keeps account administration and personal health outside the bearer API', () => {
    for (const path of [
      '/admin/api-keys',
      '/profiles',
      '/backups',
      '/nutrition/profiles/example/data',
    ]) {
      expect(integrationPermission(`/api/v1${path}`, 'POST')).toBeNull();
    }
  });
  it('allows cooking allocation previews with read permission', () => {
    expect(integrationPermission('/api/v1/cook-sessions/example/pantry', 'POST')).toEqual({
      resource: 'recipes',
      action: 'read',
    });
  });
});
