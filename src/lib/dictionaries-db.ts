const DICTIONARY_DATABASE_NAME = "pamphlet-dictionaries";
const DICTIONARY_DATABASE_VERSION = 1;
const DICTIONARY_STORE_NAME = "dictionaries";
const DATABASE_OPEN_TIMEOUT_MS = 4000;

// One record per downloaded language pair (e.g. "fr-fr", "fr-en"). lemmas
// maps a headword to its glosses; forms maps an inflected surface form
// (a conjugated verb, a plural, etc.) back to its headword in lemmas — see
// pamphlet-sync's DEPLOY.md and scripts/dictionary/trim-lemma.ts for how
// these are built.
export type StoredDictionary = {
  downloadedAt: number;
  forms: Record<string, string>;
  key: string;
  lemmas: Record<string, string[]>;
};

export async function listDownloadedDictionaryKeys(): Promise<string[]> {
  const database = await openDictionaryDatabase();

  return new Promise<string[]>((resolve, reject) => {
    const store = database
      .transaction(DICTIONARY_STORE_NAME, "readonly")
      .objectStore(DICTIONARY_STORE_NAME);
    const request = store.getAllKeys();

    request.onsuccess = () => resolve(request.result as string[]);
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

export async function loadDictionary(
  key: string
): Promise<StoredDictionary | undefined> {
  const database = await openDictionaryDatabase();

  return new Promise<StoredDictionary | undefined>((resolve, reject) => {
    const store = database
      .transaction(DICTIONARY_STORE_NAME, "readonly")
      .objectStore(DICTIONARY_STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () =>
      resolve(request.result as StoredDictionary | undefined);
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

export async function saveDictionary(dictionary: StoredDictionary) {
  const database = await openDictionaryDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      DICTIONARY_STORE_NAME,
      "readwrite"
    );
    transaction.objectStore(DICTIONARY_STORE_NAME).put(dictionary);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  }).finally(() => database.close());
}

export async function deleteDictionary(key: string) {
  const database = await openDictionaryDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      DICTIONARY_STORE_NAME,
      "readwrite"
    );
    transaction.objectStore(DICTIONARY_STORE_NAME).delete(key);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  }).finally(() => database.close());
}

function openDictionaryDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;

      settled = true;
      reject(new Error("Timed out opening the dictionaries database."));
    }, DATABASE_OPEN_TIMEOUT_MS);
    const request = indexedDB.open(
      DICTIONARY_DATABASE_NAME,
      DICTIONARY_DATABASE_VERSION
    );

    request.onblocked = () => {
      if (settled) return;

      settled = true;
      window.clearTimeout(timeout);
      reject(new Error("Dictionaries database is blocked by another open tab."));
    };
    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(DICTIONARY_STORE_NAME)) {
        database.createObjectStore(DICTIONARY_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }

      settled = true;
      window.clearTimeout(timeout);
      resolve(request.result);
    };
    request.onerror = () => {
      if (settled) return;

      settled = true;
      window.clearTimeout(timeout);
      reject(request.error);
    };
  });
}
