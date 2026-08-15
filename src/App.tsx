import { useCallback, useEffect, useMemo, useState } from "react";

import { BOOKS, type BookSource } from "@/books";
import {
  SwipeWorkspace,
  type WorkspaceRow
} from "@/components/swipe-workspace";
import { loadEpub, type EpubBook } from "@/lib/epub";
import { paginateBookByLayout, type ReaderPage } from "@/lib/pagination";

type LoadedBook = {
  data?: EpubBook;
  error?: string;
  loading: boolean;
};

type PaginatedBook = {
  pages: ReaderPage[];
  viewportKey: string;
};

function App() {
  const [openBookIds, setOpenBookIds] = useState(() =>
    BOOKS.map((book) => book.id)
  );
  const [loadedBooks, setLoadedBooks] = useState<Record<string, LoadedBook>>(
    {}
  );
  const [paginatedBooks, setPaginatedBooks] = useState<
    Record<string, PaginatedBook>
  >({});
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
      setOpenBookIds((current) =>
        current.includes(bookId)
          ? current.filter((id) => id !== bookId)
          : [...current.filter((id) => id !== bookId), bookId]
      );
    }, 0);
  }, []);

  const rows = useMemo(
    () =>
      createArticleRows({
        loadedBooks,
        openBookIds,
        paginatedBooks,
        toggleBook
      }),
    [loadedBooks, openBookIds, paginatedBooks, toggleBook]
  );

  return <SwipeWorkspace rows={rows} />;
}

function createArticleRows({
  loadedBooks,
  openBookIds,
  paginatedBooks,
  toggleBook
}: {
  loadedBooks: Record<string, LoadedBook>;
  openBookIds: string[];
  paginatedBooks: Record<string, PaginatedBook>;
  toggleBook: (bookId: string) => void;
}): WorkspaceRow[] {
  return [
    {
      id: "library",
      pages: [
        {
          id: "books",
          render: () => (
            <LibraryScreen
              books={BOOKS}
              loadedBooks={loadedBooks}
              openBookIds={openBookIds}
              toggleBook={toggleBook}
            />
          )
        }
      ]
    },
    ...openBookIds
      .map((bookId) => BOOKS.find((book) => book.id === bookId))
      .filter((book): book is BookSource => Boolean(book))
      .map((book) =>
        createBookRow(book, loadedBooks[book.id], paginatedBooks[book.id]?.pages)
      )
  ];
}

function createBookRow(
  book: BookSource,
  loadedBook?: LoadedBook,
  pages?: ReaderPage[]
): WorkspaceRow {
  if (pages?.length) {
    const title = loadedBook?.data?.title ?? book.title;
    const author = loadedBook?.data?.author ?? book.author;

    return {
      id: book.id,
      pages: pages.map((page, index) => ({
        id: page.id,
        render: () => (
          <ReaderScreen
            author={author}
            pageNumber={index + 1}
            pageTotal={pages.length}
            chapterTitle={page.chapterTitle}
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
  books,
  loadedBooks,
  openBookIds,
  toggleBook
}: {
  books: BookSource[];
  loadedBooks: Record<string, LoadedBook>;
  openBookIds: string[];
  toggleBook: (bookId: string) => void;
}) {
  return (
    <div className="flex min-h-full items-center px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8 border-neutral-300 pb-5 text-center">
          <h1 className="mt-4 text-4xl font-semibold leading-tight text-neutral-950 sm:text-6xl">
            Contents
          </h1>
        </header>

        <ol className="divide-y divide-neutral-200">
          {books.map((book) => {
            const isOpen = openBookIds.includes(book.id);
            const loadedBook = loadedBooks[book.id];
            const rowNumber = openBookIds.indexOf(book.id) + 1;

            return (
              <li className="py-4" key={book.id}>
                <button
                  aria-pressed={isOpen}
                  className="block w-full px-2 text-center outline-none focus-visible:underline"
                  onClick={() => toggleBook(book.id)}
                  type="button"
                >
                  <span className="block text-2xl leading-tight text-neutral-950">
                    {loadedBook?.data?.title ?? book.title}
                    <span
                      aria-hidden="true"
                      className="ml-2 inline-flex w-8 items-center justify-start text-neutral-500"
                    >
                      <RowMarker number={isOpen ? rowNumber : undefined} />
                    </span>
                  </span>
                  <span className="mt-1 block text-base text-neutral-600">
                    {loadedBook?.data?.author ?? book.author}
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
  paragraphs,
  pageNumber,
  pageTotal,
  title
}: {
  author: string;
  chapterTitle?: string;
  pageNumber: number;
  pageTotal: number;
  paragraphs: string[];
  title: string;
}) {
  return (
    <article className="grid h-full grid-rows-[auto_1fr_auto] overflow-hidden bg-white px-5 py-5 sm:px-10 sm:py-7">
      <header className="mx-auto flex w-full max-w-3xl items-baseline justify-between gap-4 border-b border-neutral-200 pb-3 text-sm text-neutral-500">
        <div className="min-w-0 truncate">
          <span className="text-neutral-900">{title}</span>
          <span className="mx-2 text-neutral-300">/</span>
          <span>{author}</span>
        </div>
        <div className="shrink-0">
          {pageNumber} / {pageTotal}
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-col justify-center overflow-hidden py-5 sm:py-8">
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

      <footer className="mx-auto w-full max-w-3xl border-t border-neutral-200 pt-3 text-center text-sm text-neutral-500">
        {pageNumber}
      </footer>
    </article>
  );
}

function RowMarker({ number }: { number?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="h-[1em] w-[1em] overflow-visible"
      focusable="false"
      viewBox="0 0 32 32"
    >
      <circle
        cx="16"
        cy="16"
        fill="none"
        r="14"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      {number ? (
        <text
          dominantBaseline="central"
          fill="currentColor"
          fontFamily="Georgia, Cambria, 'Times New Roman', Times, serif"
          fontSize={number > 9 ? 14 : 17}
          textAnchor="middle"
          x="16"
          y="16"
        >
          {number}
        </text>
      ) : null}
    </svg>
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

export default App;
