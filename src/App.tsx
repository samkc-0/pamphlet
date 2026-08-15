import { useEffect, useMemo, useState } from "react";

import { BOOKS, type BookSource } from "@/books";
import {
  SwipeWorkspace,
  type WorkspaceRow
} from "@/components/swipe-workspace";
import { loadEpub, type EpubBook } from "@/lib/epub";

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

  const rows = useMemo(
    () =>
      createArticleRows({
        loadedBooks,
        openBookIds,
        toggleBook: (bookId) => {
          setOpenBookIds((current) =>
            current.includes(bookId)
              ? current.filter((id) => id !== bookId)
              : [...current, bookId]
          );
        }
      }),
    [loadedBooks, openBookIds]
  );

  return <SwipeWorkspace rows={rows} />;
}

function createArticleRows({
  loadedBooks,
  openBookIds,
  toggleBook
}: {
  loadedBooks: Record<string, LoadedBook>;
  openBookIds: string[];
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
      createBookRow(book, loadedBooks[book.id])
    )
  ];
}

function createBookRow(book: BookSource, loadedBook?: LoadedBook): WorkspaceRow {
  if (loadedBook?.data?.sections.length) {
    return {
      id: book.id,
      pages: loadedBook.data.sections.map((section, index) => ({
        id: section.id,
        render: () => (
          <ReaderScreen
            author={loadedBook.data?.author ?? book.author}
            pageNumber={index + 1}
            pageTotal={loadedBook.data?.sections.length ?? 1}
            chapterTitle={section.chapterTitle}
            paragraphs={section.paragraphs}
            title={loadedBook.data?.title ?? book.title}
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
            loading={loadedBook?.loading ?? true}
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
            const pageCount = loadedBook?.data?.sections.length;
            const rowNumber =
              books
                .filter((candidate) => openBookIds.includes(candidate.id))
                .findIndex((candidate) => candidate.id === book.id) + 1;

            return (
              <li
                className="cursor-pointer py-4 outline-none transition-colors hover:bg-neutral-50 focus:bg-neutral-50"
                key={book.id}
                onClick={() => toggleBook(book.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleBook(book.id);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="grid grid-cols-[3rem_1fr_auto] items-baseline gap-3 px-2">
                  <div className="text-2xl text-neutral-950">
                    {isOpen ? ROW_MARKERS[rowNumber] : ""}
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl leading-tight text-neutral-950">
                    {loadedBook?.data?.title ?? book.title}
                    </div>
                    <div className="mt-1 text-base text-neutral-600">
                      {loadedBook?.data?.author ?? book.author}
                    </div>
                  </div>
                  <div className="text-right text-sm text-neutral-500">
                    {isOpen ? `${pageCount ?? "..."} pp.` : ""}
                  </div>
                </div>
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
        {chapterTitle ? (
          <div className="mb-5 text-lg font-semibold leading-tight text-neutral-950 sm:text-2xl">
            {chapterTitle}
          </div>
        ) : null}
        <div className="space-y-4 text-[clamp(1.08rem,2.05vw,1.45rem)] leading-[1.62] text-neutral-950">
          {paragraphs.map((paragraph, index) => (
            <p key={`${pageNumber}-${index}`}>{paragraph}</p>
          ))}
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
  loading
}: {
  book: BookSource;
  error?: string;
  loading: boolean;
}) {
  return (
    <div className="flex h-full w-full items-center justify-center px-6 text-center">
      <div>
        <p className="text-sm uppercase tracking-[0.18em] text-neutral-500">
          {loading ? "Loading" : "Unavailable"}
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-neutral-950">
          {book.title}
        </h1>
        <p className="mt-3 text-lg text-neutral-600">
          {error ?? "Preparing EPUB pages."}
        </p>
      </div>
    </div>
  );
}

export default App;
