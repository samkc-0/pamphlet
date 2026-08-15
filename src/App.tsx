import { useEffect, useMemo, useState } from "react";

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

function App() {
  const [openBookIds, setOpenBookIds] = useState(() =>
    BOOKS.map((book) => book.id)
  );
  const [loadedBooks, setLoadedBooks] = useState<Record<string, LoadedBook>>(
    {}
  );
  const [paginatedBooks, setPaginatedBooks] = useState<
    Record<string, ReaderPage[]>
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

        const pages = await paginateBookByLayout(loadedBook.data);

        if (!cancelled) {
          setPaginatedBooks((current) => ({
            ...current,
            [book.id]: pages
          }));
        }
      }
    }

    paginateOpenBooks();

    return () => {
      cancelled = true;
    };
  }, [loadedBooks, openBookIds, viewportKey]);

  const rows = useMemo(
    () =>
      createArticleRows({
        loadedBooks,
        openBookIds,
        paginatedBooks,
        toggleBook: (bookId) => {
          setOpenBookIds((current) =>
            current.includes(bookId)
              ? current.filter((id) => id !== bookId)
              : [...current, bookId]
          );
        }
      }),
    [loadedBooks, openBookIds, paginatedBooks]
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
  paginatedBooks: Record<string, ReaderPage[]>;
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
    ...BOOKS.filter((book) => openBookIds.includes(book.id)).map((book) =>
      createBookRow(book, loadedBooks[book.id], paginatedBooks[book.id])
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
        <header className="mb-8 border-b border-neutral-300 pb-5">
          <div className="text-sm uppercase tracking-[0.18em] text-neutral-500">
            {ROW_MARKERS[0]} Library
          </div>
          <h1 className="mt-4 text-4xl font-semibold leading-tight text-neutral-950 sm:text-6xl">
            Contents
          </h1>
        </header>

        <ol className="divide-y divide-neutral-200">
          {books.map((book) => {
            const isOpen = openBookIds.includes(book.id);
            const loadedBook = loadedBooks[book.id];
            const rowNumber =
              books
                .filter((candidate) => openBookIds.includes(candidate.id))
                .findIndex((candidate) => candidate.id === book.id) + 1;

            return (
              <li className="py-4" key={book.id}>
                <button
                  aria-pressed={isOpen}
                  className="block w-full px-2 text-left outline-none focus-visible:underline"
                  onClick={() => toggleBook(book.id)}
                  type="button"
                >
                  <span className="block text-2xl leading-tight text-neutral-950">
                    {loadedBook?.data?.title ?? book.title}
                    {isOpen ? (
                      <span className="ml-2 text-neutral-500">
                        {ROW_MARKERS[rowNumber]}
                      </span>
                    ) : null}
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
        {ROW_MARKERS[Math.min(pageNumber, ROW_MARKERS.length - 1)] ?? pageNumber}
      </footer>
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

export default App;
