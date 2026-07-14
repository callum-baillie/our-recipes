import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { recognizeLocalEnglishScans } from '@/lib/ocr/local-ocr';

describe('local English OCR smoke', () => {
  it('recognizes a generated printed recipe fixture using the packaged local model', async () => {
    const svg = `
      <svg width="1800" height="900" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#fffdf7" />
        <g fill="#111" font-family="Arial, sans-serif" font-size="76">
          <text x="100" y="160">TOMATO SOUP</text>
          <text x="100" y="310">INGREDIENTS</text>
          <text x="100" y="430">2 TOMATOES</text>
          <text x="100" y="580">METHOD</text>
          <text x="100" y="700">SIMMER GENTLY</text>
        </g>
      </svg>`;
    const image = await sharp(Buffer.from(svg)).png().toBuffer();

    const result = await recognizeLocalEnglishScans([image]);

    expect(result.text).toMatch(/TOMATO\s+SOUP/i);
    expect(result.text).toMatch(/INGREDIENTS/i);
    expect(result.provenance.modelId).toBe('tesseract-eng-4.0.0');
    expect(result.provenance.aggregateConfidence).toBeGreaterThanOrEqual(65);
  }, 60_000);
});
