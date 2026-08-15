import type { BookSource } from "@/books";

const LIBRARY_DATABASE_NAME = "pamphlet-library";
const LIBRARY_DATABASE_VERSION = 2;
const BOOK_DATA_STORE_NAME = "book-data";
const BOOKS_STORE_NAME = "books";
const DATABASE_OPEN_TIMEOUT_MS = 4000;

type StoredBookDataRecord = {
  data: ArrayBuffer;
  id: string;
};

export type UploadedBook = {
  book: BookSource;
  data: ArrayBuffer;
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

export async function readBookData(book: BookSource) {
  const database = await openLibraryDatabase();

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const transaction = database.transaction(
      [BOOKS_STORE_NAME, BOOK_DATA_STORE_NAME],
      "readonly"
    );
    const dataStore = transaction.objectStore(BOOK_DATA_STORE_NAME);
    const dataRequest = dataStore.get(book.storageKey);

    dataRequest.onsuccess = () => {
      const record = dataRequest.result as StoredBookDataRecord | undefined;

      if (record) {
        resolve(record.data.slice(0));
        return;
      }

      const legacyStore = transaction.objectStore(BOOKS_STORE_NAME);
      const legacyRequest = legacyStore.get(book.id);

      legacyRequest.onsuccess = () => {
        const legacyRecord = legacyRequest.result as
          | (BookSource & StoredBookDataRecord)
          | undefined;

        if (!legacyRecord?.data) {
          reject(new Error("Book is missing from the local library."));
          return;
        }

        resolve(legacyRecord.data.slice(0));
      };
      legacyRequest.onerror = () => reject(legacyRequest.error);
    };
    dataRequest.onerror = () => reject(dataRequest.error);
  }).finally(() => database.close());
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
      id: uploadedBook.book.storageKey
    } satisfies StoredBookDataRecord);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    bookRequest.onerror = () => reject(bookRequest.error);
    dataRequest.onerror = () => reject(dataRequest.error);
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
        id: book.storageKey
      } satisfies StoredBookDataRecord);
      cursor.update(book);
    }

    cursor.continue();
  };
}
