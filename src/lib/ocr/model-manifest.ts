export const LOCAL_OCR_MODEL = {
  id: 'tesseract-eng-4.0.0',
  language: 'eng',
  purpose:
    'Review-first OCR assistance for legible English recipe scans; not handwriting validation.',
  runtime: {
    package: 'tesseract.js',
    version: '7.0.0',
    integrity:
      'sha512-exPBkd+z+wM1BuMkx/Bjv43OeLBxhL5kKWsz/9JY+DXcXdiBjiAch0V49QR3oAJqCaL5qURE0vx9Eo+G5YE7mA==',
    license: 'Apache-2.0',
  },
  data: {
    package: '@tesseract.js-data/eng',
    version: '1.0.0',
    integrity:
      'sha512-mbTumm6KQPUHyzTPQaF3ObXYnx0SqqfV2nabqFVQBwD6Kl7PhGSLSzOlfFTWy0P3BjghaSKA2W9GB19Jk+ZcTg==',
    license: 'MIT',
    repository: 'https://github.com/naptha/tessdata',
    assetDirectory: '4.0.0',
    assetFile: 'eng.traineddata.gz',
  },
} as const;

export type LocalOcrModelProvenance = {
  modelId: string;
  runtimeVersion: string;
  dataVersion: string;
  engineVersion: string | null;
  aggregateConfidence: number | null;
};

export function localOcrModelProvenance(
  aggregateConfidence: number | null,
  engineVersion: string | null,
): LocalOcrModelProvenance {
  return {
    modelId: LOCAL_OCR_MODEL.id,
    runtimeVersion: LOCAL_OCR_MODEL.runtime.version,
    dataVersion: LOCAL_OCR_MODEL.data.version,
    engineVersion,
    aggregateConfidence,
  };
}
