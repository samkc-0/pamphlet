import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, MouseEvent, PointerEvent } from "react";
import { Settings } from "lucide-react";

import type { BookSource } from "@/books";
import {
  SwipeWorkspace,
  type WorkspaceRow
} from "@/components/swipe-workspace";
import {
  WordLookupPopup,
  type WordLookupState
} from "@/components/word-lookup-popup";
import {
  readStoredAppState,
  writeStoredAppState
} from "@/lib/app-state-store";
import {
  deleteStoredBook,
  loadBookCatalog,
  readBookData,
  saveUploadedBook
} from "@/lib/books-db";
import { lookupWord } from "@/lib/dictionary";
import { loadEpubFromArrayBuffer, type EpubBook } from "@/lib/epub";
import {
  readCachedPagination,
  writeCachedPagination
} from "@/lib/pagination-cache";
import { paginateBookByLayout, type ReaderPage } from "@/lib/pagination";
import { loadPinnedWords, setWordPinned } from "@/lib/pinned-words";
import { speakWord } from "@/lib/speech";
import { normalizeWord, tokenizeParagraph } from "@/lib/tokenize";

const ROW_MARKERS = [
  "⓪",
  "①",
  "②",
  "③",
  "④",
  "⑤",
  "⑥",
  "⑦",
  "⑧",
  "⑨",
  "⑩",
  "⑪",
  "⑫",
  "⑬",
  "⑭",
  "⑮",
  "⑯",
  "⑰",
  "⑱",
  "⑲",
  "⑳",
  "㉑",
  "㉒",
  "㉓",
  "㉔",
  "㉕",
  "㉖",
  "㉗",
  "㉘",
  "㉙",
  "㉚",
  "㉛",
  "㉜",
  "㉝",
  "㉞",
  "㉟",
  "㊱",
  "㊲",
  "㊳",
  "㊴",
  "㊵",
  "㊶",
  "㊷",
  "㊸",
  "㊹",
  "㊺",
  "㊻",
  "㊼",
  "㊽",
  "㊾",
  "㊿"
];

type LoadedBook = {
  data?: EpubBook;
  error?: string;
  loading: boolean;
};

type PaginatedBook = {
  pages: ReaderPage[];
  viewportKey: string;
};

type PageJump = {
  pageId: string;
  rowId: string;
  serial: number;
};

type BookMetadataEdit = {
  author: string;
  languageCode: string;
  title: string;
};

type FontFamily = "sans" | "serif";

type PersistedAppState = {
  activePageByRowId: Record<string, string>;
  activeRowId: string;
  animationsEnabled: boolean;
  autoPlayWordAudio: boolean;
  bookMetadataEdits: Record<string, BookMetadataEdit>;
  fontFamily: FontFamily;
  isDarkMode: boolean;
  openBookIds: string[];
  savedPageByBookId: Record<string, string>;
  version: 1;
};

const LIBRARY_BOOKS_PER_PAGE = 5;
const LONG_PRESS_MS = 550;
const MAX_OPEN_BOOKS = 5;
const LANGUAGE_CHOICES = [
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "es", flag: "🇪🇸", label: "Spanish" },
  { code: "fr", flag: "🇫🇷", label: "French" },
  { code: "it", flag: "🇮🇹", label: "Italian" },
  { code: "und", flag: "🌐", label: "Other" }
];

function App() {
  const [books, setBooks] = useState<BookSource[]>([]);
  const [booksError, setBooksError] = useState<string | null>(null);
  const [isBookCatalogLoaded, setIsBookCatalogLoaded] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploadingBooks, setIsUploadingBooks] = useState(false);
  const [isStateLoaded, setIsStateLoaded] = useState(false);
  const [isSyncingState, setIsSyncingState] = useState(false);
  const [defaultPersistedState] = useState(getDefaultPersistedAppState);
  const [animationsEnabled, setAnimationsEnabled] = useState(
    () => defaultPersistedState.animationsEnabled
  );
  const [isDarkMode, setIsDarkMode] = useState(
    () => defaultPersistedState.isDarkMode
  );
  const [fontFamily, setFontFamily] = useState<FontFamily>(
    () => defaultPersistedState.fontFamily
  );
  const [autoPlayWordAudio, setAutoPlayWordAudio] = useState(
    () => defaultPersistedState.autoPlayWordAudio
  );
  const [bookMetadataEdits, setBookMetadataEdits] = useState<
    Record<string, BookMetadataEdit>
  >(() => defaultPersistedState.bookMetadataEdits);
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [openBookIds, setOpenBookIds] = useState<string[]>(
    () => defaultPersistedState.openBookIds
  );
  const [loadedBooks, setLoadedBooks] = useState<Record<string, LoadedBook>>(
    {}
  );
  const [paginatedBooks, setPaginatedBooks] = useState<
    Record<string, PaginatedBook>
  >({});
  const [activePageByRowId, setActivePageByRowId] = useState<
    Record<string, string>
  >(() => defaultPersistedState.activePageByRowId);
  const [savedPageByBookId, setSavedPageByBookId] = useState<
    Record<string, string>
  >(() => defaultPersistedState.savedPageByBookId);
  const [activeRowId, setActiveRowId] = useState(
    () => defaultPersistedState.activeRowId
  );
  const [pageJump, setPageJump] = useState<PageJump | null>(null);
  const pageJumpSerial = useRef(0);
  const syncIndicatorTimer = useRef<number | null>(null);
  const [viewportKey, setViewportKey] = useState(() => getViewportKey());

  useEffect(() => {
    let cancelled = false;

    readPersistedAppState().then((persistedState) => {
      if (cancelled) return;

      setActivePageByRowId(persistedState.activePageByRowId);
      setActiveRowId(persistedState.activeRowId);
      setAnimationsEnabled(persistedState.animationsEnabled);
      setAutoPlayWordAudio(persistedState.autoPlayWordAudio);
      setBookMetadataEdits(persistedState.bookMetadataEdits);
      setFontFamily(persistedState.fontFamily);
      setIsDarkMode(persistedState.isDarkMode);
      setOpenBookIds(persistedState.openBookIds);
      setSavedPageByBookId(persistedState.savedPageByBookId);
      setIsStateLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    refreshBookCatalog()
      .then((books) => {
        if (cancelled) return;

        setBooks(books);
        setBooksError(null);
        setIsBookCatalogLoaded(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;

        setBooksError(
          error instanceof Error
            ? error.message
            : "Failed to load book catalog."
        );
        setIsBookCatalogLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isBookCatalogLoaded || books.length === 0) return;

    const knownBookIds = new Set(books.map((book) => book.id));

    setOpenBookIds((current) => {
      const next = current.filter((bookId) => knownBookIds.has(bookId));
      return arraysEqual(current, next) ? current : next;
    });
    setActiveRowId((current) =>
      current === "settings" || current === "library" || knownBookIds.has(current)
        ? current
        : "library"
    );
  }, [books, isBookCatalogLoaded]);

  useEffect(() => {
    if (!isStateLoaded) return;

    for (const book of books) {
      if (!openBookIds.includes(book.id) || loadedBooks[book.id]) continue;

      setLoadedBooks((current) => ({
        ...current,
        [book.id]: { loading: true }
      }));

      readBookData(book)
        .then((data) => loadEpubFromArrayBuffer(data))
        .then((data) => {
          setLoadedBooks((current) => ({
            ...current,
            [book.id]: { data, loading: false }
          }));
        })
        .catch((error: unknown) => {
          setLoadedBooks((current) => ({
            ...current,
            [book.id]: {
              error: error instanceof Error ? error.message : "Failed to load.",
              loading: false
            }
          }));
        });
    }
  }, [books, isStateLoaded, loadedBooks, openBookIds]);

  const uploadBooks = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setIsUploadingBooks(true);
    setUploadError(null);

    try {
      for (const file of files) {
        const data = await file.arrayBuffer();
        const metadata = await loadEpubFromArrayBuffer(data.slice(0));
        const fingerprint = fingerprintArrayBuffer(data);
        const title = metadata.title?.trim() || file.name.replace(/\.epub$/i, "");
        const author = metadata.author?.trim() || "Unknown";
        const now = Date.now();
        const id = `${slugify(title || file.name)}-${fingerprint.slice(0, 12)}`;

        await saveUploadedBook({
          book: {
            author,
            createdAt: now,
            fileName: file.name,
            fingerprint,
            id,
            language: metadata.language,
            size: file.size,
            storageKey: id,
            title,
            updatedAt: now
          },
          data
        });
      }

      setBooks(await refreshBookCatalog());
    } catch (error: unknown) {
      setUploadError(
        error instanceof Error ? error.message : "Failed to upload book."
      );
    } finally {
      setIsUploadingBooks(false);
    }
  }, []);

  useEffect(() => {
    const onResize = () => setViewportKey(getViewportKey());

    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  useEffect(() => {
    if (!isStateLoaded) return;

    if (syncIndicatorTimer.current) {
      window.clearTimeout(syncIndicatorTimer.current);
    }

    let cancelled = false;
    const nextState: PersistedAppState = {
      activePageByRowId,
      activeRowId,
      animationsEnabled,
      autoPlayWordAudio,
      bookMetadataEdits,
      fontFamily,
      isDarkMode,
      openBookIds,
      savedPageByBookId,
      version: 1
    };

    setIsSyncingState(true);
    writePersistedAppState(nextState).finally(() => {
      if (cancelled) return;

      syncIndicatorTimer.current = window.setTimeout(() => {
        setIsSyncingState(false);
        syncIndicatorTimer.current = null;
      }, 450);
    });

    return () => {
      cancelled = true;
    };
  }, [
    activePageByRowId,
    activeRowId,
    animationsEnabled,
    autoPlayWordAudio,
    bookMetadataEdits,
    fontFamily,
    isStateLoaded,
    isDarkMode,
    openBookIds,
    savedPageByBookId
  ]);

  useEffect(() => {
    return () => {
      if (syncIndicatorTimer.current) {
        window.clearTimeout(syncIndicatorTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isStateLoaded) return;

    let cancelled = false;

    async function paginateOpenBooks() {
      for (const book of books) {
        const loadedBook = loadedBooks[book.id];

        if (!openBookIds.includes(book.id) || !loadedBook?.data) continue;
        if (paginatedBooks[book.id]?.viewportKey === viewportKey) continue;

        const cachedPagination = await readCachedPagination(book, viewportKey);

        if (cachedPagination && !cancelled) {
          setPaginatedBooks((current) => ({
            ...current,
            [book.id]: {
              pages: cachedPagination.pages,
              viewportKey
            }
          }));
          continue;
        }

        await waitForIdle();
        const pages = await paginateBookByLayout(loadedBook.data);
        await writeCachedPagination(book, viewportKey, pages);

        if (!cancelled) {
          setPaginatedBooks((current) => ({
            ...current,
            [book.id]: { pages, viewportKey }
          }));
        }
      }
    }

    paginateOpenBooks();

    return () => {
      cancelled = true;
    };
  }, [books, isStateLoaded, loadedBooks, openBookIds, paginatedBooks, viewportKey]);

  const toggleBook = useCallback((bookId: string) => {
    window.setTimeout(() => {
      setOpenBookIds((current) => {
        if (current.includes(bookId)) {
          return current.filter((id) => id !== bookId);
        }

        if (current.length >= MAX_OPEN_BOOKS) {
          return [...current.slice(0, MAX_OPEN_BOOKS - 1), bookId];
        }

        return [...current, bookId];
      });
    }, 0);
  }, []);

  const jumpToBookPage = useCallback((bookId: string, pageId: string) => {
    pageJumpSerial.current += 1;

    setPageJump({
      pageId,
      rowId: bookId,
      serial: pageJumpSerial.current
    });
  }, []);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((current) => !current);
  }, []);

  const toggleAnimations = useCallback(() => {
    setAnimationsEnabled((current) => !current);
  }, []);

  const toggleFontFamily = useCallback(() => {
    setFontFamily((current) => (current === "serif" ? "sans" : "serif"));
  }, []);

  const toggleAutoPlayWordAudio = useCallback(() => {
    setAutoPlayWordAudio((current) => !current);
  }, []);

  const saveBookMetadata = useCallback(
    (bookId: string, metadata: BookMetadataEdit) => {
      setBookMetadataEdits((current) => ({
        ...current,
        [bookId]: metadata
      }));
      setEditingBookId(null);
    },
    []
  );

  const deleteBook = useCallback(async (book: BookSource) => {
    await deleteStoredBook(book);
    setBooks(await refreshBookCatalog());
    setEditingBookId(null);
    setOpenBookIds((current) => current.filter((bookId) => bookId !== book.id));
    setLoadedBooks((current) => omitRecordKey(current, book.id));
    setPaginatedBooks((current) => omitRecordKey(current, book.id));
    setBookMetadataEdits((current) => omitRecordKey(current, book.id));
    setSavedPageByBookId((current) => omitRecordKey(current, book.id));
    setActivePageByRowId((current) => omitRecordKey(current, book.id));
    setActiveRowId((current) => (current === book.id ? "library" : current));
  }, []);

  const editingBook = editingBookId
    ? books.find((book) => book.id === editingBookId)
    : undefined;
  const editingLoadedBook = editingBook
    ? loadedBooks[editingBook.id]
    : undefined;
  const editingMetadata = editingBook
    ? getBookMetadata(
        editingBook,
        editingLoadedBook,
        bookMetadataEdits[editingBook.id]
      )
    : undefined;
  const isBookLoading = openBookIds.some((bookId) => {
    const loadedBook = loadedBooks[bookId];

    return (
      !loadedBook ||
      loadedBook.loading ||
      Boolean(loadedBook.data && !paginatedBooks[bookId]?.pages.length)
    );
  });

  const rows = useMemo(
    () =>
      createArticleRows({
        animationsEnabled,
        autoPlayWordAudio,
        books,
        bookMetadataEdits,
        fontFamily,
        isDarkMode,
        isSyncingState,
        isUploadingBooks,
        loadedBooks,
        openBookIds,
        activePageByRowId,
        jumpToBookPage,
        openBookSettings: setEditingBookId,
        paginatedBooks,
        savedPageByBookId,
        toggleAnimations,
        toggleAutoPlayWordAudio,
        toggleDarkMode,
        toggleFontFamily,
        toggleBook,
        uploadError,
        uploadBooks
      }),
    [
      activePageByRowId,
      animationsEnabled,
      autoPlayWordAudio,
      books,
      bookMetadataEdits,
      fontFamily,
      isDarkMode,
      isSyncingState,
      isUploadingBooks,
      jumpToBookPage,
      loadedBooks,
      openBookIds,
      paginatedBooks,
      savedPageByBookId,
      toggleAnimations,
      toggleAutoPlayWordAudio,
      toggleDarkMode,
      toggleFontFamily,
      toggleBook,
      uploadError,
      uploadBooks
    ]
  );

  if (!isStateLoaded || !isBookCatalogLoaded) {
    return (
      <div className={getRootClassName(isDarkMode, fontFamily)}>
        <SyncingScreen animationsEnabled={animationsEnabled} />
      </div>
    );
  }

  if (booksError) {
    return (
      <div className={getRootClassName(isDarkMode, fontFamily)}>
        <CatalogErrorScreen error={booksError} />
      </div>
    );
  }

  return (
    <div className={getRootClassName(isDarkMode, fontFamily)}>
      <SwipeWorkspace
        animations={animationsEnabled}
        initialPageByRowId={activePageByRowId}
        initialRowId={activeRowId}
        onStateChange={({ activePageByRowId, activeRowId }) => {
          setActiveRowId(activeRowId);
          setActivePageByRowId((current) =>
            shallowEqualRecords(current, activePageByRowId)
              ? current
              : activePageByRowId
          );
          setSavedPageByBookId((current) => {
            const next = { ...current };

            for (const book of books) {
              const pageId = activePageByRowId[book.id];

              if (pageId && pageId !== "status") {
                next[book.id] = pageId;
              }
            }

            return shallowEqualRecords(current, next) ? current : next;
          });
        }}
        pageJump={pageJump}
        rows={rows}
      />
      {isBookLoading ? (
        <LoadingScreen
          animationsEnabled={animationsEnabled}
          label="Loading"
        />
      ) : null}
      {editingBook && editingMetadata ? (
        <BookMetadataDialog
          animationsEnabled={animationsEnabled}
          book={editingBook}
          metadata={editingMetadata}
          onClose={() => setEditingBookId(null)}
          onDelete={deleteBook}
          onSave={saveBookMetadata}
        />
      ) : null}
    </div>
  );
}

function createArticleRows({
  activePageByRowId,
  animationsEnabled,
  autoPlayWordAudio,
  books,
  bookMetadataEdits,
  fontFamily,
  isDarkMode,
  isSyncingState,
  isUploadingBooks,
  jumpToBookPage,
  loadedBooks,
  openBookIds,
  openBookSettings,
  paginatedBooks,
  savedPageByBookId,
  toggleAnimations,
  toggleAutoPlayWordAudio,
  toggleDarkMode,
  toggleFontFamily,
  toggleBook,
  uploadError,
  uploadBooks
}: {
  activePageByRowId: Record<string, string>;
  animationsEnabled: boolean;
  autoPlayWordAudio: boolean;
  books: BookSource[];
  bookMetadataEdits: Record<string, BookMetadataEdit>;
  fontFamily: FontFamily;
  isDarkMode: boolean;
  isSyncingState: boolean;
  isUploadingBooks: boolean;
  jumpToBookPage: (bookId: string, pageId: string) => void;
  loadedBooks: Record<string, LoadedBook>;
  openBookIds: string[];
  openBookSettings: (bookId: string) => void;
  paginatedBooks: Record<string, PaginatedBook>;
  savedPageByBookId: Record<string, string>;
  toggleAnimations: () => void;
  toggleAutoPlayWordAudio: () => void;
  toggleDarkMode: () => void;
  toggleFontFamily: () => void;
  toggleBook: (bookId: string) => void;
  uploadError: string | null;
  uploadBooks: (files: File[]) => Promise<void>;
}): WorkspaceRow[] {
  return [
    {
      id: "settings",
      pages: [
        {
          id: "main",
          render: () => (
            <SettingsScreen
              animationsEnabled={animationsEnabled}
              autoPlayWordAudio={autoPlayWordAudio}
              fontFamily={fontFamily}
              isDarkMode={isDarkMode}
              toggleAnimations={toggleAnimations}
              toggleAutoPlayWordAudio={toggleAutoPlayWordAudio}
              toggleDarkMode={toggleDarkMode}
              toggleFontFamily={toggleFontFamily}
            />
          )
        }
      ]
    },
    {
      id: "library",
      initialPageId: "books-1",
      pages: [
        {
          id: "upload",
          render: () => (
            <UploadBookScreen
              uploadBooks={uploadBooks}
              uploadError={uploadError}
              uploading={isUploadingBooks}
            />
          )
        },
        ...chunkBooks(books, LIBRARY_BOOKS_PER_PAGE, { keepEmpty: true }).map(
          (books, index, pages) => ({
            id: `books-${index + 1}`,
            render: () => (
              <LibraryScreen
                books={books}
                pageNumber={index + 1}
                pageTotal={pages.length}
                activePageByRowId={activePageByRowId}
                bookMetadataEdits={bookMetadataEdits}
                loadedBooks={loadedBooks}
                openBookSettings={openBookSettings}
                openBookIds={openBookIds}
                paginatedBooks={paginatedBooks}
                savedPageByBookId={savedPageByBookId}
                toggleBook={toggleBook}
              />
            )
          })
        )
      ]
    },
    ...openBookIds
      .map((bookId) => books.find((book) => book.id === bookId))
      .filter((book): book is BookSource => Boolean(book))
      .map((book) =>
        createBookRow(
          book,
          bookMetadataEdits[book.id],
          isSyncingState,
          loadedBooks[book.id],
          paginatedBooks[book.id]?.pages,
          savedPageByBookId[book.id],
          jumpToBookPage,
          autoPlayWordAudio
        )
      )
  ];
}

function createBookRow(
  book: BookSource,
  metadataEdit?: BookMetadataEdit,
  isSyncingState?: boolean,
  loadedBook?: LoadedBook,
  pages?: ReaderPage[],
  savedPageId?: string,
  jumpToBookPage?: (bookId: string, pageId: string) => void,
  autoPlayWordAudio?: boolean
): WorkspaceRow {
  const metadata = getBookMetadata(book, loadedBook, metadataEdit);

  if (pages?.length) {
    return {
      id: book.id,
      initialPageId: savedPageId,
      pages: pages.map((page, index) => ({
        id: page.id,
        render: () => (
          <ReaderScreen
            author={metadata.author}
            autoPlayWordAudio={Boolean(autoPlayWordAudio)}
            isSyncingState={Boolean(isSyncingState)}
            languageCode={metadata.languageCode}
            pageNumber={index + 1}
            pageTotal={pages.length}
            chapterTitle={page.chapterTitle}
            onPageChange={(pageNumber) => {
              const nextPage = pages[pageNumber - 1];

              if (nextPage) {
                jumpToBookPage?.(book.id, nextPage.id);
              }
            }}
            paragraphs={page.paragraphs}
            title={metadata.title}
          />
        )
      }))
    };
  }

  return {
    id: book.id,
    pages: [
      {
        id: "status",
        render: () => (
          <BookStatusScreen
            error={loadedBook?.error}
            languageCode={metadata.languageCode}
            loading={!loadedBook?.data && (loadedBook?.loading ?? true)}
            paginating={Boolean(loadedBook?.data)}
            title={metadata.title}
          />
        )
      }
    ]
  };
}

function SettingsScreen({
  animationsEnabled,
  autoPlayWordAudio,
  fontFamily,
  isDarkMode,
  toggleAnimations,
  toggleAutoPlayWordAudio,
  toggleDarkMode,
  toggleFontFamily
}: {
  animationsEnabled: boolean;
  autoPlayWordAudio: boolean;
  fontFamily: FontFamily;
  isDarkMode: boolean;
  toggleAnimations: () => void;
  toggleAutoPlayWordAudio: () => void;
  toggleDarkMode: () => void;
  toggleFontFamily: () => void;
}) {
  return (
    <div className="flex min-h-full items-center px-5 py-8 text-neutral-950 dark:text-neutral-100 sm:px-10 sm:py-12">
      <div className="mx-auto w-full max-w-3xl text-center">
        <fieldset className="mx-auto max-w-md border border-neutral-300 px-6 pb-7 pt-5 dark:border-neutral-700">
          <legend className="mx-auto px-3 text-neutral-500 dark:text-neutral-400">
            <SpinningCog
              animationsEnabled={animationsEnabled}
              label="Spin settings icon"
            />
          </legend>

          <div className="space-y-4">
            <button
              aria-pressed={isDarkMode}
              className="mx-auto block text-lg leading-tight text-neutral-950 outline-none focus-visible:text-neutral-500 dark:text-neutral-100 dark:focus-visible:text-neutral-400"
              onClick={toggleDarkMode}
              type="button"
            >
              Dark mode {isDarkMode ? "on" : "off"}
            </button>

            <button
              aria-pressed={animationsEnabled}
              className="mx-auto block text-lg leading-tight text-neutral-950 outline-none focus-visible:text-neutral-500 dark:text-neutral-100 dark:focus-visible:text-neutral-400"
              onClick={toggleAnimations}
              type="button"
            >
              Animations {animationsEnabled ? "on" : "off"}
            </button>

            <button
              aria-pressed={fontFamily === "sans"}
              className="mx-auto block text-lg leading-tight text-neutral-950 outline-none focus-visible:text-neutral-500 dark:text-neutral-100 dark:focus-visible:text-neutral-400"
              onClick={toggleFontFamily}
              type="button"
            >
              Font {fontFamily === "serif" ? "serif" : "sans-serif"}
            </button>

            <button
              aria-pressed={autoPlayWordAudio}
              className="mx-auto block text-lg leading-tight text-neutral-950 outline-none focus-visible:text-neutral-500 dark:text-neutral-100 dark:focus-visible:text-neutral-400"
              onClick={toggleAutoPlayWordAudio}
              type="button"
            >
              Word audio auto-play {autoPlayWordAudio ? "on" : "off"}
            </button>
          </div>
        </fieldset>
      </div>
    </div>
  );
}

function SyncingScreen({
  animationsEnabled
}: {
  animationsEnabled: boolean;
}) {
  return (
    <LoadingScreen animationsEnabled={animationsEnabled} label="Syncing" />
  );
}

function LoadingScreen({
  animationsEnabled,
  label
}: {
  animationsEnabled: boolean;
  label: string;
}) {
  return (
    <main
      aria-busy="true"
      aria-label={label}
      className="fixed inset-0 z-40 flex h-dvh w-screen items-center justify-center bg-white px-6 text-center text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100"
    >
      <span
        aria-hidden="true"
        className={`text-4xl grayscale ${
          animationsEnabled ? "loading-book-spin" : ""
        }`}
      >
        📖
      </span>
      <span className="sr-only">{label}</span>
    </main>
  );
}

function CatalogErrorScreen({ error }: { error: string }) {
  return (
    <main className="flex h-dvh w-screen items-center justify-center bg-white px-6 text-center text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100">
      <div>
        <p className="text-sm uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
          Library unavailable
        </p>
        <p className="mt-3 max-w-md text-lg text-neutral-600 dark:text-neutral-400">
          {error}
        </p>
      </div>
    </main>
  );
}

function SpinningCog({
  animationsEnabled,
  label
}: {
  animationsEnabled: boolean;
  label: string;
}) {
  const [spinCount, setSpinCount] = useState(0);

  return (
    <button
      aria-label={label}
      className="inline-grid h-10 w-10 place-items-center text-neutral-500 outline-none focus-visible:text-neutral-950 dark:text-neutral-400 dark:focus-visible:text-neutral-100"
      onClick={() => {
        if (animationsEnabled) {
          setSpinCount((current) => current + 1);
        }
      }}
      type="button"
    >
      <Settings
        aria-hidden="true"
        className={`h-7 w-7 ${
          animationsEnabled && spinCount > 0 ? "cog-spin-once" : ""
        }`}
        key={spinCount}
        strokeWidth={1.75}
      />
    </button>
  );
}

function BookMetadataDialog({
  animationsEnabled,
  book,
  metadata,
  onClose,
  onDelete,
  onSave
}: {
  animationsEnabled: boolean;
  book: BookSource;
  metadata: BookMetadataEdit;
  onClose: () => void;
  onDelete: (book: BookSource) => Promise<void>;
  onSave: (bookId: string, metadata: BookMetadataEdit) => void;
}) {
  const [author, setAuthor] = useState(metadata.author);
  const [isDeleting, setIsDeleting] = useState(false);
  const [languageCode, setLanguageCode] = useState(
    getSupportedLanguageCode(metadata.languageCode)
  );
  const [title, setTitle] = useState(metadata.title);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    onSave(book.id, {
      author: author.trim(),
      languageCode: getSupportedLanguageCode(languageCode),
      title: title.trim()
    });
  };

  const handleDelete = () => {
    setIsDeleting(true);
    onDelete(book).catch(() => {
      setIsDeleting(false);
    });
  };

  return (
    <div
      aria-labelledby="book-metadata-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-white/75 px-5 text-neutral-950 backdrop-blur-sm dark:bg-neutral-950/75 dark:text-neutral-100"
      onClick={onClose}
      role="dialog"
    >
      <form
        className="w-full max-w-md border border-neutral-300 bg-white px-6 py-6 shadow-sm dark:border-neutral-700 dark:bg-neutral-950"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2
          className="flex justify-center text-neutral-500 dark:text-neutral-400"
          id="book-metadata-title"
        >
          <SpinningCog
            animationsEnabled={animationsEnabled}
            label="Spin book settings icon"
          />
          <span className="sr-only">Book settings</span>
        </h2>

        <div className="mt-6 space-y-5 text-left">
          <label className="block">
            <span className="block text-sm text-neutral-500 dark:text-neutral-400">
              Title
            </span>
            <input
              className="mt-1 w-full border-b border-neutral-300 bg-transparent py-1 text-lg outline-none focus:border-neutral-950 dark:border-neutral-700 dark:focus:border-neutral-100"
              onChange={(event) => setTitle(event.target.value)}
              required
              type="text"
              value={title}
            />
          </label>

          <label className="block">
            <span className="block text-sm text-neutral-500 dark:text-neutral-400">
              Author
            </span>
            <input
              className="mt-1 w-full border-b border-neutral-300 bg-transparent py-1 text-lg outline-none focus:border-neutral-950 dark:border-neutral-700 dark:focus:border-neutral-100"
              onChange={(event) => setAuthor(event.target.value)}
              required
              type="text"
              value={author}
            />
          </label>

          <label className="block">
            <span className="block text-sm text-neutral-500 dark:text-neutral-400">
              Language
            </span>
            <div
              aria-label="Book language"
              className="mt-3 flex justify-center gap-3"
              role="radiogroup"
            >
              {LANGUAGE_CHOICES.map((language) => {
                const isSelected = language.code === languageCode;

                return (
                  <button
                    aria-checked={isSelected}
                    aria-label={language.label}
                    className={`grid h-12 w-12 place-items-center border text-2xl outline-none transition-colors ${
                      isSelected
                        ? "border-neutral-950 bg-neutral-950/5 dark:border-neutral-100 dark:bg-neutral-100/10"
                        : "border-neutral-300 dark:border-neutral-700"
                    } focus-visible:border-neutral-950 dark:focus-visible:border-neutral-100`}
                    key={language.code}
                    onClick={() => setLanguageCode(language.code)}
                    role="radio"
                    type="button"
                  >
                    <span aria-hidden="true">{language.flag}</span>
                  </button>
                );
              })}
            </div>
          </label>
        </div>

        <div className="mt-7 flex justify-center gap-6">
          <button
            className="text-base text-neutral-500 outline-none focus-visible:text-neutral-950 disabled:opacity-50 dark:text-neutral-400 dark:focus-visible:text-neutral-100"
            disabled={isDeleting}
            onClick={handleDelete}
            type="button"
          >
            {isDeleting ? "Deleting" : "Delete"}
          </button>
          <button
            className="text-base text-neutral-500 outline-none focus-visible:text-neutral-950 dark:text-neutral-400 dark:focus-visible:text-neutral-100"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="text-base text-neutral-950 outline-none focus-visible:text-neutral-500 dark:text-neutral-100 dark:focus-visible:text-neutral-400"
            disabled={isDeleting}
            type="submit"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

function UploadBookScreen({
  uploadBooks,
  uploadError,
  uploading
}: {
  uploadBooks: (files: File[]) => Promise<void>;
  uploadError: string | null;
  uploading: boolean;
}) {
  return (
    <div className="flex min-h-full items-center px-5 py-8 text-neutral-950 dark:text-neutral-100 sm:px-10 sm:py-12">
      <div className="mx-auto w-full max-w-3xl text-center">
        <label className="inline-block cursor-pointer text-3xl leading-tight text-neutral-950 outline-none focus-within:text-neutral-500 dark:text-neutral-100 dark:focus-within:text-neutral-400 sm:text-5xl">
          <span>{uploading ? "Importing" : "Upload book"}</span>
          <input
            accept=".epub,application/epub+zip"
            className="sr-only"
            disabled={uploading}
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void uploadBooks(files);
            }}
            type="file"
          />
        </label>
        {uploadError ? (
          <p className="mx-auto mt-5 max-w-md text-base text-neutral-500 dark:text-neutral-400">
            {uploadError}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function LibraryScreen({
  activePageByRowId,
  bookMetadataEdits,
  books,
  loadedBooks,
  openBookSettings,
  openBookIds,
  pageNumber,
  pageTotal,
  paginatedBooks,
  savedPageByBookId,
  toggleBook
}: {
  activePageByRowId: Record<string, string>;
  bookMetadataEdits: Record<string, BookMetadataEdit>;
  books: BookSource[];
  loadedBooks: Record<string, LoadedBook>;
  openBookSettings: (bookId: string) => void;
  openBookIds: string[];
  pageNumber: number;
  pageTotal: number;
  paginatedBooks: Record<string, PaginatedBook>;
  savedPageByBookId: Record<string, string>;
  toggleBook: (bookId: string) => void;
}) {
  const contentsProgress =
    pageTotal > 1 ? ((pageNumber - 1) / (pageTotal - 1)) * 100 : 0;
  const longPressTimer = useRef<number | null>(null);
  const suppressNextToggle = useRef(false);

  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        window.clearTimeout(longPressTimer.current);
      }
    };
  }, []);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const startLongPress = (
    bookId: string,
    event: PointerEvent<HTMLElement>
  ) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    clearLongPress();
    suppressNextToggle.current = false;
    longPressTimer.current = window.setTimeout(() => {
      suppressNextToggle.current = true;
      openBookSettings(bookId);
      longPressTimer.current = null;
    }, LONG_PRESS_MS);
  };

  const handleBookClick = (
    bookId: string,
    event: MouseEvent<HTMLButtonElement>
  ) => {
    clearLongPress();

    if (suppressNextToggle.current) {
      suppressNextToggle.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    toggleBook(bookId);
  };

  return (
    <div className="flex min-h-full items-center px-5 py-8 text-neutral-950 dark:text-neutral-100 sm:px-10 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-4 border-neutral-300 pb-2 text-center sm:mb-6 sm:pb-4">
          <h1 className="mt-4 font-['Cormorant_Unicase'] text-4xl font-bold leading-tight sm:text-6xl">
            Contents
          </h1>
          <span
            aria-label={`Contents page ${pageNumber} of ${pageTotal}`}
            className="mx-auto mt-4 block h-0.5 w-full max-w-md overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
            role="meter"
            aria-valuemax={pageTotal}
            aria-valuemin={1}
            aria-valuenow={pageNumber}
          >
            <span
              aria-hidden="true"
              className="block h-full rounded-full bg-neutral-950 dark:bg-neutral-100"
              style={{ width: `${contentsProgress}%` }}
            />
          </span>
        </header>

        <ol>
          {books.length === 0 ? (
            <li className="py-8 text-center text-lg text-neutral-500 dark:text-neutral-400">
              No books yet
            </li>
          ) : null}
          {books.map((book) => {
            const isOpen = openBookIds.includes(book.id);
            const loadedBook = loadedBooks[book.id];
            const metadata = getBookMetadata(
              book,
              loadedBook,
              bookMetadataEdits[book.id]
            );
            const pages = paginatedBooks[book.id]?.pages ?? [];
            const activePageId =
              activePageByRowId[book.id] ?? savedPageByBookId[book.id];
            const activePageIndex = Math.max(
              -1,
              pages.findIndex((page) => page.id === activePageId)
            );
            const progress = pages.length
              ? ((activePageId && activePageIndex >= 0
                  ? activePageIndex + 1
                  : 0) /
                  pages.length) *
                100
              : 0;
            const rowNumber = openBookIds.indexOf(book.id) + 1;

            return (
              <li className="py-3 sm:py-4" key={book.id}>
                <button
                  aria-pressed={isOpen}
                  className="block w-full px-2 text-center outline-none focus-visible:text-neutral-500 dark:focus-visible:text-neutral-400"
                  onClick={(event) => handleBookClick(book.id, event)}
                  type="button"
                >
                  <span
                    className="block text-xl leading-tight min-[390px]:text-2xl"
                    onContextMenu={(event) => {
                      event.preventDefault();
                      clearLongPress();
                      suppressNextToggle.current = true;
                      openBookSettings(book.id);
                    }}
                    onPointerCancel={clearLongPress}
                    onPointerDown={(event) => startLongPress(book.id, event)}
                    onPointerLeave={clearLongPress}
                    onPointerUp={clearLongPress}
                  >
                    {metadata.title}
                    <span
                      aria-hidden={!isOpen}
                      className={`ml-2 inline-block w-8 text-left text-neutral-500 dark:text-neutral-400 ${
                        isOpen ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      {isOpen ? ROW_MARKERS[rowNumber] : ROW_MARKERS[0]}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm text-neutral-600 dark:text-neutral-400 min-[390px]:text-base">
                    {metadata.author}
                  </span>
                  <span
                    aria-hidden="true"
                    className="mx-auto mt-3 block h-0.5 w-full max-w-md overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
                  >
                    <span
                      className="block h-full rounded-full bg-neutral-950 dark:bg-neutral-100"
                      style={{ width: `${progress}%` }}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function ReaderScreen({
  author,
  autoPlayWordAudio,
  chapterTitle,
  isSyncingState,
  languageCode,
  onPageChange,
  paragraphs,
  pageNumber,
  pageTotal,
  title
}: {
  author: string;
  autoPlayWordAudio: boolean;
  chapterTitle?: string;
  isSyncingState: boolean;
  languageCode: string;
  onPageChange: (pageNumber: number) => void;
  pageNumber: number;
  pageTotal: number;
  paragraphs: string[];
  title: string;
}) {
  const [pageDraft, setPageDraft] = useState(String(pageNumber));
  const [pinnedWords, setPinnedWords] = useState<Set<string>>(new Set());
  const [lookup, setLookup] = useState<WordLookupState | null>(null);

  useEffect(() => {
    setPageDraft(String(pageNumber));
  }, [pageNumber]);

  useEffect(() => {
    let cancelled = false;

    loadPinnedWords(languageCode).then((words) => {
      if (!cancelled) setPinnedWords(words);
    });

    return () => {
      cancelled = true;
    };
  }, [languageCode]);

  const handleWordClick = (
    event: MouseEvent<HTMLButtonElement>,
    rawWord: string
  ) => {
    const word = normalizeWord(rawWord);
    const anchorRect = event.currentTarget.getBoundingClientRect();

    if (autoPlayWordAudio) {
      speakWord(word, languageCode);
    }

    setLookup({
      anchorRect,
      languageCode,
      pinned: pinnedWords.has(word),
      status: "loading",
      word
    });

    lookupWord(word, languageCode)
      .then((result) => {
        setLookup((current) =>
          current && current.word === word
            ? { ...current, result, status: "ready" }
            : current
        );
      })
      .catch((error: unknown) => {
        setLookup((current) =>
          current && current.word === word
            ? {
                ...current,
                error: error instanceof Error ? error.message : "Lookup failed.",
                status: "error"
              }
            : current
        );
      });
  };

  const handleTogglePin = () => {
    if (!lookup) return;

    const nextPinned = !lookup.pinned;
    const { word } = lookup;

    setLookup({ ...lookup, pinned: nextPinned });
    setPinnedWords((current) => {
      const next = new Set(current);

      if (nextPinned) {
        next.add(word);
      } else {
        next.delete(word);
      }

      return next;
    });

    setWordPinned(languageCode, word, nextPinned).catch(() => {});
  };

  const commitPageDraft = () => {
    const parsedPage = Number.parseInt(pageDraft, 10);
    const nextPage = clampNumber(
      Number.isFinite(parsedPage) ? parsedPage : pageNumber,
      1,
      pageTotal
    );

    setPageDraft(String(nextPage));

    if (nextPage !== pageNumber) {
      onPageChange(nextPage);
    }
  };

  return (
    <article
      className="grid h-full grid-rows-[auto_1fr] overflow-hidden px-5 py-5 text-neutral-950 dark:text-neutral-100 sm:px-10 sm:py-7"
      lang={languageCode}
    >
      <header className="mx-auto flex w-full max-w-3xl min-w-0 items-baseline justify-between gap-4 border-neutral-200 pb-3 text-sm text-neutral-500 dark:text-neutral-400">
        <div className="min-w-0 overflow-hidden">
          <span className="truncate">{title}</span>
          <span className="mx-2">⋅</span>
          <span className="truncate">{author}</span>
        </div>
        <label className="flex shrink-0 items-baseline gap-1 text-neutral-500">
          <span className="sr-only">Page</span>
          <input
            aria-label={`Page, 1 through ${pageTotal}`}
            className="w-12 appearance-none bg-transparent text-right text-base text-neutral-950 outline-none [font-variant-numeric:tabular-nums] focus-visible:underline dark:text-neutral-100"
            inputMode="numeric"
            max={pageTotal}
            min={1}
            onBlur={commitPageDraft}
            onChange={(event) => setPageDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            type="number"
            value={pageDraft}
          />
          <span>/ {pageTotal}</span>
        </label>
        <span
          aria-label={isSyncingState ? "Syncing progress" : undefined}
          className={`fixed right-3 top-3 z-30 h-1.5 w-1.5 rounded-full bg-neutral-950 transition-opacity duration-500 dark:bg-neutral-100 sm:right-5 sm:top-5 ${
            isSyncingState
              ? "animate-pulse opacity-40"
              : "pointer-events-none opacity-0"
          }`}
        />
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-3xl min-w-0 flex-col justify-start overflow-hidden py-5 sm:py-8">
        <div className="reader-page-content">
          {chapterTitle ? (
            <div className="reader-chapter-heading">{chapterTitle}</div>
          ) : null}
          <div className="reader-page-body">
            {paragraphs.map((paragraph, paragraphIndex) => (
              <p key={`${pageNumber}-${paragraphIndex}`}>
                {tokenizeParagraph(paragraph).map((token, tokenIndex) =>
                  token.type === "word" ? (
                    <button
                      className={
                        pinnedWords.has(normalizeWord(token.value))
                          ? "reader-word reader-word--pinned"
                          : "reader-word"
                      }
                      key={tokenIndex}
                      onClick={(event) => handleWordClick(event, token.value)}
                      type="button"
                    >
                      {token.value}
                    </button>
                  ) : (
                    <span key={tokenIndex}>{token.value}</span>
                  )
                )}
              </p>
            ))}
          </div>
        </div>
      </div>

      {lookup ? (
        <WordLookupPopup
          lookup={lookup}
          onDismiss={() => setLookup(null)}
          onTogglePin={handleTogglePin}
        />
      ) : null}
    </article>
  );
}

function BookStatusScreen({
  error,
  languageCode,
  loading,
  paginating,
  title
}: {
  error?: string;
  languageCode: string;
  loading: boolean;
  paginating: boolean;
  title: string;
}) {
  return (
    <div
      className="flex h-full w-full items-center justify-center px-6 text-center text-neutral-950 dark:text-neutral-100"
      lang={languageCode}
    >
      <div>
        <p className="text-sm uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
          {paginating ? "Paginating" : loading ? "Loading" : "Unavailable"}
        </p>
        <h1 className="mt-3 text-4xl font-semibold">
          {title}
        </h1>
        <p className="mt-3 text-lg text-neutral-600 dark:text-neutral-400">
          {error ?? "Preparing measured pages."}
        </p>
      </div>
    </div>
  );
}

function getDefaultPersistedAppState(): PersistedAppState {
  return {
    activePageByRowId: {
      library: "books-1",
      settings: "main"
    },
    activeRowId: "library",
    animationsEnabled: true,
    autoPlayWordAudio: false,
    bookMetadataEdits: {},
    fontFamily: "serif",
    isDarkMode: false,
    openBookIds: [],
    savedPageByBookId: {},
    version: 1
  };
}

async function refreshBookCatalog() {
  return loadBookCatalog();
}

function fingerprintArrayBuffer(data: ArrayBuffer) {
  const bytes = new Uint8Array(data);
  let hashA = 0x811c9dc5;
  let hashB = 0x811c9dc5 ^ 0xffffffff;

  for (const byte of bytes) {
    hashA = Math.imul(hashA ^ byte, 0x01000193);
    hashB = Math.imul(hashB ^ byte, 0x01000193);
  }

  return (
    (hashA >>> 0).toString(16).padStart(8, "0") +
    (hashB >>> 0).toString(16).padStart(8, "0")
  );
}

function slugify(input: string) {
  return (
    input
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\.epub$/i, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "book"
  );
}

async function readPersistedAppState(): Promise<PersistedAppState> {
  if (typeof window === "undefined") {
    return getDefaultPersistedAppState();
  }

  try {
    const storedState = await readStoredAppState();

    if (!isRecord(storedState) || storedState.version !== 1) {
      return getDefaultPersistedAppState();
    }

    return normalizePersistedAppState(storedState);
  } catch {
    return getDefaultPersistedAppState();
  }
}

async function writePersistedAppState(state: PersistedAppState) {
  if (typeof window === "undefined") return;

  try {
    await writeStoredAppState(state);
  } catch {
    // Persisting app state is best-effort; the in-memory app should keep working.
  }
}

function normalizePersistedAppState(
  state: Record<string, unknown>
): PersistedAppState {
  const defaultState = getDefaultPersistedAppState();
  const activePageByRowId = getStringRecord(state.activePageByRowId);
  const savedPageByBookId = getStringRecord(state.savedPageByBookId);
  const openBookIds = getPersistedOpenBookIds(state.openBookIds);
  const bookMetadataEdits = getPersistedBookMetadataEdits(
    state.bookMetadataEdits
  );
  const activeRowId =
    typeof state.activeRowId === "string" &&
    isKnownWorkspaceRowId(state.activeRowId, openBookIds)
      ? state.activeRowId
      : defaultState.activeRowId;

  return {
    activePageByRowId: {
      ...defaultState.activePageByRowId,
      ...activePageByRowId
    },
    activeRowId,
    animationsEnabled:
      typeof state.animationsEnabled === "boolean"
        ? state.animationsEnabled
        : defaultState.animationsEnabled,
    autoPlayWordAudio:
      typeof state.autoPlayWordAudio === "boolean"
        ? state.autoPlayWordAudio
        : defaultState.autoPlayWordAudio,
    bookMetadataEdits,
    fontFamily:
      state.fontFamily === "sans" || state.fontFamily === "serif"
        ? state.fontFamily
        : defaultState.fontFamily,
    isDarkMode:
      typeof state.isDarkMode === "boolean"
        ? state.isDarkMode
        : defaultState.isDarkMode,
    openBookIds,
    savedPageByBookId,
    version: 1
  };
}

function getPersistedOpenBookIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  const openBookIds: string[] = [];

  for (const bookId of value) {
    if (
      typeof bookId === "string" &&
      !openBookIds.includes(bookId)
    ) {
      openBookIds.push(bookId);
    }
  }

  return openBookIds.slice(0, MAX_OPEN_BOOKS);
}

function getPersistedBookMetadataEdits(value: unknown) {
  if (!isRecord(value)) return {};

  const edits: Record<string, BookMetadataEdit> = {};

  for (const [bookId, metadata] of Object.entries(value)) {
    if (!isRecord(metadata)) continue;

    const title = metadata.title;
    const author = metadata.author;
    const languageCode = metadata.languageCode;

    if (
      typeof title === "string" &&
      typeof author === "string" &&
      typeof languageCode === "string"
    ) {
      edits[bookId] = {
        author,
        languageCode: getSupportedLanguageCode(languageCode),
        title
      };
    }
  }

  return edits;
}

function getStringRecord(value: unknown) {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

function isKnownWorkspaceRowId(rowId: string, openBookIds: string[]) {
  return rowId === "settings" || rowId === "library" || openBookIds.includes(rowId);
}

function arraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function omitRecordKey<Value>(
  record: Record<string, Value>,
  keyToOmit: string
) {
  if (!(keyToOmit in record)) return record;

  const { [keyToOmit]: _omitted, ...next } = record;
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getBookMetadata(
  book: BookSource,
  loadedBook?: LoadedBook,
  metadataEdit?: BookMetadataEdit
): BookMetadataEdit {
  return {
    author:
      metadataEdit?.author.trim() ||
      loadedBook?.data?.author?.trim() ||
      book.author,
    languageCode: normalizeLanguageCode(
      metadataEdit?.languageCode.trim() ||
        loadedBook?.data?.language ||
        book.language ||
        "und"
    ),
    title:
      metadataEdit?.title.trim() || loadedBook?.data?.title?.trim() || book.title
  };
}

function normalizeLanguageCode(languageCode: string) {
  return languageCode.trim().toLowerCase() || "und";
}

function getSupportedLanguageCode(languageCode: string) {
  const normalizedLanguageCode = normalizeLanguageCode(languageCode);

  return LANGUAGE_CHOICES.some(
    (language) => language.code === normalizedLanguageCode
  )
    ? normalizedLanguageCode
    : "und";
}

function getViewportKey() {
  return `${window.innerWidth}x${window.innerHeight}`;
}

function waitForIdle() {
  return new Promise<void>((resolve) => {
    const requestIdleCallback = window.requestIdleCallback;

    if (requestIdleCallback) {
      requestIdleCallback(() => resolve(), { timeout: 500 });
      return;
    }

    globalThis.setTimeout(resolve, 0);
  });
}

function chunkBooks(
  books: BookSource[],
  size: number,
  options: { keepEmpty?: boolean } = {}
) {
  const chunks: BookSource[][] = [];

  for (let index = 0; index < books.length; index += size) {
    chunks.push(books.slice(index, index + size));
  }

  if (options.keepEmpty && chunks.length === 0) {
    chunks.push([]);
  }

  return chunks;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getRootClassName(isDarkMode: boolean, fontFamily: FontFamily) {
  return [
    isDarkMode ? "dark" : "",
    fontFamily === "sans" ? "sans-serif-font" : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function shallowEqualRecords(
  left: Record<string, string>,
  right: Record<string, string>
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((key) => left[key] === right[key]);
}

export default App;
