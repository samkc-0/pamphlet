# Pamphlet

Pamphlet is an offline-first EPUB reader for keeping several books open at
once. Its interface is a two-dimensional reading space: swipe horizontally
through pages and vertically between books, the library, and settings. You
can also create editable notebooks alongside your books.

## What you can do

- Read EPUBs offline; books and reading state are stored in your browser.
- Keep up to five books open in the reading space at once.
- Look up words and translate selected sentences, with optional speech.
- Download offline dictionaries, and pin useful words and sentences.
- Create notebooks with movable text boxes and send lookups into them.
- Sign in with Google to sync books, notebooks, reading progress, pinned
  items, settings, book details, and your last active screen across devices.

In the library, selecting a book opens it in the reading space; it does not
jump directly to its pages. Swipe vertically to its row, then horizontally
to read. Long-press a book title to edit its details or remove it.

## Run locally

Requirements: [Bun](https://bun.sh/) and a modern browser.

```sh
bun install
bun run dev
```

The development server prints its local URL. To make a production build:

```sh
bun run build
bun run preview
```

Google sign-in and cross-device sync require the separate `pamphlet-sync`
backend. The reader itself remains usable without signing in or a network
connection after books and any desired dictionaries have been downloaded.

## Project links

- Backend: [`pamphlet-sync`](../pamphlet-sync)
- Dictionary build and deployment notes: [`pamphlet-project`](../)
- Development conventions and known limitations: [`AGENTS.md`](AGENTS.md)
