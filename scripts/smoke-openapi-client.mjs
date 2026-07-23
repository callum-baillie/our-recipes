import { readFileSync } from 'node:fs';

const document = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const client = {};
for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const operation = pathItem[method];
    if (!operation) continue;
    if (!operation.operationId)
      throw new Error(`${method.toUpperCase()} ${path} has no operationId.`);
    if (client[operation.operationId])
      throw new Error(`Duplicate operationId ${operation.operationId}.`);
    client[operation.operationId] = (parameters = {}) => ({
      method: method.toUpperCase(),
      path: path.replace(/\{([^}]+)\}/gu, (_match, name) => {
        const value = parameters[name];
        if (value === undefined)
          throw new Error(`Missing generated-client path parameter ${name}.`);
        return encodeURIComponent(String(value));
      }),
    });
  }
}

const healthRequest = client.getHealth?.();
if (healthRequest?.method !== 'GET' || healthRequest.path !== '/health') {
  throw new Error('Generated-client health operation did not produce the expected request.');
}
const parameterized = Object.values(client).find((operation) => {
  try {
    return operation({
      recipeId: 'recipe-smoke',
      listId: 'list-smoke',
      profileId: 'profile-smoke',
    }).path.includes('recipe-smoke');
  } catch {
    return false;
  }
});
if (!parameterized) throw new Error('Generated client did not exercise a parameterized operation.');
console.log(`Generated-client contract smoke passed for ${Object.keys(client).length} operations.`);
