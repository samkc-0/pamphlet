const PINNED_SENTENCES_DATABASE_NAME = "pamphlet-pinned-sentences";
const PINNED_SENTENCES_DATABASE_VERSION = 1;
const PINNED_SENTENCES_STORE_NAME = "pinned-sentences";
const LANGUAGE_CODE_INDEX_NAME = "languageCode";
const DATABASE_OPEN_TIMEOUT_MS = 4000;

export type PinnedSentenceRecord = {
  id: string;
  languageCode: string;
  sentence: string;
  updatedAt: number;
};

export async function loadPinnedSentences(languageCode: string) {
  const database = await openPinnedSentencesDatabase();

  return new Promise<Set<string>>((resolve, reject) => {
    const transaction = database.transaction(
      PINNED_SENTENCES_STORE_NAME,
      "readonly"
    );
    const store = transaction.objectStore(PINNED_SENTENCES_STORE_NAME);
    const index = store.index(LANGUAGE_CODE_INDEX_NAME);
    const request = index.getAll(languageCode);

    request.onsuccess = () => {
      const records = request.result as PinnedSentenceRecord[];
      resolve(new Set(records.map((record) => record.sentence)));
    };
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

/**
 * Reads every pinned-sentence record across all languages, with its
 * timestamp - used only to compare against incoming sync data, which isn't
 * scoped to one language the way the reader UI's lookups are.
 */
export async function loadAllPinnedSentenceRecords() {
  const database = await openPinnedSentencesDatabase();

  return new Promise<PinnedSentenceRecord[]>((resolve, reject) => {
    const transaction = database.transaction(
      PINNED_SENTENCES_STORE_NAME,
      "readonly"
    );
    const store = transaction.objectStore(PINNED_SENTENCES_STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as PinnedSentenceRecord[]);
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

export async function setSentencePinned(
  languageCode: string,
  sentence: string,
  pinned: boolean,
  updatedAt: number = Date.now()
) {
  const database = await openPinnedSentencesDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      PINNED_SENTENCES_STORE_NAME,
      "readwrite"
    );
    const store = transaction.objectStore(PINNED_SENTENCES_STORE_NAME);
    const id = getPinnedSentenceId(languageCode, sentence);

    if (pinned) {
      store.put({
        id,
        languageCode,
        sentence,
        updatedAt
      } satisfies PinnedSentenceRecord);
    } else {
      store.delete(id);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  }).finally(() => database.close());
}

function getPinnedSentenceId(languageCode: string, sentence: string) {
  return `${languageCode}::${sentence}`;
}

function openPinnedSentencesDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;

      settled = true;
      reject(new Error("Timed out opening the pinned sentences database."));
    }, DATABASE_OPEN_TIMEOUT_MS);
    const request = indexedDB.open(
      PINNED_SENTENCES_DATABASE_NAME,
      PINNED_SENTENCES_DATABASE_VERSION
    );

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(PINNED_SENTENCES_STORE_NAME)) {
        const store = database.createObjectStore(PINNED_SENTENCES_STORE_NAME, {
          keyPath: "id"
        });
        store.createIndex(LANGUAGE_CODE_INDEX_NAME, LANGUAGE_CODE_INDEX_NAME);
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
