// Like trim.ts, but splits the dump into two small files instead of one big
// one:
//   - <out>.json        word -> gloss[] for lemma (headword) entries only
//   - <out>.forms.json   inflected-form -> lemma, for resolving what the
//                        reader actually tapped (a conjugated verb, a
//                        plural, etc.) back to its headword
//
// Wiktionary tags every inflected form explicitly ("tags": ["form-of"],
// "form_of": [{"word": "<lemma>"}]), so this is a lookup, not a guess.
//
// Usage: bun run scripts/dictionary/trim-lemma.ts <input.jsonl> <outBase>

import { createReadStream, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";

type WiktextractSense = {
  glosses?: string[];
  tags?: string[];
  form_of?: { word?: string }[];
};

type WiktextractEntry = {
  word?: string;
  tags?: string[];
  senses?: WiktextractSense[];
};

async function main() {
  const [inputPath, outBase] = process.argv.slice(2);
  if (!inputPath || !outBase) {
    console.error("Usage: bun run scripts/dictionary/trim-lemma.ts <input.jsonl> <outBase>");
    process.exit(1);
  }

  const inputSize = statSync(inputPath).size;
  console.log(`Reading ${inputPath} (${(inputSize / 1024 / 1024).toFixed(1)}MB)...`);

  const lemmas = new Map<string, string[]>();
  const forms = new Map<string, string>();
  let lineCount = 0;
  let lemmaEntries = 0;
  let formEntries = 0;

  const rl = createInterface({
    input: createReadStream(inputPath, { encoding: "utf-8" }),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    lineCount++;
    if (!line.trim()) continue;

    let entry: WiktextractEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const word = entry.word;
    if (!word) continue;

    // Some editions tag "form-of" on the entry itself; others only tag it
    // per-sense. Check both.
    const isFormOf =
      (entry.tags ?? []).includes("form-of") ||
      (entry.senses ?? []).some((sense) => (sense.tags ?? []).includes("form-of"));

    if (isFormOf) {
      formEntries++;
      // Point this surface form at the first lemma any sense names.
      if (forms.has(word)) continue;
      const lemma = entry.senses
        ?.flatMap((sense) => sense.form_of ?? [])
        .map((formOf) => formOf.word)
        .find(Boolean);
      if (lemma && lemma !== word) {
        forms.set(word, lemma);
      }
      continue;
    }

    lemmaEntries++;
    const glosses = (entry.senses ?? [])
      .flatMap((sense) => sense.glosses ?? [])
      .filter((gloss) => Boolean(gloss?.trim()));
    if (glosses.length === 0) continue;

    const existing = lemmas.get(word);
    if (existing) {
      for (const gloss of glosses) {
        if (!existing.includes(gloss)) existing.push(gloss);
      }
    } else {
      lemmas.set(word, [...new Set(glosses)]);
    }

    if (lineCount % 200000 === 0) {
      console.log(`  ...${lineCount} lines read`);
    }
  }

  // Don't keep a redirect for anything that's already a lemma with its own
  // definition, or that points at a lemma we never saw defined.
  for (const [form, lemma] of forms) {
    if (lemmas.has(form) || !lemmas.has(lemma)) {
      forms.delete(form);
    }
  }

  const lemmaJson = JSON.stringify(Object.fromEntries(lemmas));
  const formsJson = JSON.stringify(Object.fromEntries(forms));

  await writeFile(`${outBase}.json`, lemmaJson);
  await writeFile(`${outBase}.forms.json`, formsJson);

  console.log(`\nRead ${lineCount} lines: ${lemmaEntries} lemma entries, ${formEntries} form-of entries.`);
  console.log(`Kept ${lemmas.size} defined lemmas, ${forms.size} usable form redirects.`);
  console.log(`Wrote ${outBase}.json (${(lemmaJson.length / 1024 / 1024).toFixed(2)}MB)`);
  console.log(`Wrote ${outBase}.forms.json (${(formsJson.length / 1024 / 1024).toFixed(2)}MB)`);
  console.log(`Total: ${((lemmaJson.length + formsJson.length) / 1024 / 1024).toFixed(2)}MB`);
}

main();
