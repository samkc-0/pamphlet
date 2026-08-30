// Trims a kaikki.org Wiktionary JSONL dump down to { word: string[] } —
// just the glosses a lookup popup actually shows, dropping etymology,
// pronunciation, synonyms, categories, and cross-reference links.
//
// Usage: bun run scripts/dictionary/trim.ts <input.jsonl> <output.json>

import { createReadStream, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";

type WiktextractSense = {
  glosses?: string[];
};

type WiktextractEntry = {
  word?: string;
  senses?: WiktextractSense[];
};

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    console.error("Usage: bun run scripts/dictionary/trim.ts <input.jsonl> <output.json>");
    process.exit(1);
  }

  const inputSize = statSync(inputPath).size;
  console.log(`Reading ${inputPath} (${(inputSize / 1024 / 1024).toFixed(1)}MB)...`);

  const words = new Map<string, string[]>();
  let lineCount = 0;
  let skipped = 0;

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
      skipped++;
      continue;
    }

    const word = entry.word;
    if (!word) {
      skipped++;
      continue;
    }

    const glosses = (entry.senses ?? [])
      .flatMap((sense) => sense.glosses ?? [])
      .filter((gloss) => Boolean(gloss?.trim()));

    if (glosses.length === 0) continue;

    const existing = words.get(word);
    if (existing) {
      for (const gloss of glosses) {
        if (!existing.includes(gloss)) existing.push(gloss);
      }
    } else {
      words.set(word, [...new Set(glosses)]);
    }

    if (lineCount % 200000 === 0) {
      console.log(`  ...${lineCount} lines read, ${words.size} words so far`);
    }
  }

  const output = Object.fromEntries(words);
  const json = JSON.stringify(output);
  await writeFile(outputPath, json);

  console.log(`\nRead ${lineCount} lines (${skipped} skipped/unparseable).`);
  console.log(`Kept ${words.size} words with definitions.`);
  console.log(`Wrote ${outputPath} (${(json.length / 1024 / 1024).toFixed(2)}MB).`);
}

main();
