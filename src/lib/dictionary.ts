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
  languageCode: string
): Promise<WordLookupResult> {
  if (languageCode === "en" || languageCode === "und") {
    return lookupDefinition(word);
  }

  return lookupTranslation(word, languageCode);
}

async function lookupDefinition(word: string): Promise<WordLookupResult> {
  const response = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
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

async function lookupTranslation(
  word: string,
  languageCode: string
): Promise<WordLookupResult> {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", languageCode);
  url.searchParams.set("tl", "en");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", word);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("No translation found.");
  }

  const translation = extractTranslation(await response.json());

  if (!translation) {
    throw new Error("No translation found.");
  }

  return { kind: "translation", text: translation };
}

function extractTranslation(payload: unknown): string | undefined {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) return undefined;

  const translation = payload[0]
    .map((segment) => (Array.isArray(segment) ? segment[0] : undefined))
    .filter((segment): segment is string => typeof segment === "string")
    .join("");

  return translation || undefined;
}
