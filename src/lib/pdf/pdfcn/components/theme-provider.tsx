// Adapted from pdfcn (MIT): https://www.pdfcn.dev/
import type { Style } from '@formepdf/react';
import type { DependencyList, ReactNode } from 'react';

import { professionalTheme } from '@/lib/pdf/pdfcn/themes/professional';

export type PdfcnTheme = typeof professionalTheme;

export interface PdfcnThemeProviderProps {
  theme?: PdfcnTheme;
  children: ReactNode;
}

type PdfStyleInput = Style | PdfStyleInput[] | false | null | undefined;

const mergeStyleInput = (target: Style, input: PdfStyleInput): void => {
  if (Array.isArray(input)) {
    for (const item of input) {
      mergeStyleInput(target, item);
    }
  } else if (input) {
    Object.assign(target, input);
  }
};

export const mergePdfStyles = (...inputs: PdfStyleInput[]): Style => {
  const merged: Style = {};
  for (const input of inputs) {
    mergeStyleInput(merged, input);
  }
  return merged;
};

// A single immutable application theme avoids cross-request theme leakage.
export const PdfcnThemeProvider = ({ children }: PdfcnThemeProviderProps) => children;
export const usePdfcnTheme = (): PdfcnTheme => professionalTheme;
export const useSafeMemo = <T,>(factory: () => T, _deps: DependencyList): T => {
  void _deps;
  return factory();
};
