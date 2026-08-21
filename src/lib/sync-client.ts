const SESSION_TOKEN_STORAGE_KEY = "pamphlet-session-token";
const SESSION_QUERY_PARAM = "session";
export const AUTH_POPUP_MESSAGE_TYPE = "pamphlet-auth";

export type SyncUser = {
  id: string;
  email: string;
  name: string;
};

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
