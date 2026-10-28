'use client';
import { createContext, useContext, type ReactNode } from 'react';

const ProductPhotosEnabled = createContext(false);

/** True only when the server has a food API to proxy photos from; otherwise nothing is requested. */
export function ProductPhotosProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children?: ReactNode;
}) {
  return <ProductPhotosEnabled.Provider value={enabled}>{children}</ProductPhotosEnabled.Provider>;
}

export const useProductPhotos = () => useContext(ProductPhotosEnabled);
