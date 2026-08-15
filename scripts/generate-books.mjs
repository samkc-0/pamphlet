import { copyFile, mkdir, readdir, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const assetDirectory = path.resolve("public/book-assets");
const booksDirectory = path.resolve("public/books");
const databasePath = path.resolve("public/books.sqlite");
const outputPath = path.resolve("src/books.ts");
const sqlWasmInputPath = path.resolve("node_modules/sql.js/dist/sql-wasm.wasm");
const sqlWasmOutputPath = path.resolve("public/sql-wasm.wasm");

const files = (await readdir(booksDirectory))
  .filter((file) => file.toLowerCase().endsWith(".epub"))
  .sort((left, right) => left.localeCompare(right, undefined, {
    sensitivity: "base"
  }));

await rm(assetDirectory, { force: true, recursive: true });
await mkdir(assetDirectory, { recursive: true });

const usedSlugs = new Set();

const books = await Promise.all(files.map(async (file) => {
  const { author, title } = parseBookName(file);
  const id = uniqueSlug(slugify(file), usedSlugs);
  const alias = `${id}.epub`;

  await copyFile(
    path.join(booksDirectory, file),
    path.join(assetDirectory, alias)
  );

  return {
    author,
    id,
    sourceFile: file,
    title,
    url: `/book-assets/${alias}`
  };
}));

const source = `export type BookSource = {
  author: string;
  id: string;
  title: string;
  url: string;
};

export const BOOKS_DATABASE_URL = "/books.sqlite";
export const SQL_WASM_URL = "/sql-wasm.wasm";
`;

await writeBooksDatabase(books);
await copyFile(sqlWasmInputPath, sqlWasmOutputPath);
await writeFile(outputPath, source);
console.log(`Generated ${path.relative(process.cwd(), databasePath)} with ${books.length} books.`);

function parseBookName(file) {
  const name = file.replace(/\.epub$/i, "");
  const parts = name.split(" -- ").map((part) => part.trim()).filter(Boolean);

  if (parts.length >= 2) {
    return {
      author: cleanAuthor(parts[1]),
      title: cleanTitle(parts[0])
    };
  }

  const dashParts = name.split(" - ").map((part) => part.trim()).filter(Boolean);

  if (dashParts.length >= 2) {
    if (looksLikePersonName(dashParts[1]) && !looksLikePersonName(dashParts[0])) {
      return {
        author: cleanAuthor(dashParts[1]),
        title: cleanTitle(dashParts[0])
      };
    }

    return {
      author: cleanAuthor(dashParts[0]),
      title: cleanTitle(dashParts.slice(1).join(" - "))
    };
  }

  return {
    author: "Unknown",
    title: cleanTitle(name)
  };
}

function cleanAuthor(author) {
  return author
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(title) {
  return title
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(input) {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\.epub$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function looksLikePersonName(value) {
  const normalized = value.replace(/\([^)]*\)/g, "").trim();
  const words = normalized.split(/\s+/).filter(Boolean);

  return (
    normalized.includes(",") ||
    (words.length >= 2 &&
      words.length <= 4 &&
      words.every((word) => /^\p{Lu}/u.test(word)))
  );
}

function uniqueSlug(slug, usedSlugs) {
  const fallbackSlug = slug || "book";
  let candidate = fallbackSlug;
  let index = 2;

  while (usedSlugs.has(candidate)) {
    candidate = `${fallbackSlug}-${index}`;
    index += 1;
  }

  usedSlugs.add(candidate);
  return candidate;
}

async function writeBooksDatabase(books) {
  await unlink(databasePath).catch((error) => {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  });

  const database = new DatabaseSync(databasePath);

  try {
    database.exec(`
      PRAGMA journal_mode = DELETE;
      PRAGMA user_version = 1;

      CREATE TABLE books (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        url TEXT NOT NULL,
        source_file TEXT NOT NULL,
        sort_index INTEGER NOT NULL
      );

      CREATE INDEX books_sort_index ON books(sort_index);
    `);

    const insertBook = database.prepare(`
      INSERT INTO books (
        id,
        title,
        author,
        url,
        source_file,
        sort_index
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    database.exec("BEGIN");

    for (const [index, book] of books.entries()) {
      insertBook.run(
        book.id,
        book.title,
        book.author,
        book.url,
        book.sourceFile,
        index
      );
    }

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.close();
  }
}
