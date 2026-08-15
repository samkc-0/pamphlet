import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const booksDirectory = path.resolve("public/books");
const outputPath = path.resolve("src/books.ts");

const files = (await readdir(booksDirectory))
  .filter((file) => file.toLowerCase().endsWith(".epub"))
  .sort((left, right) => left.localeCompare(right, undefined, {
    sensitivity: "base"
  }));

const books = files.map((file) => {
  const { author, title } = parseBookName(file);

  return {
    author,
    id: slugify(file),
    title,
    url: `/books/${encodePathSegment(file)}`
  };
});

const source = `export type BookSource = {
  author: string;
  id: string;
  title: string;
  url: string;
};

export const BOOKS: BookSource[] = ${JSON.stringify(books, null, 2)};
`;

await writeFile(outputPath, source);
console.log(`Generated ${path.relative(process.cwd(), outputPath)} with ${books.length} books.`);

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

function encodePathSegment(input) {
  return encodeURIComponent(input).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
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
