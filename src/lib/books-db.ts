import type { BookSource } from "@/books";
import { loadEpubFromArrayBuffer, type EpubBook } from "@/lib/epub";

const LIBRARY_DATABASE_NAME = "pamphlet-library";
const LIBRARY_DATABASE_VERSION = 3;
const BOOK_DATA_STORE_NAME = "book-data";
const BOOKS_STORE_NAME = "books";
const DATABASE_OPEN_TIMEOUT_MS = 4000;

// A book's data is either the original file's raw bytes (uploaded on this
// device, re-parsed on every read) or already-extracted text pulled from
// another device via sync (which never had a local raw file to begin with).
type StoredBookDataRecord =
  | { data: ArrayBuffer; id: string; kind: "raw" }
  | { content: EpubBook; id: string; kind: "extracted" };

export type UploadedBook = {
  book: BookSource;
  data: ArrayBuffer;
};

export type SyncedBook = {
  book: BookSource;
  content: EpubBook;
};

export async function loadBookCatalog() {
  const database = await openLibraryDatabase();

  return new Promise<BookSource[]>((resolve, reject) => {
    const transaction = database.transaction(BOOKS_STORE_NAME, "readonly");
    const store = transaction.objectStore(BOOKS_STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const records = request.result as BookSource[];
      resolve(
        records
          .sort((left, right) => left.createdAt - right.createdAt)
      );
    };
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

// Reads a book's content, transparently handling both storage kinds: a
// locally-uploaded book is re-parsed from its raw bytes, a synced book is
// returned as-is (it has no raw file on this device).
export async function readBookContent(book: BookSource): Promise<EpubBook> {
  const database = await openLibraryDatabase();

  return new Promise<StoredBookDataRecord>((resolve, reject) => {
    const transaction = database.transaction(
      [BOOKS_STORE_NAME, BOOK_DATA_STORE_NAME],
      "readonly"
    );
    const dataStore = transaction.objectStore(BOOK_DATA_STORE_NAME);
    const dataRequest = dataStore.get(book.storageKey);

    dataRequest.onsuccess = () => {
      const record = dataRequest.result as StoredBookDataRecord | undefined;

      if (record) {
        resolve(record);
        return;
      }

      const legacyStore = transaction.objectStore(BOOKS_STORE_NAME);
      const legacyRequest = legacyStore.get(book.id);

      legacyRequest.onsuccess = () => {
        const legacyRecord = legacyRequest.result as
          | (BookSource & { data?: ArrayBuffer })
          | undefined;

        if (!legacyRecord?.data) {
          reject(new Error("Book is missing from the local library."));
          return;
        }

        resolve({ data: legacyRecord.data, id: book.id, kind: "raw" });
      };
      legacyRequest.onerror = () => reject(legacyRequest.error);
    };
    dataRequest.onerror = () => reject(dataRequest.error);
  })
    .finally(() => database.close())
    .then((record) =>
      record.kind === "raw"
        ? loadEpubFromArrayBuffer(record.data.slice(0))
        : record.content
    );
}

export async function saveUploadedBook(uploadedBook: UploadedBook) {
  const database = await openLibraryDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      [BOOKS_STORE_NAME, BOOK_DATA_STORE_NAME],
      "readwrite"
    );
    const bookStore = transaction.objectStore(BOOKS_STORE_NAME);
    const dataStore = transaction.objectStore(BOOK_DATA_STORE_NAME);
    const bookRequest = bookStore.put(uploadedBook.book);
    const dataRequest = dataStore.put({
      data: uploadedBook.data,
      id: uploadedBook.book.storageKey,
      kind: "raw"
    } satisfies StoredBookDataRecord);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    bookRequest.onerror = () => reject(bookRequest.error);
    dataRequest.onerror = () => reject(dataRequest.error);
  }).finally(() => database.close());
}

// Saves a book pulled from the sync server, which has extracted text but no
// original file to store locally.
export async function saveSyncedBook(syncedBook: SyncedBook) {
  const database = await openLibraryDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      [BOOKS_STORE_NAME, BOOK_DATA_STORE_NAME],
      "readwrite"
    );
    const bookStore = transaction.objectStore(BOOKS_STORE_NAME);
    const dataStore = transaction.objectStore(BOOK_DATA_STORE_NAME);
    const bookRequest = bookStore.put(syncedBook.book);
    const dataRequest = dataStore.put({
      content: syncedBook.content,
      id: syncedBook.book.storageKey,
      kind: "extracted"
    } satisfies StoredBookDataRecord);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    bookRequest.onerror = () => reject(bookRequest.error);
    dataRequest.onerror = () => reject(dataRequest.error);
  }).finally(() => database.close());
}

export async function deleteStoredBook(book: BookSource) {
  const database = await openLibraryDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      [BOOKS_STORE_NAME, BOOK_DATA_STORE_NAME],
      "readwrite"
    );
    const bookStore = transaction.objectStore(BOOKS_STORE_NAME);
    const dataStore = transaction.objectStore(BOOK_DATA_STORE_NAME);

    bookStore.delete(book.id);
    dataStore.delete(book.storageKey);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  }).finally(() => database.close());
}

function openLibraryDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;

      settled = true;
      reject(new Error("Timed out opening the local library database."));
    }, DATABASE_OPEN_TIMEOUT_MS);
    const request = indexedDB.open(
      LIBRARY_DATABASE_NAME,
      LIBRARY_DATABASE_VERSION
    );

    request.onblocked = () => {
      if (settled) return;

      settled = true;
      window.clearTimeout(timeout);
      reject(new Error("Library database is blocked by another open tab."));
    };
    request.onupgradeneeded = (event) => {
      const database = request.result;
      const transaction = request.transaction;

      if (!database.objectStoreNames.contains(BOOKS_STORE_NAME)) {
        database.createObjectStore(BOOKS_STORE_NAME, {
          keyPath: "id"
        });
      }

      if (!database.objectStoreNames.contains(BOOK_DATA_STORE_NAME)) {
        database.createObjectStore(BOOK_DATA_STORE_NAME, {
          keyPath: "id"
        });
      }

      if (event.oldVersion < 2 && transaction) {
        splitLegacyBookRecords(transaction);
      }

      if (event.oldVersion < 3 && event.oldVersion >= 2 && transaction) {
        tagRawBookData(transaction);
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

function splitLegacyBookRecords(transaction: IDBTransaction) {
  const bookStore = transaction.objectStore(BOOKS_STORE_NAME);
  const dataStore = transaction.objectStore(BOOK_DATA_STORE_NAME);
  const cursorRequest = bookStore.openCursor();

  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;

    if (!cursor) return;

    const legacyRecord = cursor.value as BookSource & {
      data?: ArrayBuffer;
    };
    const { data, ...book } = legacyRecord;

    if (data) {
      dataStore.put({
        data,
        id: book.storageKey,
        kind: "raw"
      } satisfies StoredBookDataRecord);
      cursor.update(book);
    }

    cursor.continue();
  };
}

// Tags every pre-v3 book-data record "raw" - every one of them was
// definitionally raw file bytes before synced ("extracted") books existed.
function tagRawBookData(transaction: IDBTransaction) {
  const dataStore = transaction.objectStore(BOOK_DATA_STORE_NAME);
  const cursorRequest = dataStore.openCursor();

  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;

    if (!cursor) return;

    const record = cursor.value as { data: ArrayBuffer; id: string };
    cursor.update({ ...record, kind: "raw" } satisfies StoredBookDataRecord);
    cursor.continue();
  };
}
