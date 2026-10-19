/** Browser exports never import native filesystem APIs. */
export async function presentDocument(
  bytes: ArrayBuffer,
  filename: string,
  mimeType: string,
  print = false,
) {
  if (print) throw new Error('Download the PDF and print it from your PDF viewer.');
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
