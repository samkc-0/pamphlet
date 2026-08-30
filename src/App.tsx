import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, MouseEvent, PointerEvent } from "react";
import { Settings, UserRound } from "lucide-react";

import type { BookSource } from "@/books";
import {
  SentenceLookupPopup,
  type SentenceLookupState
} from "@/components/sentence-lookup-popup";
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
  readBookContent,
  saveSyncedBook,
  saveUploadedBook
} from "@/lib/books-db";
import { lookupWord, translateText } from "@/lib/dictionary";
import {
  computeContentHash,
  loadEpubFromArrayBuffer,
  type EpubBook
} from "@/lib/epub";
import {
  readCachedPagination,
  writeCachedPagination
} from "@/lib/pagination-cache";
import {
  findPageForMarker,
  paginateBookByLayout,
  type ReaderPage
} from "@/lib/pagination";
import {
  loadAllPinnedWordRecords,
  loadPinnedWords,
  setWordPinned
} from "@/lib/pinned-words";
import { speakWord } from "@/lib/speech";
import {
  AUTH_POPUP_MESSAGE_TYPE,
  clearStoredSessionToken,
  consumeSessionTokenFromLocation,
  endSession,
  fetchAllBookMetadata,
  fetchAllPinnedWords,
  fetchAllProgress,
  fetchBookCatalog,
  fetchBookContent,
  fetchCurrentUser,
  fetchNavigationState,
  fetchSettings,
  getGoogleSignInUrl,
  getSyncApiOrigin,
  getStoredSessionToken,
  openGoogleSignInPopup,
  pushBook,
  pushBookDeletion,
  pushBookMetadata,
  pushNavigationState,
  pushPinnedWord,
  pushProgress,
  pushSettings,
  setStoredSessionToken,
  type SyncUser
} from "@/lib/sync-client";
import {
  normalizeWord,
  tokenizeParagraphWithOffsets
} from "@/lib/tokenize";

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

type SpanishVoiceRegion = "es" | "es-AR" | "es-MX";

type FontFamily = "sans" | "serif";

type BookMetadataEdit = {
  author: string;
  dictionaryLanguageCode: string;
  fontFamily: FontFamily;
  languageCode: string;
  spanishVoiceRegion: SpanishVoiceRegion;
  title: string;
  // Only meaningful for an actual saved edit, not the derived
  // book+overrides display object getBookMetadata() returns.
  updatedAt?: number;
};

// A reading position expressed against a book's deterministic extracted
// text (chapter id + paragraph index) rather than a viewport-dependent
// ReaderPage.id, plus a timestamp for last-write-wins sync. Kept separate
// from savedPageByBookId (whose value is device-specific and has no
// per-book timestamp of its own - the whole PersistedAppState blob's
// timestamp bumps on any change, not just a page turn, so it can't be used
// for this).
type ReadingProgressRecord = {
  chapterId: string;
  paragraphIndex: number;
  updatedAt: number;
};

type PersistedAppState = {
  activePageByRowId: Record<string, string>;
  activeRowId: string;
  animationsEnabled: boolean;
  autoPlayWordAudio: boolean;
  bookMetadataEdits: Record<string, BookMetadataEdit>;
  hasSeededDemoBook: boolean;
  isDarkMode: boolean;
  lastDictionaryLanguageCode: string;
  lastSpanishVoiceRegion: SpanishVoiceRegion;
  locallyDeletedContentHashes: string[];
  openBookIds: string[];
  readingProgressByBookId: Record<string, ReadingProgressRecord>;
  savedPageByBookId: Record<string, string>;
  version: 1;
};

const DEMO_BOOK_FILE_NAME = "demo.epub";
const DEMO_BOOK_PATH = `/books/${DEMO_BOOK_FILE_NAME}`;
const LIBRARY_BOOKS_PER_PAGE = 5;
const LONG_PRESS_MS = 550;
const MAX_OPEN_BOOKS = 5;
const LANGUAGE_CHOICES = [
  { code: "und", flagCode: "un", label: "Unsupported" },
  { code: "en", flagCode: "gb", label: "English" },
  { code: "es", flagCode: "es", label: "Spanish" },
  { code: "fr", flagCode: "fr", label: "French" },
  { code: "it", flagCode: "it", label: "Italian" }
];
const DICTIONARY_LANGUAGE_CHOICES = LANGUAGE_CHOICES.filter(
  (language) => language.code !== "und"
);
const SPANISH_VOICE_REGIONS: {
  code: SpanishVoiceRegion;
  flagCode: string;
  label: string;
}[] = [
  { code: "es-AR", flagCode: "ar", label: "Argentina" },
  { code: "es", flagCode: "es", label: "Spain" },
  { code: "es-MX", flagCode: "mx", label: "Mexico" }
];

function FlagIcon({ className, code }: { className?: string; code: string }) {
  return (
    <img alt="" aria-hidden="true" className={className} src={`/flags/${code}.svg`} />
  );
}

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
  const [autoPlayWordAudio, setAutoPlayWordAudio] = useState(
    () => defaultPersistedState.autoPlayWordAudio
  );
  const [lastSpanishVoiceRegion, setLastSpanishVoiceRegion] =
    useState<SpanishVoiceRegion>(
      () => defaultPersistedState.lastSpanishVoiceRegion
    );
  const [lastDictionaryLanguageCode, setLastDictionaryLanguageCode] =
    useState(() => defaultPersistedState.lastDictionaryLanguageCode);
  const [hasSeededDemoBook, setHasSeededDemoBook] = useState(
    () => defaultPersistedState.hasSeededDemoBook
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
  const [readingProgressByBookId, setReadingProgressByBookId] = useState<
    Record<string, ReadingProgressRecord>
  >(() => defaultPersistedState.readingProgressByBookId);
  const [locallyDeletedContentHashes, setLocallyDeletedContentHashes] =
    useState<string[]>(
      () => defaultPersistedState.locallyDeletedContentHashes
    );
  const [pendingRemoteMarkerByBookId, setPendingRemoteMarkerByBookId] =
    useState<Record<string, ReadingProgressRecord>>({});
  const [activeRowId, setActiveRowId] = useState(
    () => defaultPersistedState.activeRowId
  );
  const [pageJump, setPageJump] = useState<PageJump | null>(null);
  const pageJumpSerial = useRef(0);
  const syncIndicatorTimer = useRef<number | null>(null);
  const lastPushedProgressByBookId = useRef<Record<string, number>>({});
  // Tracks the last settings values this device pushed or pulled, so the
  // debounced persist effect only pushes when a setting actually changed
  // (not on every unrelated state change that also triggers that effect),
  // and so a pull can compare its own updatedAt against ours for
  // last-write-wins. Deliberately in-memory only, not persisted - settings
  // are low-stakes enough that losing this baseline across a reload (and
  // at most re-pushing or re-pulling once) isn't worth persisting for.
  const settingsBaseline = useRef<{
    animationsEnabled: boolean;
    autoPlayWordAudio: boolean;
    isDarkMode: boolean;
    lastDictionaryLanguageCode: string;
    lastSpanishVoiceRegion: SpanishVoiceRegion;
    updatedAt: number;
  } | null>(null);
  // Same in-memory-only baseline pattern as settingsBaseline, for which
  // screen (row/open books/library page) was last pushed or pulled.
  const navigationBaseline = useRef<{
    activeRowId: string;
    openContentHashes: string[];
    libraryPageId: string;
    settingsPageId: string;
    updatedAt: number;
  } | null>(null);
  const [viewportKey, setViewportKey] = useState(() => getViewportKey());
  const [currentUser, setCurrentUser] = useState<SyncUser | null>(null);
  const [isForceSyncing, setIsForceSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const token = consumeSessionTokenFromLocation() ?? getStoredSessionToken();

    if (!token) return;

    fetchCurrentUser(token).then((user) => {
      if (cancelled) return;

      if (user) {
        setCurrentUser(user);
      } else {
        clearStoredSessionToken();
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const syncApiOrigin = getSyncApiOrigin();

    function onAuthMessage(event: MessageEvent) {
      if (event.origin !== syncApiOrigin) return;

      const data = event.data as { token?: unknown; type?: unknown } | null;

      if (data?.type !== AUTH_POPUP_MESSAGE_TYPE) return;
      if (typeof data.token !== "string") return;

      setStoredSessionToken(data.token);
      fetchCurrentUser(data.token).then((user) => {
        if (user) setCurrentUser(user);
      });
    }

    window.addEventListener("message", onAuthMessage);

    return () => {
      window.removeEventListener("message", onAuthMessage);
    };
  }, []);

  const signIn = useCallback(() => {
    const popup = openGoogleSignInPopup();

    if (!popup) {
      window.location.href = getGoogleSignInUrl();
    }
  }, []);

  const signOut = useCallback(() => {
    const token = getStoredSessionToken();

    clearStoredSessionToken();
    setCurrentUser(null);

    if (token) {
      endSession(token);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    readPersistedAppState().then((persistedState) => {
      if (cancelled) return;

      setActivePageByRowId(persistedState.activePageByRowId);
      setActiveRowId(persistedState.activeRowId);
      setAnimationsEnabled(persistedState.animationsEnabled);
      setAutoPlayWordAudio(persistedState.autoPlayWordAudio);
      setBookMetadataEdits(persistedState.bookMetadataEdits);
      setHasSeededDemoBook(persistedState.hasSeededDemoBook);
      setIsDarkMode(persistedState.isDarkMode);
      setLastDictionaryLanguageCode(persistedState.lastDictionaryLanguageCode);
      setLastSpanishVoiceRegion(persistedState.lastSpanishVoiceRegion);
      setOpenBookIds(persistedState.openBookIds);
      setSavedPageByBookId(persistedState.savedPageByBookId);
      setReadingProgressByBookId(persistedState.readingProgressByBookId);
      setLocallyDeletedContentHashes(
        persistedState.locallyDeletedContentHashes
      );
      settingsBaseline.current = {
        animationsEnabled: persistedState.animationsEnabled,
        autoPlayWordAudio: persistedState.autoPlayWordAudio,
        isDarkMode: persistedState.isDarkMode,
        lastDictionaryLanguageCode: persistedState.lastDictionaryLanguageCode,
        lastSpanishVoiceRegion: persistedState.lastSpanishVoiceRegion,
        updatedAt: 0
      };
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
    if (!isStateLoaded || !isBookCatalogLoaded || hasSeededDemoBook) return;

    let cancelled = false;

    seedDemoBook()
      .catch(() => {})
      .then(() => refreshBookCatalog())
      .then((books) => {
        if (cancelled) return;
        setBooks(books);
      })
      .finally(() => {
        if (!cancelled) setHasSeededDemoBook(true);
      });

    return () => {
      cancelled = true;
    };
  }, [hasSeededDemoBook, isBookCatalogLoaded, isStateLoaded]);

  // On sign-in, pull whatever this account has synced from other devices:
  // books missing from this device's local catalog, reading positions
  // (stashed as pending markers, resolved lazily once each book is
  // actually paginated - see the pagination effect), and pinned words.
  // Guarded exactly like the seed-demo-book effect above, so it can't race
  // the local catalog/state load on startup.
  // Pulls everything this account has synced from other devices: missing
  // books, deletions (removes any local book the server has confirmed
  // deleted), reading positions (stashed as pending markers, resolved
  // lazily once each book is actually paginated - see the pagination
  // effect), pinned words, settings, book-metadata overrides, and which
  // screen was active. Shared by the sign-in effect below and the
  // Settings screen's manual "Sync now" button. No unmount-cancellation
  // guard here - App is the SPA's root component and doesn't unmount
  // mid-session, so a stale in-flight call is not a real risk.
  const pullRemoteState = useCallback(async () => {
    if (!currentUser) return;

    const token = getStoredSessionToken();
    if (!token) return;

    const [
      remoteBooks,
      remoteProgress,
      remotePinnedWords,
      localPinnedRecords,
      remoteSettings,
      remoteBookMetadata,
      remoteNavigationState
    ] = await Promise.all([
      fetchBookCatalog(token),
      fetchAllProgress(token),
      fetchAllPinnedWords(token),
      loadAllPinnedWordRecords(),
      fetchSettings(token),
      fetchAllBookMetadata(token),
      fetchNavigationState(token)
    ]);

    let localCatalog = await refreshBookCatalog();

    // Propagate a deletion from another device: remove any book this
    // device still has locally that the server has positively confirmed
    // as deleted.
    const remotelyDeletedHashes = new Set(
      remoteBooks.filter((book) => book.deleted).map((book) => book.contentHash)
    );
    const booksToRemoveLocally = localCatalog.filter((book) =>
      remotelyDeletedHashes.has(book.fingerprint)
    );
    for (const book of booksToRemoveLocally) {
      await deleteStoredBook(book);
      setOpenBookIds((current) => current.filter((id) => id !== book.id));
      setLoadedBooks((current) => omitRecordKey(current, book.id));
      setPaginatedBooks((current) => omitRecordKey(current, book.id));
      setBookMetadataEdits((current) => omitRecordKey(current, book.id));
      setSavedPageByBookId((current) => omitRecordKey(current, book.id));
      setReadingProgressByBookId((current) => omitRecordKey(current, book.id));
      setActivePageByRowId((current) => omitRecordKey(current, book.id));
    }
    if (booksToRemoveLocally.length > 0) {
      localCatalog = await refreshBookCatalog();
    }

    const localHashes = new Set(localCatalog.map((book) => book.fingerprint));
    const deletedHashes = new Set(locallyDeletedContentHashes);
    const missingBooks = remoteBooks.filter(
      (book) =>
        !book.deleted &&
        !localHashes.has(book.contentHash) &&
        !deletedHashes.has(book.contentHash)
    );

    for (const summary of missingBooks) {
      const content = await fetchBookContent(token, summary.contentHash);
      if (!content) continue;

      const now = Date.now();
      const id = `${slugify(content.title || summary.title || "untitled")}-${summary.contentHash.slice(0, 12)}`;

      await saveSyncedBook({
        book: {
          author: content.author,
          createdAt: now,
          fileName: `${content.title || "untitled"}.epub`,
          fingerprint: summary.contentHash,
          id,
          language: content.language,
          size: 0,
          storageKey: id,
          title: content.title,
          updatedAt: now
        },
        content
      });
    }

    const finalCatalog =
      missingBooks.length > 0 ? await refreshBookCatalog() : localCatalog;
    setBooks(finalCatalog);

    const bookIdByContentHash = new Map(
      finalCatalog.map((book) => [book.fingerprint, book.id])
    );

    setPendingRemoteMarkerByBookId((current) => {
      const next = { ...current };

      for (const progress of remoteProgress) {
        const bookId = bookIdByContentHash.get(progress.contentHash);
        if (!bookId) continue;

        const pending = next[bookId];
        if (pending && pending.updatedAt >= progress.updatedAt) continue;

        next[bookId] = {
          chapterId: progress.chapterId,
          paragraphIndex: progress.paragraphIndex,
          updatedAt: progress.updatedAt
        };
      }

      return next;
    });

    const localPinnedByKey = new Map(
      localPinnedRecords.map((record) => [record.id, record])
    );

    for (const word of remotePinnedWords) {
      const key = `${word.languageCode}::${word.word}`;
      const local = localPinnedByKey.get(key);
      if (local && local.updatedAt >= word.updatedAt) continue;

      await setWordPinned(word.languageCode, word.word, true, word.updatedAt);
    }

    setBookMetadataEdits((current) => {
      const next = { ...current };

      for (const override of remoteBookMetadata) {
        const bookId = bookIdByContentHash.get(override.contentHash);
        if (!bookId) continue;

        const existing = next[bookId];
        if (existing?.updatedAt && existing.updatedAt >= override.updatedAt) {
          continue;
        }

        next[bookId] = {
          title: override.title,
          author: override.author,
          languageCode: getSupportedLanguageCode(override.languageCode),
          dictionaryLanguageCode: isDictionaryLanguageCode(
            override.dictionaryLanguageCode
          )
            ? override.dictionaryLanguageCode
            : "en",
          fontFamily: override.fontFamily === "sans" ? "sans" : "serif",
          spanishVoiceRegion: isSpanishVoiceRegion(override.spanishVoiceRegion)
            ? override.spanishVoiceRegion
            : "es",
          updatedAt: override.updatedAt
        };
      }

      return next;
    });

    if (remoteSettings) {
      const baseline = settingsBaseline.current;

      if (!baseline || remoteSettings.updatedAt > baseline.updatedAt) {
        const lastSpanishVoiceRegion = isSpanishVoiceRegion(
          remoteSettings.lastSpanishVoiceRegion
        )
          ? remoteSettings.lastSpanishVoiceRegion
          : "es";

        setAnimationsEnabled(remoteSettings.animationsEnabled);
        setAutoPlayWordAudio(remoteSettings.autoPlayWordAudio);
        setIsDarkMode(remoteSettings.isDarkMode);
        setLastDictionaryLanguageCode(
          remoteSettings.lastDictionaryLanguageCode
        );
        setLastSpanishVoiceRegion(lastSpanishVoiceRegion);

        settingsBaseline.current = {
          animationsEnabled: remoteSettings.animationsEnabled,
          autoPlayWordAudio: remoteSettings.autoPlayWordAudio,
          isDarkMode: remoteSettings.isDarkMode,
          lastDictionaryLanguageCode: remoteSettings.lastDictionaryLanguageCode,
          lastSpanishVoiceRegion,
          updatedAt: remoteSettings.updatedAt
        };
      }
    }

    if (remoteNavigationState) {
      const navBaseline = navigationBaseline.current;

      if (!navBaseline || remoteNavigationState.updatedAt > navBaseline.updatedAt) {
        const knownBookIdByContentHash = new Map(
          finalCatalog.map((book) => [book.fingerprint, book.id])
        );

        const nextOpenBookIds = remoteNavigationState.openContentHashes
          .map((hash) => knownBookIdByContentHash.get(hash))
          .filter((id): id is string => Boolean(id));
        const nextActiveRowId =
          knownBookIdByContentHash.get(remoteNavigationState.activeRowId) ??
          (remoteNavigationState.activeRowId === "settings"
            ? "settings"
            : "library");

        setOpenBookIds(nextOpenBookIds);
        setActiveRowId(nextActiveRowId);
        setActivePageByRowId((current) => ({
          ...current,
          library: remoteNavigationState.libraryPageId || current.library,
          settings: remoteNavigationState.settingsPageId || current.settings
        }));

        navigationBaseline.current = {
          activeRowId: remoteNavigationState.activeRowId,
          openContentHashes: remoteNavigationState.openContentHashes,
          libraryPageId: remoteNavigationState.libraryPageId,
          settingsPageId: remoteNavigationState.settingsPageId,
          updatedAt: remoteNavigationState.updatedAt
        };
      }
    }
  }, [currentUser, locallyDeletedContentHashes]);

  // Guarded exactly like the seed-demo-book effect above, so the initial
  // automatic pull can't race the local catalog/state load on startup.
  useEffect(() => {
    if (!currentUser || !isStateLoaded || !isBookCatalogLoaded) return;
    pullRemoteState();
  }, [currentUser, isStateLoaded, isBookCatalogLoaded, pullRemoteState]);

  // Manual escape hatch for the Settings screen's "Sync now" button: the
  // automatic pull only ever runs once per sign-in, so if another device
  // pushes an update during a long session here, this is the only way to
  // pick it up without reloading the page.
  const forceSync = useCallback(async () => {
    setIsForceSyncing(true);
    try {
      await pullRemoteState();
    } finally {
      setIsForceSyncing(false);
    }
  }, [pullRemoteState]);

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

      readBookContent(book)
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
        const fingerprint = await computeContentHash(metadata);
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

        const token = getStoredSessionToken();
        if (currentUser && token) {
          pushBook(token, {
            contentHash: fingerprint,
            title,
            author,
            language: metadata.language,
            chapters: metadata.chapters
          });
        }
      }

      setBooks(await refreshBookCatalog());
    } catch (error: unknown) {
      setUploadError(
        error instanceof Error ? error.message : "Failed to upload book."
      );
    } finally {
      setIsUploadingBooks(false);
    }
  }, [currentUser]);

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
      hasSeededDemoBook,
      isDarkMode,
      lastDictionaryLanguageCode,
      lastSpanishVoiceRegion,
      locallyDeletedContentHashes,
      openBookIds,
      readingProgressByBookId,
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

    const token = getStoredSessionToken();
    if (currentUser && token) {
      for (const [bookId, progress] of Object.entries(readingProgressByBookId)) {
        if (lastPushedProgressByBookId.current[bookId] === progress.updatedAt) {
          continue;
        }

        const book = books.find((candidate) => candidate.id === bookId);
        if (!book) continue;

        lastPushedProgressByBookId.current[bookId] = progress.updatedAt;
        pushProgress(token, book.fingerprint, progress);
      }

      const baseline = settingsBaseline.current;
      const settingsChanged =
        !baseline ||
        baseline.animationsEnabled !== animationsEnabled ||
        baseline.autoPlayWordAudio !== autoPlayWordAudio ||
        baseline.isDarkMode !== isDarkMode ||
        baseline.lastDictionaryLanguageCode !== lastDictionaryLanguageCode ||
        baseline.lastSpanishVoiceRegion !== lastSpanishVoiceRegion;

      if (settingsChanged) {
        const settingsUpdatedAt = Date.now();
        settingsBaseline.current = {
          animationsEnabled,
          autoPlayWordAudio,
          isDarkMode,
          lastDictionaryLanguageCode,
          lastSpanishVoiceRegion,
          updatedAt: settingsUpdatedAt
        };
        pushSettings(token, {
          animationsEnabled,
          autoPlayWordAudio,
          isDarkMode,
          lastDictionaryLanguageCode,
          lastSpanishVoiceRegion,
          updatedAt: settingsUpdatedAt
        });
      }

      const openContentHashes = openBookIds
        .map((bookId) => books.find((book) => book.id === bookId)?.fingerprint)
        .filter((hash): hash is string => Boolean(hash));
      const activeBook = books.find((book) => book.id === activeRowId);
      const navigationState = {
        activeRowId: activeBook ? activeBook.fingerprint : activeRowId,
        openContentHashes,
        libraryPageId: activePageByRowId.library ?? "",
        settingsPageId: activePageByRowId.settings ?? ""
      };

      const navBaseline = navigationBaseline.current;
      const navigationChanged =
        !navBaseline ||
        navBaseline.activeRowId !== navigationState.activeRowId ||
        navBaseline.libraryPageId !== navigationState.libraryPageId ||
        navBaseline.settingsPageId !== navigationState.settingsPageId ||
        !arraysEqual(navBaseline.openContentHashes, navigationState.openContentHashes);

      if (navigationChanged) {
        const navigationUpdatedAt = Date.now();
        navigationBaseline.current = { ...navigationState, updatedAt: navigationUpdatedAt };
        pushNavigationState(token, {
          ...navigationState,
          updatedAt: navigationUpdatedAt
        });
      }
    }

    return () => {
      cancelled = true;
    };
  }, [
    activePageByRowId,
    activeRowId,
    animationsEnabled,
    autoPlayWordAudio,
    bookMetadataEdits,
    books,
    currentUser,
    hasSeededDemoBook,
    isStateLoaded,
    isDarkMode,
    lastDictionaryLanguageCode,
    lastSpanishVoiceRegion,
    locallyDeletedContentHashes,
    openBookIds,
    readingProgressByBookId,
    savedPageByBookId
  ]);

  useEffect(() => {
    return () => {
      if (syncIndicatorTimer.current) {
        window.clearTimeout(syncIndicatorTimer.current);
      }
    };
  }, []);

  const jumpToBookPage = useCallback((bookId: string, pageId: string) => {
    pageJumpSerial.current += 1;

    setPageJump({
      pageId,
      rowId: bookId,
      serial: pageJumpSerial.current
    });
  }, []);

  useEffect(() => {
    if (!isStateLoaded) return;

    let cancelled = false;

    // A book pulled from another device via sync may carry a pending
    // remote reading position, expressed as a viewport-independent marker
    // rather than a ReaderPage.id from this device's own layout. Resolve
    // it into a real page only once this device has actually paginated the
    // book - forcing pagination up front for every book on sign-in would
    // be wasteful. Only wins if it's actually newer than what's already
    // recorded locally.
    function resolvePendingRemoteMarker(bookId: string, pages: ReaderPage[]) {
      const marker = pendingRemoteMarkerByBookId[bookId];
      if (!marker) return;

      setPendingRemoteMarkerByBookId((current) =>
        omitRecordKey(current, bookId)
      );

      const localProgress = readingProgressByBookId[bookId];
      if (localProgress && localProgress.updatedAt >= marker.updatedAt) return;

      const page = findPageForMarker(pages, marker);
      if (!page) return;

      jumpToBookPage(bookId, page.id);
      setReadingProgressByBookId((current) => ({
        ...current,
        [bookId]: marker
      }));
    }

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
          resolvePendingRemoteMarker(book.id, cachedPagination.pages);
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
          resolvePendingRemoteMarker(book.id, pages);
        }
      }
    }

    paginateOpenBooks();

    return () => {
      cancelled = true;
    };
  }, [
    books,
    isStateLoaded,
    jumpToBookPage,
    loadedBooks,
    openBookIds,
    paginatedBooks,
    pendingRemoteMarkerByBookId,
    readingProgressByBookId,
    viewportKey
  ]);

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

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((current) => !current);
  }, []);

  const toggleAnimations = useCallback(() => {
    setAnimationsEnabled((current) => !current);
  }, []);

  const toggleAutoPlayWordAudio = useCallback(() => {
    setAutoPlayWordAudio((current) => !current);
  }, []);

  const saveBookMetadata = useCallback(
    (bookId: string, metadata: BookMetadataEdit) => {
      const updatedAt = Date.now();
      const record: BookMetadataEdit = { ...metadata, updatedAt };

      setBookMetadataEdits((current) => ({
        ...current,
        [bookId]: record
      }));
      setLastSpanishVoiceRegion(metadata.spanishVoiceRegion);
      setLastDictionaryLanguageCode(metadata.dictionaryLanguageCode);
      setEditingBookId(null);

      const token = getStoredSessionToken();
      const book = books.find((candidate) => candidate.id === bookId);
      if (currentUser && token && book) {
        pushBookMetadata(token, book.fingerprint, {
          title: metadata.title,
          author: metadata.author,
          languageCode: metadata.languageCode,
          dictionaryLanguageCode: metadata.dictionaryLanguageCode,
          fontFamily: metadata.fontFamily,
          spanishVoiceRegion: metadata.spanishVoiceRegion,
          updatedAt
        });
      }
    },
    [books, currentUser]
  );

  const deleteBook = useCallback(
    async (book: BookSource) => {
      await deleteStoredBook(book);
      setBooks(await refreshBookCatalog());
      setEditingBookId(null);
      setOpenBookIds((current) => current.filter((bookId) => bookId !== book.id));
      setLoadedBooks((current) => omitRecordKey(current, book.id));
      setPaginatedBooks((current) => omitRecordKey(current, book.id));
      setBookMetadataEdits((current) => omitRecordKey(current, book.id));
      setSavedPageByBookId((current) => omitRecordKey(current, book.id));
      setReadingProgressByBookId((current) => omitRecordKey(current, book.id));
      setActivePageByRowId((current) => omitRecordKey(current, book.id));
      setActiveRowId((current) => (current === book.id ? "library" : current));
      // Recorded immediately so this device's own next catalog pull can't
      // race the server push below and briefly re-download what was just
      // deleted (the real propagation to *other* devices is the server-side
      // delete itself, via Book.Deleted - this tombstone only covers the
      // gap before that push lands).
      setLocallyDeletedContentHashes((current) =>
        current.includes(book.fingerprint)
          ? current
          : [...current, book.fingerprint]
      );

      const token = getStoredSessionToken();
      if (currentUser && token) {
        pushBookDeletion(token, book.fingerprint, Date.now());
      }
    },
    [currentUser]
  );

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
        bookMetadataEdits[editingBook.id],
        lastSpanishVoiceRegion,
        lastDictionaryLanguageCode
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
        currentUser,
        forceSync,
        isDarkMode,
        isForceSyncing,
        isSyncingState,
        isUploadingBooks,
        lastDictionaryLanguageCode,
        lastSpanishVoiceRegion,
        loadedBooks,
        openBookIds,
        activePageByRowId,
        jumpToBookPage,
        openBookSettings: setEditingBookId,
        paginatedBooks,
        savedPageByBookId,
        signIn,
        signOut,
        toggleAnimations,
        toggleAutoPlayWordAudio,
        toggleDarkMode,
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
      currentUser,
      forceSync,
      isDarkMode,
      isForceSyncing,
      isSyncingState,
      isUploadingBooks,
      jumpToBookPage,
      lastDictionaryLanguageCode,
      lastSpanishVoiceRegion,
      loadedBooks,
      openBookIds,
      paginatedBooks,
      savedPageByBookId,
      signIn,
      signOut,
      toggleAnimations,
      toggleAutoPlayWordAudio,
      toggleDarkMode,
      toggleBook,
      uploadError,
      uploadBooks
    ]
  );

  if (!isStateLoaded || !isBookCatalogLoaded) {
    return (
      <div className={getRootClassName(isDarkMode)}>
        <SyncingScreen animationsEnabled={animationsEnabled} />
      </div>
    );
  }

  if (booksError) {
    return (
      <div className={getRootClassName(isDarkMode)}>
        <CatalogErrorScreen error={booksError} />
      </div>
    );
  }

  return (
    <div className={getRootClassName(isDarkMode)}>
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
          setReadingProgressByBookId((current) => {
            const next = { ...current };
            let changed = false;

            for (const book of books) {
              const pageId = activePageByRowId[book.id];
              if (!pageId || pageId === "status") continue;

              const page = paginatedBooks[book.id]?.pages.find(
                (candidate) => candidate.id === pageId
              );
              if (!page) continue;

              // Only stamp a fresh updatedAt when the position actually
              // moved - this callback fires on every navigation change
              // across the whole app, not just a page turn in this book,
              // and a spurious timestamp bump would make a book's local
              // progress look newer than another device's real update to
              // it during sync's last-write-wins comparison.
              const existing = current[book.id];
              if (
                existing?.chapterId === page.chapterId &&
                existing?.paragraphIndex === page.startParagraphIndex
              ) {
                continue;
              }

              next[book.id] = {
                chapterId: page.chapterId,
                paragraphIndex: page.startParagraphIndex,
                updatedAt: Date.now()
              };
              changed = true;
            }

            return changed ? next : current;
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
  currentUser,
  forceSync,
  isDarkMode,
  isForceSyncing,
  isSyncingState,
  isUploadingBooks,
  jumpToBookPage,
  lastDictionaryLanguageCode,
  lastSpanishVoiceRegion,
  loadedBooks,
  openBookIds,
  openBookSettings,
  paginatedBooks,
  savedPageByBookId,
  signIn,
  signOut,
  toggleAnimations,
  toggleAutoPlayWordAudio,
  toggleDarkMode,
  toggleBook,
  uploadError,
  uploadBooks
}: {
  activePageByRowId: Record<string, string>;
  animationsEnabled: boolean;
  autoPlayWordAudio: boolean;
  books: BookSource[];
  bookMetadataEdits: Record<string, BookMetadataEdit>;
  currentUser: SyncUser | null;
  forceSync: () => void;
  isDarkMode: boolean;
  isForceSyncing: boolean;
  isSyncingState: boolean;
  isUploadingBooks: boolean;
  jumpToBookPage: (bookId: string, pageId: string) => void;
  lastDictionaryLanguageCode: string;
  lastSpanishVoiceRegion: SpanishVoiceRegion;
  loadedBooks: Record<string, LoadedBook>;
  openBookIds: string[];
  openBookSettings: (bookId: string) => void;
  paginatedBooks: Record<string, PaginatedBook>;
  savedPageByBookId: Record<string, string>;
  signIn: () => void;
  signOut: () => void;
  toggleAnimations: () => void;
  toggleAutoPlayWordAudio: () => void;
  toggleDarkMode: () => void;
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
              currentUser={currentUser}
              forceSync={forceSync}
              isDarkMode={isDarkMode}
              isForceSyncing={isForceSyncing}
              signIn={signIn}
              signOut={signOut}
              toggleAnimations={toggleAnimations}
              toggleAutoPlayWordAudio={toggleAutoPlayWordAudio}
              toggleDarkMode={toggleDarkMode}
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
                lastDictionaryLanguageCode={lastDictionaryLanguageCode}
                lastSpanishVoiceRegion={lastSpanishVoiceRegion}
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
          autoPlayWordAudio,
          lastSpanishVoiceRegion,
          lastDictionaryLanguageCode,
          currentUser
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
  autoPlayWordAudio?: boolean,
  lastSpanishVoiceRegion?: SpanishVoiceRegion,
  lastDictionaryLanguageCode?: string,
  currentUser?: SyncUser | null
): WorkspaceRow {
  const metadata = getBookMetadata(
    book,
    loadedBook,
    metadataEdit,
    lastSpanishVoiceRegion,
    lastDictionaryLanguageCode
  );

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
            currentUser={currentUser ?? null}
            dictionaryLanguageCode={metadata.dictionaryLanguageCode}
            fontFamily={metadata.fontFamily}
            isSyncingState={Boolean(isSyncingState)}
            languageCode={metadata.languageCode}
            spanishVoiceRegion={metadata.spanishVoiceRegion}
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
  currentUser,
  forceSync,
  isDarkMode,
  isForceSyncing,
  signIn,
  signOut,
  toggleAnimations,
  toggleAutoPlayWordAudio,
  toggleDarkMode
}: {
  animationsEnabled: boolean;
  autoPlayWordAudio: boolean;
  currentUser: SyncUser | null;
  forceSync: () => void;
  isDarkMode: boolean;
  isForceSyncing: boolean;
  signIn: () => void;
  signOut: () => void;
  toggleAnimations: () => void;
  toggleAutoPlayWordAudio: () => void;
  toggleDarkMode: () => void;
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
              aria-pressed={autoPlayWordAudio}
              className="mx-auto block text-lg leading-tight text-neutral-950 outline-none focus-visible:text-neutral-500 dark:text-neutral-100 dark:focus-visible:text-neutral-400"
              onClick={toggleAutoPlayWordAudio}
              type="button"
            >
              Word audio auto-play {autoPlayWordAudio ? "on" : "off"}
            </button>
          </div>
        </fieldset>

        <fieldset className="mx-auto mt-6 max-w-md border border-neutral-300 px-6 pb-7 pt-5 dark:border-neutral-700">
          <legend className="mx-auto px-3 text-neutral-500 dark:text-neutral-400">
            <span className="inline-grid h-10 w-10 place-items-center">
              <UserRound
                aria-label="Account"
                className="h-7 w-7"
                role="img"
                strokeWidth={1.75}
              />
            </span>
          </legend>

          {currentUser ? (
            <div className="space-y-3">
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Signed in as {currentUser.email}
              </p>
              <button
                className="mx-auto block text-lg leading-tight text-neutral-950 outline-none focus-visible:text-neutral-500 disabled:text-neutral-400 dark:text-neutral-100 dark:focus-visible:text-neutral-400 dark:disabled:text-neutral-600"
                disabled={isForceSyncing}
                onClick={forceSync}
                type="button"
              >
                {isForceSyncing ? "Syncing…" : "Sync now"}
              </button>
              <button
                className="mx-auto block text-lg leading-tight text-neutral-950 outline-none focus-visible:text-neutral-500 dark:text-neutral-100 dark:focus-visible:text-neutral-400"
                onClick={signOut}
                type="button"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              className="mx-auto block text-lg leading-tight text-neutral-950 outline-none focus-visible:text-neutral-500 dark:text-neutral-100 dark:focus-visible:text-neutral-400"
              onClick={signIn}
              type="button"
            >
              Sign in with Google
            </button>
          )}
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
  const [dictionaryLanguageCode, setDictionaryLanguageCode] = useState(
    metadata.dictionaryLanguageCode
  );
  const [fontFamily, setFontFamily] = useState(metadata.fontFamily);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRegionPickerOpen, setIsRegionPickerOpen] = useState(false);
  const [languageCode, setLanguageCode] = useState(
    getSupportedLanguageCode(metadata.languageCode)
  );
  const [spanishVoiceRegion, setSpanishVoiceRegion] = useState(
    metadata.spanishVoiceRegion
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
      dictionaryLanguageCode,
      fontFamily,
      languageCode: getSupportedLanguageCode(languageCode),
      spanishVoiceRegion,
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
              Book language:{" "}
              {LANGUAGE_CHOICES.find((language) => language.code === languageCode)
                ?.label ?? "Unsupported"}
            </span>
            <div
              aria-label="Book language"
              className="mt-3 flex justify-center gap-2"
              role="radiogroup"
            >
              {LANGUAGE_CHOICES.map((language) => {
                const isSelected = language.code === languageCode;

                if (language.code === "es") {
                  return (
                    <SpanishRegionReel
                      isSelected={isSelected}
                      key="es"
                      onLongPress={() => setIsRegionPickerOpen(true)}
                      onRegionChange={setSpanishVoiceRegion}
                      onSelect={() => setLanguageCode("es")}
                      value={spanishVoiceRegion}
                    />
                  );
                }

                return (
                  <button
                    aria-checked={isSelected}
                    aria-label={language.label}
                    className={`grid h-10 w-10 place-items-center border outline-none transition-colors ${
                      isSelected
                        ? "border-neutral-950 bg-neutral-950/5 dark:border-neutral-100 dark:bg-neutral-100/10"
                        : "border-neutral-300 dark:border-neutral-700"
                    } focus-visible:border-neutral-950 dark:focus-visible:border-neutral-100`}
                    key={language.code}
                    onClick={() => setLanguageCode(language.code)}
                    role="radio"
                    type="button"
                  >
                    <FlagIcon className="h-6 w-6" code={language.flagCode} />
                  </button>
                );
              })}
            </div>
          </label>

          <label className="block">
            <span className="block text-sm text-neutral-500 dark:text-neutral-400">
              Dictionary:{" "}
              {DICTIONARY_LANGUAGE_CHOICES.find(
                (language) => language.code === dictionaryLanguageCode
              )?.label ?? ""}
            </span>
            <div
              aria-label="Dictionary language"
              className="mt-3 flex justify-center gap-2"
              role="radiogroup"
            >
              {DICTIONARY_LANGUAGE_CHOICES.map((language) => {
                const isSelected = language.code === dictionaryLanguageCode;

                return (
                  <button
                    aria-checked={isSelected}
                    aria-label={language.label}
                    className={`grid h-10 w-10 place-items-center border outline-none transition-colors ${
                      isSelected
                        ? "border-neutral-950 bg-neutral-950/5 dark:border-neutral-100 dark:bg-neutral-100/10"
                        : "border-neutral-300 dark:border-neutral-700"
                    } focus-visible:border-neutral-950 dark:focus-visible:border-neutral-100`}
                    key={language.code}
                    onClick={() => setDictionaryLanguageCode(language.code)}
                    role="radio"
                    type="button"
                  >
                    <FlagIcon className="h-6 w-6" code={language.flagCode} />
                  </button>
                );
              })}
            </div>
          </label>

          <div className="text-center">
            <button
              aria-pressed={fontFamily === "sans"}
              className="text-lg leading-tight text-neutral-950 outline-none focus-visible:text-neutral-500 dark:text-neutral-100 dark:focus-visible:text-neutral-400"
              onClick={() =>
                setFontFamily((current) =>
                  current === "serif" ? "sans" : "serif"
                )
              }
              type="button"
            >
              Font {fontFamily === "serif" ? "serif" : "sans-serif"}
            </button>
          </div>
        </div>

        {isRegionPickerOpen ? (
          <div
            aria-label="Spanish voice"
            aria-modal="true"
            className="fixed inset-0 z-[60] flex items-center justify-center bg-white/75 px-5 backdrop-blur-sm dark:bg-neutral-950/75"
            onClick={() => setIsRegionPickerOpen(false)}
            role="dialog"
          >
            <div
              className="flex gap-3 border border-neutral-300 bg-white p-3 shadow-sm dark:border-neutral-700 dark:bg-neutral-950"
              onClick={(event) => event.stopPropagation()}
            >
              {SPANISH_VOICE_REGIONS.map((region) => (
                <button
                  aria-label={region.label}
                  aria-pressed={spanishVoiceRegion === region.code}
                  className={`grid h-14 w-14 place-items-center border outline-none transition-colors ${
                    spanishVoiceRegion === region.code
                      ? "border-neutral-950 bg-neutral-950/5 dark:border-neutral-100 dark:bg-neutral-100/10"
                      : "border-neutral-300 dark:border-neutral-700"
                  }`}
                  key={region.code}
                  onClick={() => {
                    setSpanishVoiceRegion(region.code);
                    setIsRegionPickerOpen(false);
                  }}
                  type="button"
                >
                  <FlagIcon className="h-9 w-9" code={region.flagCode} />
                </button>
              ))}
            </div>
          </div>
        ) : null}

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

const SPANISH_REEL_ROW_HEIGHT = 20;
const SPANISH_REEL_PEEK = 10;
const SPANISH_REEL_LOOPED_REGIONS = [
  ...SPANISH_VOICE_REGIONS,
  ...SPANISH_VOICE_REGIONS,
  ...SPANISH_VOICE_REGIONS
];

function SpanishRegionReel({
  isSelected,
  onLongPress,
  onRegionChange,
  onSelect,
  value
}: {
  isSelected: boolean;
  onLongPress: () => void;
  onRegionChange: (region: SpanishVoiceRegion) => void;
  onSelect: () => void;
  value: SpanishVoiceRegion;
}) {
  const regionCount = SPANISH_VOICE_REGIONS.length;
  const indexOfValue = (code: SpanishVoiceRegion) =>
    SPANISH_VOICE_REGIONS.findIndex((region) => region.code === code);

  const [virtualIndex, setVirtualIndex] = useState(
    () => indexOfValue(value) + regionCount
  );
  const [transitionEnabled, setTransitionEnabled] = useState(true);
  const lastRequestedValue = useRef(value);

  useEffect(() => {
    if (value === lastRequestedValue.current) return;

    lastRequestedValue.current = value;
    setTransitionEnabled(false);
    setVirtualIndex(indexOfValue(value) + regionCount);
  }, [value, regionCount]);

  useEffect(() => {
    if (transitionEnabled) return;

    const frame = requestAnimationFrame(() => setTransitionEnabled(true));
    return () => cancelAnimationFrame(frame);
  }, [transitionEnabled]);

  const handleTransitionEnd = () => {
    if (virtualIndex >= regionCount * 2) {
      setTransitionEnabled(false);
      setVirtualIndex((current) => current - regionCount);
    }
  };

  const offset = SPANISH_REEL_PEEK - virtualIndex * SPANISH_REEL_ROW_HEIGHT;

  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    longPressFired.current = false;
    clearLongPressTimer();
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      longPressTimer.current = null;
      onLongPress();
    }, LONG_PRESS_MS);
  };

  const handleClick = () => {
    clearLongPressTimer();

    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }

    const nextVirtualIndex = virtualIndex + 1;
    const nextRegion = SPANISH_VOICE_REGIONS[nextVirtualIndex % regionCount];

    lastRequestedValue.current = nextRegion.code;
    setVirtualIndex(nextVirtualIndex);
    onRegionChange(nextRegion.code);

    if (!isSelected) {
      onSelect();
    }
  };

  return (
    <button
      aria-checked={isSelected}
      aria-label="Spanish"
      className={`relative grid h-10 w-10 place-items-center overflow-hidden border outline-none transition-colors ${
        isSelected
          ? "border-neutral-950 bg-neutral-950/5 dark:border-neutral-100 dark:bg-neutral-100/10"
          : "border-neutral-300 dark:border-neutral-700"
      } focus-visible:border-neutral-950 dark:focus-visible:border-neutral-100`}
      onClick={handleClick}
      onPointerCancel={clearLongPressTimer}
      onPointerDown={handlePointerDown}
      onPointerLeave={clearLongPressTimer}
      onPointerUp={clearLongPressTimer}
      role="radio"
      type="button"
    >
      <div
        className={`absolute left-0 top-0 w-full ${
          transitionEnabled ? "transition-transform duration-200 ease-out" : ""
        }`}
        onTransitionEnd={handleTransitionEnd}
        style={{ transform: `translateY(${offset}px)` }}
      >
        {SPANISH_REEL_LOOPED_REGIONS.map((region, index) => (
          <div
            className="grid place-items-center"
            key={`${region.code}-${index}`}
            style={{ height: SPANISH_REEL_ROW_HEIGHT }}
          >
            <FlagIcon className="h-4 w-4" code={region.flagCode} />
          </div>
        ))}
      </div>
    </button>
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
  lastDictionaryLanguageCode,
  lastSpanishVoiceRegion,
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
  lastDictionaryLanguageCode: string;
  lastSpanishVoiceRegion: SpanishVoiceRegion;
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
              bookMetadataEdits[book.id],
              lastSpanishVoiceRegion,
              lastDictionaryLanguageCode
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
  currentUser,
  dictionaryLanguageCode,
  fontFamily,
  isSyncingState,
  languageCode,
  onPageChange,
  paragraphs,
  pageNumber,
  pageTotal,
  spanishVoiceRegion,
  title
}: {
  author: string;
  autoPlayWordAudio: boolean;
  chapterTitle?: string;
  currentUser: SyncUser | null;
  dictionaryLanguageCode: string;
  fontFamily: FontFamily;
  isSyncingState: boolean;
  languageCode: string;
  onPageChange: (pageNumber: number) => void;
  pageNumber: number;
  pageTotal: number;
  paragraphs: string[];
  spanishVoiceRegion: SpanishVoiceRegion;
  title: string;
}) {
  const spokenLanguageCode =
    languageCode === "es" ? spanishVoiceRegion : languageCode;
  const [pageDraft, setPageDraft] = useState(String(pageNumber));
  const [pinnedWords, setPinnedWords] = useState<Set<string>>(new Set());
  const [lookup, setLookup] = useState<WordLookupState | null>(null);
  const [wordLookupHighlight, setWordLookupHighlight] = useState<{
    paragraphIndex: number;
    tokenIndex: number;
  } | null>(null);
  const [sentenceLookup, setSentenceLookup] =
    useState<SentenceLookupState | null>(null);
  const [selectionRange, setSelectionRange] = useState<{
    maxIndex: number;
    minIndex: number;
    paragraphIndex: number;
  } | null>(null);
  const isSelecting = useRef(false);
  const selectionAnchorIndex = useRef(0);
  const sentenceLongPressTimer = useRef<number | null>(null);
  const suppressNextWordClick = useRef(false);
  const paragraphTokens = useMemo(
    () => paragraphs.map((paragraph) => tokenizeParagraphWithOffsets(paragraph)),
    [paragraphs]
  );

  useEffect(() => {
    setPageDraft(String(pageNumber));
  }, [pageNumber]);

  useEffect(() => {
    return () => {
      if (sentenceLongPressTimer.current) {
        window.clearTimeout(sentenceLongPressTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadPinnedWords(languageCode).then((words) => {
      if (!cancelled) setPinnedWords(words);
    });

    return () => {
      cancelled = true;
    };
  }, [languageCode]);

  const clearSentenceLongPress = () => {
    if (sentenceLongPressTimer.current) {
      window.clearTimeout(sentenceLongPressTimer.current);
      sentenceLongPressTimer.current = null;
    }
  };

  const startSelectionLongPress = (
    event: PointerEvent<HTMLButtonElement>,
    paragraphIndex: number,
    tokenIndex: number
  ) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    event.currentTarget.setPointerCapture(event.pointerId);

    clearSentenceLongPress();
    suppressNextWordClick.current = false;
    sentenceLongPressTimer.current = window.setTimeout(() => {
      sentenceLongPressTimer.current = null;
      suppressNextWordClick.current = true;
      isSelecting.current = true;
      selectionAnchorIndex.current = tokenIndex;
      setSelectionRange({ maxIndex: tokenIndex, minIndex: tokenIndex, paragraphIndex });
    }, LONG_PRESS_MS);
  };

  const handleSelectionPointerMove = (
    event: PointerEvent<HTMLButtonElement>,
    paragraphIndex: number
  ) => {
    if (!isSelecting.current) return;

    event.stopPropagation();

    const hovered = document.elementFromPoint(event.clientX, event.clientY);
    const tokenElement = hovered?.closest<HTMLElement>("[data-token-index]");
    if (!tokenElement) return;

    if (Number(tokenElement.dataset.paragraphIndex) !== paragraphIndex) return;

    const tokenIndex = Number(tokenElement.dataset.tokenIndex);

    setSelectionRange({
      maxIndex: Math.max(selectionAnchorIndex.current, tokenIndex),
      minIndex: Math.min(selectionAnchorIndex.current, tokenIndex),
      paragraphIndex
    });
  };

  const handleSelectionPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    clearSentenceLongPress();

    if (!isSelecting.current) return;

    event.stopPropagation();
    isSelecting.current = false;

    if (!selectionRange) return;

    const tokens = paragraphTokens[selectionRange.paragraphIndex];
    const text = tokens
      .slice(selectionRange.minIndex, selectionRange.maxIndex + 1)
      .map((token) => token.value)
      .join("")
      .trim();

    if (text) {
      translateSelection(text, event.currentTarget.getBoundingClientRect());
    }
  };

  const handleSelectionPointerCancel = (
    event: PointerEvent<HTMLButtonElement>
  ) => {
    clearSentenceLongPress();

    if (isSelecting.current) {
      event.stopPropagation();
      isSelecting.current = false;
      setSelectionRange(null);
    }
  };

  const translateSelection = (text: string, anchorRect: DOMRect) => {
    if (languageCode === dictionaryLanguageCode || languageCode === "und") {
      setSentenceLookup({
        anchorRect,
        error:
          languageCode === "und"
            ? "Set a book language to translate text."
            : "Text is already in your dictionary language.",
        isInstructional: true,
        sentence: text,
        status: "error"
      });
      return;
    }

    setSentenceLookup({
      anchorRect,
      sentence: text,
      status: "loading"
    });

    translateText(text, languageCode, dictionaryLanguageCode)
      .then((result) => {
        setSentenceLookup((current) =>
          current && current.sentence === text
            ? { ...current, result: result.text, status: "ready" }
            : current
        );
      })
      .catch((error: unknown) => {
        setSentenceLookup((current) =>
          current && current.sentence === text
            ? {
                ...current,
                error:
                  error instanceof Error ? error.message : "Translation failed.",
                status: "error"
              }
            : current
        );
      });
  };

  const handleSentenceDismiss = () => {
    setSentenceLookup(null);
    setSelectionRange(null);
  };

  const handleWordClick = (
    event: MouseEvent<HTMLButtonElement>,
    rawWord: string,
    paragraphIndex: number,
    tokenIndex: number
  ) => {
    clearSentenceLongPress();

    if (suppressNextWordClick.current) {
      suppressNextWordClick.current = false;
      return;
    }

    const word = normalizeWord(rawWord);
    const displayWord = rawWord.trim();
    const anchorRect = event.currentTarget.getBoundingClientRect();

    setWordLookupHighlight({ paragraphIndex, tokenIndex });

    if (languageCode === "und") {
      setLookup({
        anchorRect,
        displayWord,
        error: "Set a book language to look up words.",
        languageCode: spokenLanguageCode,
        pinned: pinnedWords.has(word),
        status: "error",
        word
      });
      return;
    }

    if (autoPlayWordAudio) {
      speakWord(word, spokenLanguageCode);
    }

    setLookup({
      anchorRect,
      displayWord,
      languageCode: spokenLanguageCode,
      pinned: pinnedWords.has(word),
      status: "loading",
      word
    });

    lookupWord(word, languageCode, dictionaryLanguageCode)
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

    const updatedAt = Date.now();
    setWordPinned(languageCode, word, nextPinned, updatedAt).catch(() => {});

    const token = getStoredSessionToken();
    if (currentUser && token) {
      pushPinnedWord(token, { languageCode, word, pinned: nextPinned, updatedAt });
    }
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
      className={`grid h-full grid-rows-[auto_1fr] overflow-hidden px-5 py-5 text-neutral-950 dark:text-neutral-100 sm:px-10 sm:py-7 ${
        fontFamily === "sans" ? "sans-serif-font" : ""
      }`}
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
                {paragraphTokens[paragraphIndex].map((token, tokenIndex) => {
                  const isHighlighted =
                    (selectionRange?.paragraphIndex === paragraphIndex &&
                      tokenIndex >= selectionRange.minIndex &&
                      tokenIndex <= selectionRange.maxIndex) ||
                    (wordLookupHighlight?.paragraphIndex === paragraphIndex &&
                      wordLookupHighlight?.tokenIndex === tokenIndex);

                  if (token.type === "word") {
                    const classNames = ["reader-word"];
                    if (pinnedWords.has(normalizeWord(token.value))) {
                      classNames.push("reader-word--pinned");
                    }
                    if (isHighlighted) {
                      classNames.push("sentence-highlight");
                    }

                    return (
                      <button
                        className={classNames.join(" ")}
                        data-paragraph-index={paragraphIndex}
                        data-token-index={tokenIndex}
                        key={tokenIndex}
                        onClick={(event) =>
                          handleWordClick(
                            event,
                            token.value,
                            paragraphIndex,
                            tokenIndex
                          )
                        }
                        onPointerCancel={handleSelectionPointerCancel}
                        onPointerDown={(event) =>
                          startSelectionLongPress(event, paragraphIndex, tokenIndex)
                        }
                        onPointerLeave={() => {
                          if (!isSelecting.current) clearSentenceLongPress();
                        }}
                        onPointerMove={(event) =>
                          handleSelectionPointerMove(event, paragraphIndex)
                        }
                        onPointerUp={handleSelectionPointerUp}
                        type="button"
                      >
                        {token.value}
                      </button>
                    );
                  }

                  return (
                    <span
                      className={isHighlighted ? "sentence-highlight" : ""}
                      data-paragraph-index={paragraphIndex}
                      data-token-index={tokenIndex}
                      key={tokenIndex}
                    >
                      {token.value}
                    </span>
                  );
                })}
              </p>
            ))}
          </div>
        </div>
      </div>

      {lookup ? (
        <WordLookupPopup
          lookup={lookup}
          onDismiss={() => {
            setLookup(null);
            setWordLookupHighlight(null);
          }}
          onTogglePin={handleTogglePin}
        />
      ) : null}

      {sentenceLookup ? (
        <SentenceLookupPopup
          lookup={sentenceLookup}
          onDismiss={handleSentenceDismiss}
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
    hasSeededDemoBook: false,
    isDarkMode: false,
    lastDictionaryLanguageCode: "en",
    lastSpanishVoiceRegion: "es",
    locallyDeletedContentHashes: [],
    openBookIds: [],
    readingProgressByBookId: {},
    savedPageByBookId: {},
    version: 1
  };
}

async function refreshBookCatalog() {
  return loadBookCatalog();
}

async function seedDemoBook() {
  const response = await fetch(DEMO_BOOK_PATH);
  if (!response.ok) return;

  const data = await response.arrayBuffer();
  const metadata = await loadEpubFromArrayBuffer(data.slice(0));
  const fingerprint = await computeContentHash(metadata);
  const title =
    metadata.title?.trim() || DEMO_BOOK_FILE_NAME.replace(/\.epub$/i, "");
  const author = metadata.author?.trim() || "Unknown";
  const now = Date.now();
  const id = `${slugify(title)}-${fingerprint.slice(0, 12)}`;

  await saveUploadedBook({
    book: {
      author,
      createdAt: now,
      fileName: DEMO_BOOK_FILE_NAME,
      fingerprint,
      id,
      language: metadata.language,
      size: data.byteLength,
      storageKey: id,
      title,
      updatedAt: now
    },
    data
  });
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
  const readingProgressByBookId = getPersistedReadingProgress(
    state.readingProgressByBookId
  );
  const locallyDeletedContentHashes = getPersistedContentHashes(
    state.locallyDeletedContentHashes
  );
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
    hasSeededDemoBook:
      typeof state.hasSeededDemoBook === "boolean"
        ? state.hasSeededDemoBook
        : defaultState.hasSeededDemoBook,
    isDarkMode:
      typeof state.isDarkMode === "boolean"
        ? state.isDarkMode
        : defaultState.isDarkMode,
    lastDictionaryLanguageCode: isDictionaryLanguageCode(
      state.lastDictionaryLanguageCode
    )
      ? state.lastDictionaryLanguageCode
      : defaultState.lastDictionaryLanguageCode,
    lastSpanishVoiceRegion: isSpanishVoiceRegion(state.lastSpanishVoiceRegion)
      ? state.lastSpanishVoiceRegion
      : defaultState.lastSpanishVoiceRegion,
    locallyDeletedContentHashes,
    openBookIds,
    readingProgressByBookId,
    savedPageByBookId,
    version: 1
  };
}

function getPersistedReadingProgress(value: unknown) {
  if (!isRecord(value)) return {};

  const progress: Record<string, ReadingProgressRecord> = {};

  for (const [bookId, record] of Object.entries(value)) {
    if (!isRecord(record)) continue;

    const { chapterId, paragraphIndex, updatedAt } = record;

    if (
      typeof chapterId === "string" &&
      typeof paragraphIndex === "number" &&
      typeof updatedAt === "number"
    ) {
      progress[bookId] = { chapterId, paragraphIndex, updatedAt };
    }
  }

  return progress;
}

function getPersistedContentHashes(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(value.filter((hash): hash is string => typeof hash === "string"))
  );
}

function isSpanishVoiceRegion(value: unknown): value is SpanishVoiceRegion {
  return value === "es" || value === "es-AR" || value === "es-MX";
}

function isDictionaryLanguageCode(value: unknown): value is string {
  return DICTIONARY_LANGUAGE_CHOICES.some((language) => language.code === value);
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
        dictionaryLanguageCode: isDictionaryLanguageCode(
          metadata.dictionaryLanguageCode
        )
          ? metadata.dictionaryLanguageCode
          : "en",
        fontFamily:
          metadata.fontFamily === "sans" || metadata.fontFamily === "serif"
            ? metadata.fontFamily
            : "serif",
        languageCode: getSupportedLanguageCode(languageCode),
        spanishVoiceRegion: isSpanishVoiceRegion(metadata.spanishVoiceRegion)
          ? metadata.spanishVoiceRegion
          : "es",
        title,
        updatedAt:
          typeof metadata.updatedAt === "number" ? metadata.updatedAt : undefined
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
  metadataEdit?: BookMetadataEdit,
  lastSpanishVoiceRegion: SpanishVoiceRegion = "es",
  lastDictionaryLanguageCode = "en"
): BookMetadataEdit {
  return {
    author:
      metadataEdit?.author.trim() ||
      loadedBook?.data?.author?.trim() ||
      book.author,
    dictionaryLanguageCode:
      metadataEdit?.dictionaryLanguageCode ?? lastDictionaryLanguageCode,
    fontFamily: metadataEdit?.fontFamily ?? "serif",
    languageCode: normalizeLanguageCode(
      metadataEdit?.languageCode.trim() ||
        loadedBook?.data?.language ||
        book.language ||
        "und"
    ),
    spanishVoiceRegion: metadataEdit?.spanishVoiceRegion ?? lastSpanishVoiceRegion,
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

function getRootClassName(isDarkMode: boolean) {
  return isDarkMode ? "dark" : "";
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
