export const MAX_CHAT_ATTACHMENTS = 4;
export const MAX_CHAT_ATTACHMENT_BYTES = 6_000_000;
export const MAX_CHAT_ATTACHMENTS_TOTAL_BYTES = 9_000_000;

export const CHAT_FILE_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

export type ChatAttachment = {
  id: string;
  kind: 'image' | 'file';
  name: string;
  mimeType: string;
  size: number;
  uri: string;
  dataBase64: string;
};

const mimeByExtension: Record<string, string> = {
  csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  json: 'application/json',
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function safeAttachmentName(name: string, fallback: string) {
  const sanitized = name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '-')
    .slice(0, 120);
  return sanitized || fallback;
}

export function attachmentMimeType(name: string, supplied?: string | null) {
  if (
    supplied &&
    CHAT_FILE_MIME_TYPES.includes(supplied as (typeof CHAT_FILE_MIME_TYPES)[number])
  ) {
    return supplied;
  }
  return mimeByExtension[name.split('.').pop()?.toLowerCase() ?? ''] ?? null;
}

export function attachmentSizeLabel(size: number) {
  if (size < 1_000_000) return `${Math.max(1, Math.round(size / 1_000))} KB`;
  return `${(size / 1_000_000).toFixed(1)} MB`;
}
