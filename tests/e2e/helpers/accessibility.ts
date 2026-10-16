import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/** The requested mobile viewport locks pinch zoom; retain every other axe rule. */
export function appAxe(page: Page) {
  return new AxeBuilder({ page }).disableRules(['meta-viewport']);
}
