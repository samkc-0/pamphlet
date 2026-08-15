import initSqlJs from "sql.js";

import {
  BOOKS_DATABASE_URL,
  SQL_WASM_URL,
  type BookSource
} from "@/books";

let catalogPromise: Promise<BookSource[]> | null = null;

export function loadBookCatalog() {
  catalogPromise ??= readBookCatalog();
  return catalogPromise;
}

async function readBookCatalog(): Promise<BookSource[]> {
  const [SQL, response] = await Promise.all([
    initSqlJs({
      locateFile: () => SQL_WASM_URL
    }),
    fetch(BOOKS_DATABASE_URL)
  ]);

  if (!response.ok) {
    throw new Error(`Failed to load book catalog: ${response.status}`);
  }

  const database = new SQL.Database(new Uint8Array(await response.arrayBuffer()));

  try {
    const [result] = database.exec(`
      SELECT id, title, author, url
      FROM books
      ORDER BY sort_index ASC
    `);

    if (!result) {
      return [];
    }

    return result.values.map((row) => ({
      id: readTextColumn(row, 0),
      title: readTextColumn(row, 1),
      author: readTextColumn(row, 2),
      url: readTextColumn(row, 3)
    }));
  } finally {
    database.close();
  }
}

function readTextColumn(row: unknown[], index: number) {
  const value = row[index];

  if (typeof value !== "string") {
    throw new Error("Book catalog contains an invalid row.");
  }

  return value;
}
