export type WordLookupResult = {
  kind: "definition" | "translation";
  text: string;
};

type DictionaryApiEntry = {
  meanings: {
    definitions: { definition: string }[];
  }[];
};

export async function lookupWord(
  word: string,
  bookLanguageCode: string,
  dictionaryLanguageCode: string
): Promise<WordLookupResult> {
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

  return { kind: "definition", text: definition };
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

  return { kind: "translation", text: translation };
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
