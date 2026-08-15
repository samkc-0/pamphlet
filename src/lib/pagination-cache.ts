import type { BookSource } from "@/books";
import type { ReaderPage } from "@/lib/pagination";

const CACHE_DATABASE_NAME = "pamphlet-cache";
const CACHE_DATABASE_VERSION = 1;
const PAGINATION_STORE_NAME = "pagination";
const PAGINATION_CACHE_VERSION = 1;

export type CachedPagination = {
  bookId: string;
  cacheKey: string;
  createdAt: number;
  pages: ReaderPage[];
  sourceFingerprint: string;
  viewportKey: string;
};

export async function readCachedPagination(
  book: BookSource,
  viewportKey: string
) {
  try {
    const database = await openCacheDatabase();
    const cacheKey = getPaginationCacheKey(book, viewportKey);

    return await new Promise<CachedPagination | undefined>((resolve) => {
      const transaction = database.transaction(
        PAGINATION_STORE_NAME,
        "readonly"
      );
      const store = transaction.objectStore(PAGINATION_STORE_NAME);
      const request = store.get(cacheKey);

      request.onsuccess = () => {
        resolve(
          isCachedPagination(request.result) ? request.result : undefined
        );
      };
      request.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}

export async function writeCachedPagination(
  book: BookSource,
  viewportKey: string,
  pages: ReaderPage[]
) {
  try {
    const database = await openCacheDatabase();
    const cacheKey = getPaginationCacheKey(book, viewportKey);
    const cachedPagination: CachedPagination = {
      bookId: book.id,
      cacheKey,
      createdAt: Date.now(),
      pages,
      sourceFingerprint: book.fingerprint,
      viewportKey
    };

    await new Promise<void>((resolve) => {
      const transaction = database.transaction(
        PAGINATION_STORE_NAME,
        "readwrite"
      );
      const store = transaction.objectStore(PAGINATION_STORE_NAME);
      const request = store.put(cachedPagination);

      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch {
    // Pagination caching is an optimization; measured pagination is the fallback.
  }
}

function openCacheDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(CACHE_DATABASE_NAME, CACHE_DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(PAGINATION_STORE_NAME)) {
        database.createObjectStore(PAGINATION_STORE_NAME, {
          keyPath: "cacheKey"
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getPaginationCacheKey(book: BookSource, viewportKey: string) {
  return [
    PAGINATION_CACHE_VERSION,
    book.id,
    book.fingerprint,
    viewportKey
  ].join(":");
}

function isCachedPagination(value: unknown): value is CachedPagination {
  if (!value || typeof value !== "object") return false;

  const candidate = value as CachedPagination;

  return (
    typeof candidate.bookId === "string" &&
    typeof candidate.cacheKey === "string" &&
    Array.isArray(candidate.pages) &&
    typeof candidate.sourceFingerprint === "string" &&
    typeof candidate.viewportKey === "string"
  );
}
