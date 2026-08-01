import { describe, expect, it } from 'vitest';
import {
  attachmentMimeType,
  attachmentSizeLabel,
  safeAttachmentName,
} from '@/screens/assistant-attachments';

describe('assistant attachments', () => {
  it('sanitizes device filenames before sending them to the server', () => {
    expect(safeAttachmentName(' pantry/photo?.jpg ', 'photo.jpg')).toBe('pantry-photo-.jpg');
  });

  it('infers supported document types when a provider omits the MIME type', () => {
    expect(attachmentMimeType('menu.PDF')).toBe('application/pdf');
    expect(attachmentMimeType('archive.zip')).toBeNull();
  });

  it('formats attachment sizes compactly', () => {
    expect(attachmentSizeLabel(82_000)).toBe('82 KB');
    expect(attachmentSizeLabel(2_450_000)).toBe('2.5 MB');
  });
});
