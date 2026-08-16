const PINNED_WORDS_DATABASE_NAME = "pamphlet-pinned-words";
const PINNED_WORDS_DATABASE_VERSION = 1;
const PINNED_WORDS_STORE_NAME = "pinned-words";
const LANGUAGE_CODE_INDEX_NAME = "languageCode";
const DATABASE_OPEN_TIMEOUT_MS = 4000;

type PinnedWordRecord = {
  id: string;
  languageCode: string;
  word: string;
};

export async function loadPinnedWords(languageCode: string) {
  const database = await openPinnedWordsDatabase();

  return new Promise<Set<string>>((resolve, reject) => {
    const transaction = database.transaction(PINNED_WORDS_STORE_NAME, "readonly");
    const store = transaction.objectStore(PINNED_WORDS_STORE_NAME);
    const index = store.index(LANGUAGE_CODE_INDEX_NAME);
    const request = index.getAll(languageCode);

    request.onsuccess = () => {
      const records = request.result as PinnedWordRecord[];
      resolve(new Set(records.map((record) => record.word)));
    };
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

export async function setWordPinned(
  languageCode: string,
  word: string,
  pinned: boolean
) {
  const database = await openPinnedWordsDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(PINNED_WORDS_STORE_NAME, "readwrite");
    const store = transaction.objectStore(PINNED_WORDS_STORE_NAME);
    const id = getPinnedWordId(languageCode, word);

    if (pinned) {
      store.put({ id, languageCode, word } satisfies PinnedWordRecord);
    } else {
      store.delete(id);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  }).finally(() => database.close());
}

function getPinnedWordId(languageCode: string, word: string) {
  return `${languageCode}::${word}`;
}

function openPinnedWordsDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;

      settled = true;
      reject(new Error("Timed out opening the pinned words database."));
    }, DATABASE_OPEN_TIMEOUT_MS);
    const request = indexedDB.open(
      PINNED_WORDS_DATABASE_NAME,
      PINNED_WORDS_DATABASE_VERSION
    );

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(PINNED_WORDS_STORE_NAME)) {
        const store = database.createObjectStore(PINNED_WORDS_STORE_NAME, {
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
