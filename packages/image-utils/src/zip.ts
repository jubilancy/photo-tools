import { Zip, ZipPassThrough } from 'fflate';
import { uniqueNames } from './names';

export interface ZipEntry {
  name: string;
  blob: Blob;
}

/** Stores (does not recompress) each file: images are already compressed. Duplicate names get `-2`, `-3`, … */
export async function zipBlobs(entries: readonly ZipEntry[]): Promise<Blob> {
  const names = uniqueNames(entries.map((e) => e.name));
  const chunks: BlobPart[] = [];
  let failure = null as Error | null;
  const zip = new Zip((err, chunk) => {
    if (err) failure = err;
    else chunks.push(chunk as BlobPart);
  });
  for (const [i, entry] of entries.entries()) {
    const file = new ZipPassThrough(names[i]!);
    zip.add(file);
    file.push(new Uint8Array(await entry.blob.arrayBuffer()), true);
  }
  zip.end();
  if (failure) throw failure;
  return new Blob(chunks, { type: 'application/zip' });
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
