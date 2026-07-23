import type {
  FoodProviderCapabilities,
  FoodProviderId,
  FoodRecord,
  ProviderStatus,
} from '@/lib/domain/food-data';

export type ProviderResponse<T> = {
  value: T;
  rateLimit: number | null;
  rateRemaining: number | null;
  retryAt: Date | null;
};

export interface FoodDataProvider {
  readonly id: Exclude<FoodProviderId, 'local'>;
  readonly capabilities: FoodProviderCapabilities;
  status(): ProviderStatus;
  lookupBarcode(
    canonicalGtin: string,
    language: string,
  ): Promise<ProviderResponse<FoodRecord | null>>;
  searchByName(
    query: string,
    page: number,
    kind: 'any' | 'generic' | 'branded',
  ): Promise<ProviderResponse<FoodRecord[]>>;
  getDetails(recordId: string, language: string): Promise<ProviderResponse<FoodRecord | null>>;
}
