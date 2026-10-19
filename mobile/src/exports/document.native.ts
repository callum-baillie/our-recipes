import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { randomUUID } from 'expo-crypto';

export async function presentDocument(
  bytes: ArrayBuffer,
  filename: string,
  mimeType: string,
  print = false,
) {
  if (print && mimeType !== 'application/pdf')
    throw new Error('Only PDF documents can be printed.');
  const file = new File(
    Paths.cache,
    `${randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '-')}`,
  );
  file.create();
  file.write(new Uint8Array(bytes));
  if (print) {
    // Android resolves when the dialog opens; retain the cache file for the print service.
    await Print.printAsync({ uri: file.uri });
    return;
  }
  try {
    if (!(await Sharing.isAvailableAsync()))
      throw new Error('File sharing is unavailable on this device.');
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename });
  } finally {
    if (file.exists) file.delete();
  }
}
