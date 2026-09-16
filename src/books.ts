export type BookSource = {
  author: string;
  createdAt: number;
  fileName: string;
  fingerprint: string;
  id: string;
  // Absent (or "book") is an uploaded/synced epub, read-only. "notebook" is
  // an editable, freeform notebook that otherwise flows through the exact
  // same catalog/pagination/reader pipeline as a book.
  kind?: "book" | "notebook";
  language?: string;
  size: number;
  storageKey: string;
  title: string;
  updatedAt: number;
};
