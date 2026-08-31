import { dictionaryKeyFor } from "@/lib/dictionary-catalog";
import { loadDictionary, type StoredDictionary } from "@/lib/dictionaries-db";

export type WordLookupResult = {
  definitions: string[];
  kind: "definition" | "translation";
};

type DictionaryApiEntry = {
  meanings: {
    definitions: { definition: string }[];
  }[];
};

// Loaded offline datasets, kept in memory for the rest of the session once
// fetched from IndexedDB — a lookup is then a plain object property access,
// not a repeated IndexedDB round-trip. `null` marks "checked, not
// downloaded" so we don't keep re-checking IndexedDB for the same pair.
const offlineDictionaryCache = new Map<string, StoredDictionary | null>();

async function getOfflineDictionary(
  key: string
): Promise<StoredDictionary | null> {
  const cached = offlineDictionaryCache.get(key);
  if (cached !== undefined) return cached;

  const loaded = (await loadDictionary(key).catch(() => undefined)) ?? null;
  offlineDictionaryCache.set(key, loaded);
  return loaded;
}

// Clears the in-memory cache entry for a dataset, so the settings screen
// downloading/deleting it takes effect on the next lookup instead of
// reusing a stale "not downloaded" result from earlier this session.
export function invalidateOfflineDictionaryCache(key: string) {
  offlineDictionaryCache.delete(key);
}

function lookupOffline(
  dictionary: StoredDictionary,
  word: string
): string[] | undefined {
  const direct = dictionary.lemmas[word];
  if (direct) return direct;

  const lemma = dictionary.forms[word];
  if (lemma) return dictionary.lemmas[lemma];

  // Running text often capitalizes a word (start of a sentence) that's
  // stored under its lowercase dictionary form.
  const lower = word.toLowerCase();
  if (lower === word) return undefined;

  const directLower = dictionary.lemmas[lower];
  if (directLower) return directLower;

  const lemmaLower = dictionary.forms[lower];
  return lemmaLower ? dictionary.lemmas[lemmaLower] : undefined;
}

export async function lookupWord(
  word: string,
  bookLanguageCode: string,
  dictionaryLanguageCode: string
): Promise<WordLookupResult> {
  const offline = await getOfflineDictionary(
    dictionaryKeyFor(bookLanguageCode, dictionaryLanguageCode)
  );
  const offlineGlosses = offline ? lookupOffline(offline, word) : undefined;

  if (offlineGlosses?.length) {
    return {
      definitions: offlineGlosses,
      kind: bookLanguageCode === dictionaryLanguageCode ? "definition" : "translation"
    };
  }

  if (bookLanguageCode === dictionaryLanguageCode) {
    return lookupDefinition(word, dictionaryLanguageCode);
  }

  return translateText(word, bookLanguageCode, dictionaryLanguageCode);
}

async function lookupDefinition(
  word: string,
  languageCode: string
): Promise<WordLookupResult> {
  const response = await fetchWithRetry(
    `https://api.dictionaryapi.dev/api/v2/entries/${languageCode}/${encodeURIComponent(word)}`
  );

  if (!response.ok) {
    throw new Error("No definition found.");
  }

  const entries = (await response.json()) as DictionaryApiEntry[];
  const definition = entries
    .flatMap((entry) => entry.meanings)
    .flatMap((meaning) => meaning.definitions)
    .map((definitionEntry) => definitionEntry.definition)
    .find((definitionText) => Boolean(definitionText));

  if (!definition) {
    throw new Error("No definition found.");
  }

  return { definitions: [definition], kind: "definition" };
}

export async function translateText(
  text: string,
  sourceLanguageCode: string,
  targetLanguageCode: string
): Promise<WordLookupResult> {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", sourceLanguageCode);
  url.searchParams.set("tl", targetLanguageCode);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  const response = await fetchWithRetry(url);

  if (!response.ok) {
    throw new Error("No translation found.");
  }

  const translation = extractTranslation(await response.json());

  if (!translation) {
    throw new Error("No translation found.");
  }

  return { definitions: [translation], kind: "translation" };
}

async function fetchWithRetry(
  input: string | URL,
  retriesLeft = 1
): Promise<Response> {
  try {
    const response = await fetch(input);

    if (!response.ok && response.status >= 500 && retriesLeft > 0) {
      await wait(400);
      return fetchWithRetry(input, retriesLeft - 1);
    }

    return response;
  } catch (error) {
    if (retriesLeft > 0) {
      await wait(400);
      return fetchWithRetry(input, retriesLeft - 1);
    }

    throw error;
  }
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function extractTranslation(payload: unknown): string | undefined {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) return undefined;

  const translation = payload[0]
    .map((segment) => (Array.isArray(segment) ? segment[0] : undefined))
    .filter((segment): segment is string => typeof segment === "string")
    .join("");

  return translation || undefined;
}
