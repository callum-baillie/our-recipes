import type { BordState } from '@/state/reducer';
import { defaultSettings } from '@/data/default-settings';
export { bordReducer, type BordAction, type BordState } from '@/state/reducer';
export const initialState: BordState = {
  recipes: [],
  favorites: [],
  pantry: [],
  mealPlan: [],
  lists: [],
  settings: defaultSettings,
  cook: {},
  offline: false,
  nutrition: { profiles: [], household: null, profileDetails: {} },
  lastSyncedAt: null,
  recipeDraft: null,
  collections: [],
  tags: [],
  profiles: [],
};
