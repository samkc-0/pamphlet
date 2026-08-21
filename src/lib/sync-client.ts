const SESSION_TOKEN_STORAGE_KEY = "pamphlet-session-token";
const SESSION_QUERY_PARAM = "session";

export type SyncUser = {
  id: string;
  email: string;
  name: string;
};

export function getSyncApiUrl() {
  return import.meta.env.VITE_SYNC_API_URL ?? "http://localhost:8080";
}

export function getGoogleSignInUrl() {
  return `${getSyncApiUrl()}/auth/google/login`;
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
