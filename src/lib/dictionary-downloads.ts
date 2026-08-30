import {
  deleteDictionary,
  listDownloadedDictionaryKeys,
  saveDictionary
} from "@/lib/dictionaries-db";
import { getDictionaryFileUrl } from "@/lib/sync-client";

export async function getDownloadedDictionaryKeys(): Promise<Set<string>> {
  return new Set(await listDownloadedDictionaryKeys());
}

// Downloads both files for a dataset (lemma definitions + form redirects)
// and stores them as one record. onProgress reports overall fraction
// (0-1), weighted by each file's share of the total download.
export async function downloadDictionary(
  key: string,
  onProgress?: (fraction: number) => void
) {
  let lemmasBytes = 0;
  let formsBytes = 0;
  let lemmasTotal = 0;
  let formsTotal = 0;

  const report = () => {
    const total = lemmasTotal + formsTotal;
    if (total === 0) return;
    onProgress?.((lemmasBytes + formsBytes) / total);
  };

  const [lemmas, forms] = await Promise.all([
    fetchJsonWithProgress(getDictionaryFileUrl(`${key}.json`), (loaded, total) => {
      lemmasBytes = loaded;
      lemmasTotal = total;
      report();
    }),
    fetchJsonWithProgress(getDictionaryFileUrl(`${key}.forms.json`), (loaded, total) => {
      formsBytes = loaded;
      formsTotal = total;
      report();
    })
  ]);

  await saveDictionary({
    downloadedAt: Date.now(),
    forms: forms as Record<string, string>,
    key,
    lemmas: lemmas as Record<string, string[]>
  });
}

export async function removeDictionary(key: string) {
  await deleteDictionary(key);
}

async function fetchJsonWithProgress(
  url: string,
  onProgress: (loaded: number, total: number) => void
): Promise<unknown> {
  const response = await fetch(url);

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}`);
  }

  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    if (value) {
      chunks.push(value);
      loaded += value.length;
      onProgress(loaded, total || loaded);
    }
  }

  const merged = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return JSON.parse(new TextDecoder().decode(merged));
}
