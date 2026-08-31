import { dictionaryKeyFor } from "@/lib/dictionary-catalog";
import { loadDictionary, type StoredDictionary } from "@/lib/dictionaries-db";

// One "sense group": either a word's own definitions, or the definitions
// of one lemma it's a conjugated/inflected form of (baseForm set, so the
// UI can show e.g. "conjugation of poder"). A word can produce more than
// one of these — it can be a headword in its own right *and* a form of
// something else, or a form of several different lemmas at once (Spanish
// "podemos" is a form of both "podar" and "poder").
export type WordSense = {
  baseForm?: string;
  definitions: string[];
};

export type WordLookupResult = {
  kind: "definition" | "translation";
  senses: WordSense[];
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

function lookupOffline(dictionary: StoredDictionary, word: string): WordSense[] {
  const senses: WordSense[] = [];

  const own = dictionary.lemmas[word];
  if (own?.length) senses.push({ definitions: own });

  for (const baseForm of dictionary.forms[word] ?? []) {
    const definitions = dictionary.lemmas[baseForm];
    if (definitions?.length) senses.push({ baseForm, definitions });
  }

  if (senses.length > 0) return senses;

  // Running text often capitalizes a word (start of a sentence) that's
  // stored under its lowercase dictionary form.
  const lower = word.toLowerCase();
  return lower === word ? [] : lookupOffline(dictionary, lower);
}

export async function lookupWord(
  word: string,
  bookLanguageCode: string,
  dictionaryLanguageCode: string
): Promise<WordLookupResult> {
  const offline = await getOfflineDictionary(
    dictionaryKeyFor(bookLanguageCode, dictionaryLanguageCode)
  );
  const offlineSenses = offline ? lookupOffline(offline, word) : [];

  if (offlineSenses.length > 0) {
    return {
      kind: bookLanguageCode === dictionaryLanguageCode ? "definition" : "translation",
      senses: offlineSenses
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

  return { kind: "definition", senses: [{ definitions: [definition] }] };
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

  return { kind: "translation", senses: [{ definitions: [translation] }] };
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
