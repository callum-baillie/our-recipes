import 'server-only';

import { getRuntimeConfig } from '@/lib/config';
import { directFoodFallbackAllowed } from '@/lib/services/bord-catalog-service';
import { SettingsRow } from './settings-primitives';

/** Deliberately project only non-secret startup configuration into the page. */
export function FoodRuntimeSettings() {
  const food = getRuntimeConfig().foodData;
  const rows: [string, string, string[]][] = [
    ['Food-data mode · FOOD_DATA_MODE', food.mode, ['FOOD_DATA_MODE']],
    [
      'Remote fallback · FOOD_DATA_ALLOW_REMOTE_FALLBACK',
      `${food.allowRemoteFallback ? 'Configured on' : 'Configured off'} · ${directFoodFallbackAllowed() ? 'permitted by current mode' : 'direct fallback blocked by current mode'}`,
      ['FOOD_DATA_ALLOW_REMOTE_FALLBACK', 'FOOD_DATA_MODE'],
    ],
    [
      'Catalog request deadline · BORD_FOOD_API_TIMEOUT_MS',
      `${food.catalog.timeoutMs} ms`,
      ['BORD_FOOD_API_TIMEOUT_MS'],
    ],
    [
      'Catalog credential',
      food.catalog.apiKey ? 'Configured · server only' : 'Not configured',
      ['BORD_FOOD_API_KEY'],
    ],
    [
      'Open Food Facts deadline / configured quota',
      `${food.openFoodFacts.timeoutMs} ms · ${food.openFoodFacts.requestsPerMinute} requests/minute`,
      ['OPEN_FOOD_FACTS_TIMEOUT_MS', 'OPEN_FOOD_FACTS_PRODUCT_RPM'],
    ],
    [
      'USDA deadline / configured quota',
      `${food.usda.timeoutMs} ms · ${food.usda.requestsPerHour} requests/hour · low-quota threshold ${food.usda.lowQuotaRemaining}`,
      ['USDA_FDC_TIMEOUT_MS', 'USDA_FDC_REQUESTS_PER_HOUR', 'USDA_FDC_LOW_QUOTA_REMAINING'],
    ],
    [
      'Exact / search cache freshness',
      `${food.cache.exactTtlSeconds} / ${food.cache.searchTtlSeconds} seconds`,
      ['FOOD_DATA_EXACT_TTL_SECONDS', 'FOOD_DATA_SEARCH_TTL_SECONDS'],
    ],
    [
      'Exact / search stale allowance',
      `${food.cache.exactStaleSeconds} / ${food.cache.searchStaleSeconds} seconds`,
      ['FOOD_DATA_EXACT_STALE_SECONDS', 'FOOD_DATA_SEARCH_STALE_SECONDS'],
    ],
    [
      'Not-found / transient-failure cache',
      `${food.cache.negativeTtlSeconds} / ${food.cache.transientTtlSeconds} seconds`,
      ['FOOD_DATA_NEGATIVE_TTL_SECONDS', 'FOOD_DATA_TRANSIENT_TTL_SECONDS'],
    ],
    [
      'Cache row limit · FOOD_DATA_CACHE_ROW_CAP',
      String(food.cache.rowCap),
      ['FOOD_DATA_CACHE_ROW_CAP'],
    ],
  ];
  return (
    <details className="settings-disclosure">
      <summary>Effective food-data configuration</summary>
      <p>
        Installation settings come from the server environment or built-in defaults. They apply to
        all food lookup paths; personal settings cannot override them. Edit the named environment
        variables and recreate or restart the app to apply changes. Remove an override to restore
        its documented default.
      </p>
      {rows.map(([title, value, variables]) => (
        <SettingsRow key={title} title={title}>
          <output>{value}</output>
          <small>
            {variables
              .map(
                (name) =>
                  `${name}: ${process.env[name] !== undefined ? 'server environment' : 'built-in default'}`,
              )
              .join(' · ')}
          </small>
        </SettingsRow>
      ))}
      <p>
        Quotas are configured request ceilings, not a claim of remaining upstream allowance.
        Source-pack readiness is shown above. Catalog availability and fallback policy do not
        activate datasets or acquisition. Manual entry remains available during an outage.
      </p>
      <a href="https://github.com/callum-baillie/our-recipes/blob/main/docs/bord-catalog-integration.md">
        Configuration and recovery guide
      </a>
    </details>
  );
}
