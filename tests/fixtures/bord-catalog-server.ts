/** Synthetic loopback fixture. Never contacts source providers or accepts credentials outside loopback. */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export const syntheticUsda = {
  fdcId: 123,
  description: 'Synthetic fixture oats',
  dataType: 'Foundation',
  foodNutrients: [{ nutrient: { id: 1003, name: 'Protein', unitName: 'g' }, amount: 12 }],
};
export async function startCatalogFixture() {
  const state = {
    generation: 'g_fixture_1',
    revision: 'revision_1',
    storeRevision: 'store_1',
    unavailable: false,
    initializing: false,
    rightsBlocked: false,
    disabled: false,
    partial: false,
    stale: false,
    mapRights: true,
    protein: 12,
    missingFood: false,
    productsUnavailable: false,
    barcodeMatch: false,
    guidanceUnavailable: false,
    mismatchEnrichment: false,
  };
  const calls: Array<{ path: string; method: string; body: unknown; key: string | undefined }> = [];
  const store = () => ({
    id: 'sto_fixture',
    name: 'Synthetic Branch',
    address: { street: '1 Imaginary Lane', city: 'Fixtureville', region: 'IA' },
    content_revision: state.storeRevision,
    source_refs: [{ source_id: 'all_the_places', record_id: 'fixture' }],
    status: 'open',
    opening_hours: 'Mo-Fr 09:00-17:00',
  });
  const envelope = (data: unknown) => ({
    schema_version: '1.0.0',
    data,
    meta: {
      catalog_generation: state.generation,
      source_refs: [],
      warnings: [],
      next_cursor: null,
    },
  });
  const server = createServer(async (req, res) => {
    let bytes = '';
    for await (const chunk of req) {
      bytes += chunk;
      if (bytes.length > 8192) {
        res.writeHead(413).end();
        return;
      }
    }
    const url = new URL(req.url!, 'http://fixture.invalid');
    calls.push({
      path: req.url!,
      method: req.method!,
      body: bytes ? JSON.parse(bytes) : null,
      key: req.headers['x-api-key'] as string | undefined,
    });
    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(payload));
    };
    if (state.unavailable) return send(503, { error: { code: 'CATALOG_UNAVAILABLE' } });
    if (state.initializing) return send(503, { error: { code: 'CATALOG_NOT_READY' } });
    if (state.rightsBlocked) return send(403, { error: { code: 'RIGHTS_BLOCKED' } });
    if (url.pathname === '/v1/chains')
      return send(
        200,
        envelope([
          {
            id: 'chn_fixture',
            name: 'Fixture Market',
            content_revision: 'chain_1',
            source_refs: [],
            observed_store_count: 2,
          },
        ]),
      );
    if (url.pathname === '/v1/capabilities')
      return send(
        200,
        envelope({
          packs: Object.fromEntries(
            ['usda', 'stores', 'products', 'maps', 'prices'].map((name) => [
              name,
              {
                implemented: true,
                enabled: !state.disabled,
                available: !(state.partial && name === 'products'),
                stale: state.stale,
              },
            ]),
          ),
          sources: { usda_fdc: { enabled: true, available: true, stale: state.stale } },
          map_assets: { implemented: true, rights_blocked: state.mapRights },
        }),
      );
    if (url.pathname === '/fdc/v1/foods/search')
      return send(200, {
        foods: [
          {
            ...syntheticUsda,
            ...(state.barcodeMatch ? { dataType: 'Branded', gtinUpc: '4006381333931' } : {}),
          },
        ],
      });
    if (url.pathname === '/v1/products') return send(200, envelope([]));
    if (url.pathname === '/v1/products/resolve' && state.productsUnavailable)
      return send(503, { error: { code: 'CATALOG_NOT_READY' } });
    if (url.pathname === '/v1/products/resolve')
      return send(
        200,
        envelope([
          {
            identifier: { namespace: 'gtin', value: '04006381333931' },
            status: 'exact',
            candidates: [
              {
                id: 'prd_fixture',
                content_revision: state.revision,
                source_refs: [{ source_id: 'open_food_facts', record_id: '4006381333931' }],
              },
            ],
          },
        ]),
      );
    if (url.pathname === '/v1/shopping/enrich') {
      const input = JSON.parse(bytes) as {
        lines: Array<{ line_id: string; product_id: string; store_id?: string }>;
      };
      return send(
        200,
        envelope(
          input.lines.map((line) => ({
            line_id: line.line_id,
            product: {
              id: state.mismatchEnrichment ? 'wrong-product' : line.product_id,
              name: 'Synthetic oats',
              content_revision: state.revision,
              source_refs: [{ source_id: 'open_food_facts', record_id: '4006381333931' }],
            },
            retail_evidence: {
              product_id: line.product_id,
              store_id: line.store_id ?? null,
              assortment_status: 'unknown',
              availability: 'unknown',
              offers: [],
              placements: [],
              chain_evidence: [],
              capabilities: {},
              reason: 'No current branch evidence.',
            },
          })),
        ),
      );
    }
    if (url.pathname === '/v1/guidance/storage') {
      if (state.guidanceUnavailable) return send(503, { error: { code: 'PACK_DISABLED' } });
      return send(
        200,
        envelope([
          {
            id: 'guidance_fixture',
            name: 'Synthetic oats',
            content_revision: 'guidance_1',
            source_refs: [{ source_id: 'foodkeeper', record_id: '1' }],
            storage_guidance: {
              Refrigerate_Min: 0,
              Refrigerate_Max: null,
              Refrigerate_Metric: 'Days',
              Notes: 'Under the stated source conditions only.',
            },
            attribution: 'USDA FSIS FoodKeeper',
            license: 'CC0-1.0_as_catalogued',
            precise_expiry: false,
            source_record: { private_unprojected_field: 'discard me' },
          },
        ]),
      );
    }
    if (url.pathname.startsWith('/v1/foods/')) {
      if (state.missingFood) return send(404, { error: { code: 'NOT_FOUND' } });
      if (url.searchParams.has('revision') && url.searchParams.get('revision') !== state.revision)
        return send(409, { error: { code: 'REVISION_EXPIRED' } });
      if (url.pathname.endsWith('/measures'))
        return send(
          200,
          envelope([
            {
              amount: 1,
              measureUnit: { name: 'cup' },
              modifier: 'chopped',
              gramWeight: 120,
              form: 'raw',
            },
            { amount: 1, unit: 'piece' },
          ]),
        );
      const off = url.pathname.includes('/open_food_facts/');
      return send(
        200,
        envelope({
          source_id: off ? 'open_food_facts' : 'usda_fdc',
          record_id: off ? '4006381333931' : '123',
          content_revision: state.revision,
          measures: [{ amount: 10, unit: 'g', basis: 'mass' }],
          data: off
            ? {
                code: '4006381333931',
                product_name: 'Synthetic barcode oats',
                nutriments: { proteins_100g: state.protein },
                nutrition_data_per: '100g',
                image_front_url: 'https://images.openfoodfacts.org/forbidden.jpg',
              }
            : {
                ...syntheticUsda,
                ...(state.barcodeMatch ? { dataType: 'Branded', gtinUpc: '4006381333931' } : {}),
                foodNutrients: [
                  { nutrient: { id: 1003, name: 'Protein', unitName: 'g' }, amount: state.protein },
                ],
              },
        }),
      );
    }
    if (url.pathname === '/v1/stores') return send(200, envelope([store()]));
    if (url.pathname === '/v1/stores/sto_fixture') return send(200, envelope(store()));
    if (url.pathname.endsWith('/maps'))
      return send(
        200,
        envelope([
          {
            id: 'map_fixture',
            store_id: 'sto_fixture',
            content_revision: 'map_1',
            source_refs: [],
            source_url: 'https://retailer.example.test/official-map',
            display_permitted: !state.mapRights,
            rights_status: state.mapRights ? 'pending' : 'permitted',
          },
        ]),
      );
    if (url.pathname.endsWith('/retail-evidence'))
      return send(
        200,
        envelope({
          product_id: 'prd_fixture',
          store_id: url.searchParams.get('store_id'),
          assortment_status: 'unknown',
          availability: 'unknown',
          offers: [],
          placements: [],
          chain_evidence: [{ scope: 'chain', historical: true }],
          capabilities: {},
          reason: null,
        }),
      );
    send(404, { error: { code: 'NOT_FOUND' } });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    state,
    calls,
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
