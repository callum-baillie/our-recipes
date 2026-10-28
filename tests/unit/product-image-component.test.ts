// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { PhotoCredit, ProductImage } from '@/components/product-image';
import { ProductPhotosProvider } from '@/components/product-photos';

afterEach(cleanup);
const withPhotos = (enabled: boolean, ...children: React.ReactNode[]) =>
  createElement(ProductPhotosProvider, { enabled }, ...children);
const icon = createElement('i', { 'data-testid': 'icon' });

it('requests nothing when the food API is not configured', () => {
  const { container } = render(
    withPhotos(false, createElement(ProductImage, { gtin: '012345678905', fallback: icon })),
  );
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('[data-testid=icon]')).not.toBeNull();
});

it('loads a photo through the first-party proxy and never exposes a key or source URL', () => {
  const { container } = render(
    withPhotos(true, createElement(ProductImage, { gtin: '4006381333931', fallback: icon })),
  );
  const photo = container.querySelector('img')!;
  expect(photo.getAttribute('src')).toBe('/api/v1/food-data/images/4006381333931');
  expect(photo.getAttribute('alt')).toBe('');
  expect(photo.dataset.state).toBe('loading');
  fireEvent.load(photo);
  expect(photo.dataset.state).toBe('ready');
});

it('keeps the fallback when a photo is missing and does not ask for it again this session', () => {
  const first = render(
    withPhotos(true, createElement(ProductImage, { gtin: '036000291452', fallback: icon })),
  );
  fireEvent.error(first.container.querySelector('img')!);
  expect(first.container.querySelector('img')).toBeNull();
  expect(first.container.querySelector('[data-testid=icon]')).not.toBeNull();
  const second = render(
    withPhotos(true, createElement(ProductImage, { gtin: '036000291452', fallback: icon })),
  );
  expect(second.container.querySelector('img')).toBeNull();
});

it('shows no photo without a barcode, and shows the licence credit only when photos are on', () => {
  expect(
    render(
      withPhotos(true, createElement(ProductImage, { gtin: null, fallback: icon })),
    ).container.querySelector('img'),
  ).toBeNull();
  cleanup();
  expect(render(withPhotos(false, createElement(PhotoCredit))).container.textContent).toBe('');
  cleanup();
  const credit = render(withPhotos(true, createElement(PhotoCredit))).container;
  expect(credit.textContent).toContain('Open Food Facts');
  expect(credit.textContent).toContain('CC BY-SA 3.0');
  expect(credit.textContent).toContain('JPEG');
});
