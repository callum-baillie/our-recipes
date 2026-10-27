import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), lookup: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({
  authorizeCoreApi: mocks.authorize,
  withApiRequestId: (response: Response) => response,
}));
vi.mock('@/lib/services/food-data-service', () => ({ lookupFoodByBarcode: mocks.lookup }));
import { POST } from '@/app/api/v1/food-data/barcode-lookups/route';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({ response: null, requestId: 'fixture' });
});
function request() {
  return new Request('http://localhost/api/v1/food-data/barcode-lookups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ barcode: '041498926526' }),
  });
}
it('distinguishes unavailable sources from a successful lookup with no match', async () => {
  for (const status of [
    'temporarily_unavailable',
    'not_configured',
    'disabled',
    'invalid_response',
  ]) {
    mocks.lookup.mockResolvedValue({
      preferred: null,
      localProduct: null,
      providerStatuses: [{ provider: 'usda_fdc', status }],
    });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('UNAVAILABLE');
  }
  mocks.lookup.mockResolvedValue({
    preferred: null,
    localProduct: null,
    providerStatuses: [{ provider: 'usda_fdc', status: 'available' }],
  });
  const response = await POST(request());
  expect(response.status).toBe(404);
  expect((await response.json()).error.code).toBe('NOT_FOUND');
});
it('keeps saved local products usable during a provider outage', async () => {
  mocks.lookup.mockResolvedValue({
    preferred: null,
    localProduct: { id: 'local' },
    providerStatuses: [{ provider: 'usda_fdc', status: 'temporarily_unavailable' }],
  });
  expect((await POST(request())).status).toBe(200);
});
it('requires authentication before a provider request', async () => {
  mocks.authorize.mockResolvedValue({ response: new Response(null, { status: 401 }) });
  expect((await POST(request())).status).toBe(401);
  expect(mocks.lookup).not.toHaveBeenCalled();
});
