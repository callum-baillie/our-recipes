import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/** Run the complete ruleset, including the zoomable viewport contract. */
export function appAxe(page: Page) {
  return new AxeBuilder({ page });
}
