// Built by the pamphlet-project repo's scripts/dictionary/ (kaikki.org
// Wiktionary dumps, trimmed to headword -> gloss + inflected-form ->
// headword). See its DEPLOY.md for how these get onto the server.
export type DictionaryCatalogEntry = {
  approxSizeMB: number;
  key: string;
  label: string;
  languageCode: string;
  targetLanguageCode: string;
};

export const DICTIONARY_CATALOG: DictionaryCatalogEntry[] = [
  {
    approxSizeMB: 98.4,
    key: "fr-fr",
    label: "French",
    languageCode: "fr",
    targetLanguageCode: "fr"
  },
  {
    approxSizeMB: 94.2,
    key: "en-en",
    label: "English",
    languageCode: "en",
    targetLanguageCode: "en"
  },
  {
    approxSizeMB: 23.3,
    key: "es-es",
    label: "Spanish",
    languageCode: "es",
    targetLanguageCode: "es"
  },
  {
    approxSizeMB: 13.5,
    key: "it-it",
    label: "Italian",
    languageCode: "it",
    targetLanguageCode: "it"
  },
  {
    approxSizeMB: 18.7,
    key: "it-en",
    label: "Italian → English",
    languageCode: "it",
    targetLanguageCode: "en"
  },
  {
    approxSizeMB: 21.0,
    key: "es-en",
    label: "Spanish → English",
    languageCode: "es",
    targetLanguageCode: "en"
  },
  {
    approxSizeMB: 11.8,
    key: "fr-en",
    label: "French → English",
    languageCode: "fr",
    targetLanguageCode: "en"
  }
];

export function dictionaryKeyFor(
  languageCode: string,
  targetLanguageCode: string
) {
  return `${languageCode}-${targetLanguageCode}`;
}
