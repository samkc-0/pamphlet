import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

const LIBRARY_BOOKS_PER_PAGE = 5;
const MAX_OPEN_BOOKS = 5;

function App() {
  const [openBookIds, setOpenBookIds] = useState<string[]>([]);
  const [loadedBooks, setLoadedBooks] = useState<Record<string, LoadedBook>>(
    {}
  );
  const [paginatedBooks, setPaginatedBooks] = useState<
    Record<string, PaginatedBook>
  >({});
  const [activePageByRowId, setActivePageByRowId] = useState<
    Record<string, string>
  >({});
  const [savedPageByBookId, setSavedPageByBookId] = useState<
    Record<string, string>
  >({});
  const [pageJump, setPageJump] = useState<PageJump | null>(null);
  const pageJumpSerial = useRef(0);
  const [viewportKey, setViewportKey] = useState(() => getViewportKey());

  useEffect(() => {
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
  }, [loadedBooks, openBookIds]);

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
  }, [loadedBooks, openBookIds, paginatedBooks, viewportKey]);

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

  const rows = useMemo(
    () =>
      createArticleRows({
        loadedBooks,
        openBookIds,
        activePageByRowId,
        jumpToBookPage,
        paginatedBooks,
        savedPageByBookId,
        toggleBook
      }),
    [
      activePageByRowId,
      jumpToBookPage,
      loadedBooks,
      openBookIds,
      paginatedBooks,
      savedPageByBookId,
      toggleBook
    ]
  );

  return (
    <SwipeWorkspace
      onStateChange={({ activePageByRowId }) => {
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
  );
}

function createArticleRows({
  activePageByRowId,
  jumpToBookPage,
  loadedBooks,
  openBookIds,
  paginatedBooks,
  savedPageByBookId,
  toggleBook
}: {
  activePageByRowId: Record<string, string>;
  jumpToBookPage: (bookId: string, pageId: string) => void;
  loadedBooks: Record<string, LoadedBook>;
  openBookIds: string[];
  paginatedBooks: Record<string, PaginatedBook>;
  savedPageByBookId: Record<string, string>;
  toggleBook: (bookId: string) => void;
}): WorkspaceRow[] {
  return [
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
              loadedBooks={loadedBooks}
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
  loadedBook?: LoadedBook,
  pages?: ReaderPage[],
  savedPageId?: string,
  jumpToBookPage?: (bookId: string, pageId: string) => void
): WorkspaceRow {
  if (pages?.length) {
    const title = loadedBook?.data?.title ?? book.title;
    const author = loadedBook?.data?.author ?? book.author;

    return {
      id: book.id,
      initialPageId: savedPageId,
      pages: pages.map((page, index) => ({
        id: page.id,
        render: () => (
          <ReaderScreen
            author={author}
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
            title={title}
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
            book={book}
            error={loadedBook?.error}
            loading={!loadedBook?.data && (loadedBook?.loading ?? true)}
            paginating={Boolean(loadedBook?.data)}
          />
        )
      }
    ]
  };
}

function LibraryScreen({
  activePageByRowId,
  books,
  loadedBooks,
  openBookIds,
  pageNumber,
  pageTotal,
  paginatedBooks,
  savedPageByBookId,
  toggleBook
}: {
  activePageByRowId: Record<string, string>;
  books: BookSource[];
  loadedBooks: Record<string, LoadedBook>;
  openBookIds: string[];
  pageNumber: number;
  pageTotal: number;
  paginatedBooks: Record<string, PaginatedBook>;
  savedPageByBookId: Record<string, string>;
  toggleBook: (bookId: string) => void;
}) {
  const contentsProgress =
    pageTotal > 1 ? ((pageNumber - 1) / (pageTotal - 1)) * 100 : 0;

  return (
    <div className="flex min-h-full items-center px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-4 border-neutral-300 pb-2 text-center sm:mb-6 sm:pb-4">
          <h1 className="mt-4 font-['Cormorant_Unicase'] text-4xl font-bold leading-tight text-neutral-950 sm:text-6xl">
            Contents
          </h1>
          <span
            aria-label={`Contents page ${pageNumber} of ${pageTotal}`}
            className="mx-auto mt-4 block h-0.5 w-full max-w-md overflow-hidden rounded-full bg-neutral-200"
            role="meter"
            aria-valuemax={pageTotal}
            aria-valuemin={1}
            aria-valuenow={pageNumber}
          >
            <span
              aria-hidden="true"
              className="block h-full rounded-full bg-neutral-950"
              style={{ width: `${contentsProgress}%` }}
            />
          </span>
        </header>

        <ol>
          {books.map((book) => {
            const isOpen = openBookIds.includes(book.id);
            const loadedBook = loadedBooks[book.id];
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
                  className="block w-full px-2 text-center outline-none focus-visible:text-neutral-500"
                  onClick={() => toggleBook(book.id)}
                  type="button"
                >
                  <span className="block text-xl leading-tight text-neutral-950 min-[390px]:text-2xl">
                    {loadedBook?.data?.title ?? book.title}
                    <span
                      aria-hidden={!isOpen}
                      className={`ml-2 inline-block w-8 text-left text-neutral-500 ${
                        isOpen ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      {isOpen ? ROW_MARKERS[rowNumber] : ROW_MARKERS[0]}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm text-neutral-600 min-[390px]:text-base">
                    {loadedBook?.data?.author ?? book.author}
                  </span>
                  <span
                    aria-hidden="true"
                    className="mx-auto mt-3 block h-0.5 w-full max-w-md overflow-hidden rounded-full bg-neutral-200"
                  >
                    <span
                      className="block h-full rounded-full bg-neutral-950"
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
  onPageChange,
  paragraphs,
  pageNumber,
  pageTotal,
  title
}: {
  author: string;
  chapterTitle?: string;
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
    <article className="grid h-full grid-rows-[auto_1fr] overflow-hidden bg-white px-5 py-5 sm:px-10 sm:py-7">
      <header className="mx-auto flex w-full max-w-3xl min-w-0 items-baseline justify-between gap-4 border-neutral-200 pb-3 text-sm text-neutral-500">
        <div className="min-w-0 overflow-hidden">
          <span className="truncate text-neutral-500">{title}</span>
          <span className="mx-2 text-neutral-500">⋅</span>
          <span className="truncate text-neutral-500">{author}</span>
        </div>
        <label className="flex shrink-0 items-baseline gap-1 text-neutral-500">
          <span className="sr-only">Page</span>
          <input
            aria-label={`Page, 1 through ${pageTotal}`}
            className="w-12 appearance-none bg-transparent text-right text-neutral-950 outline-none [font-variant-numeric:tabular-nums] focus-visible:underline"
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
  book,
  error,
  loading,
  paginating
}: {
  book: BookSource;
  error?: string;
  loading: boolean;
  paginating: boolean;
}) {
  return (
    <div className="flex h-full w-full items-center justify-center px-6 text-center">
      <div>
        <p className="text-sm uppercase tracking-[0.18em] text-neutral-500">
          {paginating ? "Paginating" : loading ? "Loading" : "Unavailable"}
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-neutral-950">
          {book.title}
        </h1>
        <p className="mt-3 text-lg text-neutral-600">
          {error ?? "Preparing measured pages."}
        </p>
      </div>
    </div>
  );
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
