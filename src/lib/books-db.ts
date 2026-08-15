import type { BookSource } from "@/books";

const LIBRARY_DATABASE_NAME = "pamphlet-library";
const LIBRARY_DATABASE_VERSION = 1;
const BOOKS_STORE_NAME = "books";

type StoredBookRecord = BookSource & {
  data: ArrayBuffer;
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
      const records = request.result as StoredBookRecord[];
      resolve(
        records
          .map(({ data: _data, ...book }) => book)
          .sort((left, right) => left.createdAt - right.createdAt)
      );
    };
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

export async function readBookData(book: BookSource) {
  const database = await openLibraryDatabase();

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const transaction = database.transaction(BOOKS_STORE_NAME, "readonly");
    const store = transaction.objectStore(BOOKS_STORE_NAME);
    const request = store.get(book.id);

    request.onsuccess = () => {
      const record = request.result as StoredBookRecord | undefined;

      if (!record) {
        reject(new Error("Book is missing from the local library."));
        return;
      }

      resolve(record.data.slice(0));
    };
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

export async function saveUploadedBook(uploadedBook: UploadedBook) {
  const database = await openLibraryDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(BOOKS_STORE_NAME, "readwrite");
    const store = transaction.objectStore(BOOKS_STORE_NAME);
    const request = store.put({
      ...uploadedBook.book,
      data: uploadedBook.data
    } satisfies StoredBookRecord);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

function openLibraryDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(
      LIBRARY_DATABASE_NAME,
      LIBRARY_DATABASE_VERSION
    );

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(BOOKS_STORE_NAME)) {
        database.createObjectStore(BOOKS_STORE_NAME, {
          keyPath: "id"
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
