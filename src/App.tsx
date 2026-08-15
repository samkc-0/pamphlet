import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, MouseEvent, PointerEvent } from "react";
import { Settings } from "lucide-react";

import { BOOKS, type BookSource } from "@/books";
import {
  SwipeWorkspace,
  type WorkspaceRow
} from "@/components/swipe-workspace";
import { loadEpub, type EpubBook } from "@/lib/epub";
import { paginateBookByLayout, type ReaderPage } from "@/lib/pagination";

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

type PersistedAppState = {
  activePageByRowId: Record<string, string>;
  activeRowId: string;
  animationsEnabled: boolean;
  bookMetadataEdits: Record<string, BookMetadataEdit>;
  isDarkMode: boolean;
  openBookIds: string[];
  savedPageByBookId: Record<string, string>;
  version: 1;
};

const APP_STATE_STORAGE_KEY = "pamphlet:app-state";
const LIBRARY_BOOKS_PER_PAGE = 5;
const LONG_PRESS_MS = 550;
const MAX_OPEN_BOOKS = 5;
const LANGUAGE_CHOICES = [
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "es", flag: "🇪🇸", label: "Spanish" },
  { code: "it", flag: "🇮🇹", label: "Italian" }
];

function App() {
  const [isStateLoaded, setIsStateLoaded] = useState(false);
  const [isSyncingState, setIsSyncingState] = useState(false);
  const [defaultPersistedState] = useState(getDefaultPersistedAppState);
  const [animationsEnabled, setAnimationsEnabled] = useState(
    () => defaultPersistedState.animationsEnabled
  );
  const [isDarkMode, setIsDarkMode] = useState(
    () => defaultPersistedState.isDarkMode
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
    const persistedState = readPersistedAppState();

    setActivePageByRowId(persistedState.activePageByRowId);
    setActiveRowId(persistedState.activeRowId);
    setAnimationsEnabled(persistedState.animationsEnabled);
    setBookMetadataEdits(persistedState.bookMetadataEdits);
    setIsDarkMode(persistedState.isDarkMode);
    setOpenBookIds(persistedState.openBookIds);
    setSavedPageByBookId(persistedState.savedPageByBookId);
    setIsStateLoaded(true);
  }, []);

  useEffect(() => {
    if (!isStateLoaded) return;

    for (const book of BOOKS) {
      if (!openBookIds.includes(book.id) || loadedBooks[book.id]) continue;

      setLoadedBooks((current) => ({
        ...current,
        [book.id]: { loading: true }
      }));

      loadEpub(book.url)
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
  }, [isStateLoaded, loadedBooks, openBookIds]);

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

    setIsSyncingState(true);
    writePersistedAppState({
      activePageByRowId,
      activeRowId,
      animationsEnabled,
      bookMetadataEdits,
      isDarkMode,
      openBookIds,
      savedPageByBookId,
      version: 1
    });
    syncIndicatorTimer.current = window.setTimeout(() => {
      setIsSyncingState(false);
      syncIndicatorTimer.current = null;
    }, 450);
  }, [
    activePageByRowId,
    activeRowId,
    animationsEnabled,
    bookMetadataEdits,
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
      for (const book of BOOKS) {
        const loadedBook = loadedBooks[book.id];

        if (!openBookIds.includes(book.id) || !loadedBook?.data) continue;
        if (paginatedBooks[book.id]?.viewportKey === viewportKey) continue;

        await waitForIdle();
        const pages = await paginateBookByLayout(loadedBook.data);

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
  }, [isStateLoaded, loadedBooks, openBookIds, paginatedBooks, viewportKey]);

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

  const editingBook = editingBookId
    ? BOOKS.find((book) => book.id === editingBookId)
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

  const rows = useMemo(
    () =>
      createArticleRows({
        animationsEnabled,
        bookMetadataEdits,
        isDarkMode,
        isSyncingState,
        loadedBooks,
        openBookIds,
        activePageByRowId,
        jumpToBookPage,
        openBookSettings: setEditingBookId,
        paginatedBooks,
        savedPageByBookId,
        toggleAnimations,
        toggleDarkMode,
        toggleBook
      }),
    [
      activePageByRowId,
      animationsEnabled,
      bookMetadataEdits,
      isDarkMode,
      isSyncingState,
      jumpToBookPage,
      loadedBooks,
      openBookIds,
      paginatedBooks,
      savedPageByBookId,
      toggleAnimations,
      toggleDarkMode,
      toggleBook
    ]
  );

  if (!isStateLoaded) {
    return (
      <div className={isDarkMode ? "dark" : ""}>
        <SyncingScreen />
      </div>
    );
  }

  return (
    <div className={isDarkMode ? "dark" : ""}>
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

            for (const book of BOOKS) {
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
      {editingBook && editingMetadata ? (
        <BookMetadataDialog
          book={editingBook}
          metadata={editingMetadata}
          onClose={() => setEditingBookId(null)}
          onSave={saveBookMetadata}
        />
      ) : null}
    </div>
  );
}

function createArticleRows({
  activePageByRowId,
  animationsEnabled,
  bookMetadataEdits,
  isDarkMode,
  isSyncingState,
  jumpToBookPage,
  loadedBooks,
  openBookIds,
  openBookSettings,
  paginatedBooks,
  savedPageByBookId,
  toggleAnimations,
  toggleDarkMode,
  toggleBook
}: {
  activePageByRowId: Record<string, string>;
  animationsEnabled: boolean;
  bookMetadataEdits: Record<string, BookMetadataEdit>;
  isDarkMode: boolean;
  isSyncingState: boolean;
  jumpToBookPage: (bookId: string, pageId: string) => void;
  loadedBooks: Record<string, LoadedBook>;
  openBookIds: string[];
  openBookSettings: (bookId: string) => void;
  paginatedBooks: Record<string, PaginatedBook>;
  savedPageByBookId: Record<string, string>;
  toggleAnimations: () => void;
  toggleDarkMode: () => void;
  toggleBook: (bookId: string) => void;
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
              isDarkMode={isDarkMode}
              toggleAnimations={toggleAnimations}
              toggleDarkMode={toggleDarkMode}
            />
          )
        }
      ]
    },
    {
      id: "library",
      pages: chunkBooks(BOOKS, LIBRARY_BOOKS_PER_PAGE).map((books, index, pages) => ({
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
        }))
    },
    ...openBookIds
      .map((bookId) => BOOKS.find((book) => book.id === bookId))
      .filter((book): book is BookSource => Boolean(book))
      .map((book) =>
        createBookRow(
          book,
          bookMetadataEdits[book.id],
          isSyncingState,
          loadedBooks[book.id],
          paginatedBooks[book.id]?.pages,
          savedPageByBookId[book.id],
          jumpToBookPage
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
  jumpToBookPage?: (bookId: string, pageId: string) => void
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
  isDarkMode,
  toggleAnimations,
  toggleDarkMode
}: {
  animationsEnabled: boolean;
  isDarkMode: boolean;
  toggleAnimations: () => void;
  toggleDarkMode: () => void;
}) {
  return (
    <div className="flex min-h-full items-center px-5 py-8 text-neutral-950 dark:text-neutral-100 sm:px-10 sm:py-12">
      <div className="mx-auto w-full max-w-3xl text-center">
        <fieldset className="mx-auto max-w-md border border-neutral-300 px-6 pb-7 pt-5 dark:border-neutral-700">
          <legend className="mx-auto px-3 text-neutral-500 dark:text-neutral-400">
            <Settings aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            <span className="sr-only">Settings</span>
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
          </div>
        </fieldset>
      </div>
    </div>
  );
}

function SyncingScreen() {
  return (
    <main
      aria-busy="true"
      className="flex h-dvh w-screen items-center justify-center bg-white px-6 text-center text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100"
    >
      <p className="text-sm uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
        Syncing
      </p>
    </main>
  );
}

function BookMetadataDialog({
  book,
  metadata,
  onClose,
  onSave
}: {
  book: BookSource;
  metadata: BookMetadataEdit;
  onClose: () => void;
  onSave: (bookId: string, metadata: BookMetadataEdit) => void;
}) {
  const [author, setAuthor] = useState(metadata.author);
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
          <Settings aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
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
            className="text-base text-neutral-500 outline-none focus-visible:text-neutral-950 dark:text-neutral-400 dark:focus-visible:text-neutral-100"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="text-base text-neutral-950 outline-none focus-visible:text-neutral-500 dark:text-neutral-100 dark:focus-visible:text-neutral-400"
            type="submit"
          >
            Save
          </button>
        </div>
      </form>
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

  useEffect(() => {
    setPageDraft(String(pageNumber));
  }, [pageNumber]);

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
          <span
            aria-label={isSyncingState ? "Syncing progress" : undefined}
            className={`mb-0.5 h-1.5 w-1.5 rounded-full bg-neutral-950 transition-opacity duration-500 dark:bg-neutral-100 ${
              isSyncingState
                ? "animate-pulse opacity-40"
                : "pointer-events-none opacity-0"
            }`}
          />
          <input
            aria-label={`Page, 1 through ${pageTotal}`}
            className="w-12 appearance-none bg-transparent text-right text-neutral-950 outline-none [font-variant-numeric:tabular-nums] focus-visible:underline dark:text-neutral-100"
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
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-3xl min-w-0 flex-col justify-start overflow-hidden py-5 sm:py-8">
        <div className="reader-page-content">
          {chapterTitle ? (
            <div className="reader-chapter-heading">{chapterTitle}</div>
          ) : null}
          <div className="reader-page-body">
            {paragraphs.map((paragraph, index) => (
              <p key={`${pageNumber}-${index}`}>{paragraph}</p>
            ))}
          </div>
        </div>
      </div>
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
    bookMetadataEdits: {},
    isDarkMode: false,
    openBookIds: [],
    savedPageByBookId: {},
    version: 1
  };
}

function readPersistedAppState(): PersistedAppState {
  if (typeof window === "undefined") {
    return getDefaultPersistedAppState();
  }

  try {
    const rawState = window.localStorage.getItem(APP_STATE_STORAGE_KEY);

    if (!rawState) {
      return getDefaultPersistedAppState();
    }

    const parsedState: unknown = JSON.parse(rawState);

    if (!isRecord(parsedState) || parsedState.version !== 1) {
      return getDefaultPersistedAppState();
    }

    return normalizePersistedAppState(parsedState);
  } catch {
    return getDefaultPersistedAppState();
  }
}

function writePersistedAppState(state: PersistedAppState) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(state));
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
    bookMetadataEdits,
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

  const knownBookIds = new Set(BOOKS.map((book) => book.id));
  const openBookIds: string[] = [];

  for (const bookId of value) {
    if (
      typeof bookId === "string" &&
      knownBookIds.has(bookId) &&
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
    languageCode: normalizeLanguageCode(metadataEdit?.languageCode ?? "und"),
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
    : LANGUAGE_CHOICES[0].code;
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

function chunkBooks(books: BookSource[], size: number) {
  const chunks: BookSource[][] = [];

  for (let index = 0; index < books.length; index += size) {
    chunks.push(books.slice(index, index + size));
  }

  return chunks;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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
