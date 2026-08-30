import type { EpubSection } from "@/lib/epub";

const SESSION_TOKEN_STORAGE_KEY = "pamphlet-session-token";
const SESSION_QUERY_PARAM = "session";
export const AUTH_POPUP_MESSAGE_TYPE = "pamphlet-auth";

export type SyncUser = {
  id: string;
  email: string;
  name: string;
};

export type SyncedBookSummary = {
  contentHash: string;
  title: string;
  author: string;
  language: string;
};

export type SyncedBookContent = {
  title: string;
  author: string;
  language: string;
  chapters: EpubSection[];
};

export type SyncedProgress = {
  contentHash: string;
  chapterId: string;
  paragraphIndex: number;
  updatedAt: number;
};

export type SyncedPinnedWord = {
  languageCode: string;
  word: string;
  updatedAt: number;
};

// The backend's models encode Go time.Time as RFC3339 strings; local state
// keeps timestamps as epoch milliseconds (compact, easy to compare). These
// two helpers are the only place that conversion happens.
function toWireTimestamp(updatedAt: number) {
  return new Date(updatedAt).toISOString();
}

function fromWireTimestamp(updatedAt: string) {
  return new Date(updatedAt).getTime();
}

async function authorizedFetch(
  path: string,
  token: string,
  init?: RequestInit
) {
  return fetch(`${getSyncApiUrl()}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`
    }
  });
}

export function getSyncApiUrl() {
  return import.meta.env.VITE_SYNC_API_URL ?? "http://localhost:8080";
}

export function getSyncApiOrigin() {
  return new URL(getSyncApiUrl()).origin;
}

export function getGoogleSignInUrl() {
  return `${getSyncApiUrl()}/auth/google/login`;
}

/**
 * Opens the Google sign-in flow in a popup window rather than navigating
 * the current tab, so the app never leaves the screen the user was on.
 * The popup posts a `pamphlet-auth` message back with the session token
 * once the backend's OAuth callback completes, then closes itself.
 */
export function openGoogleSignInPopup(): Window | null {
  return window.open(
    getGoogleSignInUrl(),
    "pamphlet-google-signin",
    "width=480,height=640"
  );
}

export function getStoredSessionToken(): string | null {
  return window.localStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
}

export function setStoredSessionToken(token: string) {
  window.localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
}

export function clearStoredSessionToken() {
  window.localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
}

/**
 * Reads the `?session=` token left in the URL by the backend's OAuth
 * callback redirect, persists it, and strips it from the URL bar.
 */
export function consumeSessionTokenFromLocation(): string | null {
  const url = new URL(window.location.href);
  const token = url.searchParams.get(SESSION_QUERY_PARAM);

  if (!token) return null;

  setStoredSessionToken(token);
  url.searchParams.delete(SESSION_QUERY_PARAM);
  window.history.replaceState(null, "", url.toString());

  return token;
}

export async function fetchCurrentUser(
  token: string
): Promise<SyncUser | null> {
  const response = await fetch(`${getSyncApiUrl()}/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) return null;

  return (await response.json()) as SyncUser;
}

export async function endSession(token: string) {
  await fetch(`${getSyncApiUrl()}/auth/logout`, {
    headers: { Authorization: `Bearer ${token}` },
    method: "POST"
  }).catch(() => {});
}

/**
 * Uploads a book's extracted plain-text content, keyed by content hash.
 * Fire-and-forget by convention at call sites: sync must never block or
 * break local-only usage, so this only ever logs a failure.
 */
export async function pushBook(
  token: string,
  book: {
    contentHash: string;
    title: string;
    author: string;
    language?: string;
    chapters: EpubSection[];
  }
) {
  await authorizedFetch("/books", token, {
    method: "POST",
    body: JSON.stringify(book)
  }).catch((error: unknown) => {
    console.error("Failed to sync book to server.", error);
  });
}

/** Lists the signed-in user's synced books without their content, for diffing against the local catalog. */
export async function fetchBookCatalog(
  token: string
): Promise<SyncedBookSummary[]> {
  const response = await authorizedFetch("/books", token);
  if (!response.ok) return [];
  return (await response.json()) as SyncedBookSummary[];
}

export async function fetchBookContent(
  token: string,
  contentHash: string
): Promise<SyncedBookContent | null> {
  const response = await authorizedFetch(
    `/books/${encodeURIComponent(contentHash)}`,
    token
  );
  if (!response.ok) return null;
  return (await response.json()) as SyncedBookContent;
}

export async function pushProgress(
  token: string,
  contentHash: string,
  progress: { chapterId: string; paragraphIndex: number; updatedAt: number }
) {
  await authorizedFetch(`/progress/${encodeURIComponent(contentHash)}`, token, {
    method: "POST",
    body: JSON.stringify({
      chapterId: progress.chapterId,
      paragraphIndex: progress.paragraphIndex,
      updatedAt: toWireTimestamp(progress.updatedAt)
    })
  }).catch((error: unknown) => {
    console.error("Failed to sync reading progress to server.", error);
  });
}

export async function fetchAllProgress(
  token: string
): Promise<SyncedProgress[]> {
  const response = await authorizedFetch("/progress", token);
  if (!response.ok) return [];

  const records = (await response.json()) as Array<{
    contentHash: string;
    chapterId: string;
    paragraphIndex: number;
    updatedAt: string;
  }>;

  return records.map((record) => ({
    contentHash: record.contentHash,
    chapterId: record.chapterId,
    paragraphIndex: record.paragraphIndex,
    updatedAt: fromWireTimestamp(record.updatedAt)
  }));
}

export async function pushPinnedWord(
  token: string,
  entry: {
    languageCode: string;
    word: string;
    pinned: boolean;
    updatedAt: number;
  }
) {
  await authorizedFetch("/pinned-words", token, {
    method: "POST",
    body: JSON.stringify({
      languageCode: entry.languageCode,
      word: entry.word,
      pinned: entry.pinned,
      updatedAt: toWireTimestamp(entry.updatedAt)
    })
  }).catch((error: unknown) => {
    console.error("Failed to sync pinned word to server.", error);
  });
}

/** Lists the signed-in user's currently-pinned words (unpinned words are never returned). */
export async function fetchAllPinnedWords(
  token: string
): Promise<SyncedPinnedWord[]> {
  const response = await authorizedFetch("/pinned-words", token);
  if (!response.ok) return [];

  const records = (await response.json()) as Array<{
    languageCode: string;
    word: string;
    updatedAt: string;
  }>;

  return records.map((record) => ({
    languageCode: record.languageCode,
    word: record.word,
    updatedAt: fromWireTimestamp(record.updatedAt)
  }));
}
