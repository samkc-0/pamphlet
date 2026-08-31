# Pamphlet

Pamphlet is an e-reader that makes it easier to have multiple novels on the go at once, maybe in different languages. Currently only supports ePub & five books open at a time.

UX is inspired by pamphlets, tourist guides, and maybe a little bit by reels.

It's meant to feel like a big 2D book: you don't just turn pages left and right, but up and down too. Vertical navigation moves between contexts (i.e. individual books, your library, user settings). Horizontal navigation moves through a context (usually the pages of a book).

## Features

- **Offline-first reading** — books live in IndexedDB; the app works with no connection once a book is loaded.
- **Word lookups** — tap a word for its definition (or a translation, if you're reading in a language other than your dictionary language). Multiple senses show as a numbered list, and a conjugated word shows which infinitive/headword it's a form of.
- **Offline dictionaries** — download a language's dictionary (Settings → swipe right) for instant, connection-free lookups; falls back to an online dictionary/Google Translate for anything not downloaded.
- **Sentence lookups** — select a run of text for a full-sentence translation.
- **Pinned words** — pin words you look up to build a personal vocabulary list per book.
- **Google sign-in + cross-device sync** — signed-in users sync book content, reading progress, pinned words, settings, per-book metadata overrides, and even which screen they were on, across devices.
- **Dark mode**, an animations toggle, and a word-audio auto-play toggle, all in Settings.

One unintuitive UI aspect worth calling out: clicking on a book in your library _does not take you to that book_! It merely sets it to _open_. An open book gets an icon next to its title indicating which row it occupies, and you swipe vertically to that row to start swiping horizontally through its pages. You can rename books, delete them, and set their language by long-pressing their title.

The layout is something like this — swipe between screens, or navigate with <kbd>←</kbd><kbd>↓</kbd><kbd>↑</kbd><kbd>→</kbd>:

```
                                                                                   
                                                                                   
                                ┌───────────────┐                                  
                                │               │                                  
                                │               │                                  
                                │               │                                  
                                │   settings    │                                  
                                │               │                                  
           App opens here       │               │                                  
                │               │               │                                  
                │               │               │                                  
                └────────────┐  └──────┬────────┘                                  
                             └─────┐   │                                           
            ┌───────────────┐   ┌──┼───┴────────┐   ┌───────────────┐              
            │               │   │  │            │   │               │              
            │               │   │  ▀            │   │               │              
            │               │   │   library     │   │    library    │              
            │  upload book  │   │               │   │               │              
            │               ┼───┤               ┼───┤               │              
            │               │   │     (1)       │   │      (2)      │              
            │               │   │               │   │               │              
            │               │   │               │   │               │              
            └───────────────┘   └──────┬────────┘   └───────────────┘              
                                       │                                           
            ┌───────────────┐   ┌──────┴────────┐   ┌───────────────┐              
            │               │   │               │   │               │              
            │               │   │  current      │   │               │              
            │               │   │   page of     │   │               │              
            │   previous    │   │    book 1     │   │               │              
            │    page       ┼───┤               ┼───┤  next page    │              
            │               │   │               │   │               │              
            │               │   │               │   │               │              
            │               │   │               │   │               │              
            └───────────────┘   └──────┬────────┘   └───────────────┘              
                                       │                                           
            ┌───────────────┐   ┌──────┴────────┐                                  
            │               │   │               │                                  
            │               │   │  last, and    │                                  
            │   previous    │   │    current    │                                  
            │    page       │   │     page of   │                     ─            
            │               ┼───┤      book 2   │                                  
            │               │   │               │                                  
            │               │   │               │                                  
            │               │   │               │                                  
            └───────────────┘   └──────┬────────┘               ─                  
                                       │                                           
                                ┌──────┴────────┐   ┌───────────────┐              
                                │               │   │               │              
                                │               │   │               │              
                                │  first, and   │   │               │              
                                │    current    │   │   next page   │              
                                │     page of   ┼───┤               │              
                                │      book 3   │   │               │              
                                │               │   │               │              
                                │               │   │               │              
                                └───────────────┘   └───────────────┘
```

## Stack

React 19, TypeScript, Vite, Tailwind CSS. Package manager is **bun**, not npm — see `AGENTS.md`.

## Getting started

```bash
bun install
bun run dev      # vite dev server
bun run build    # tsc -b && vite build
```

## Related

- Backend: sibling repo `pamphlet-sync` (Go + Gin + GORM + Postgres) — Google OAuth, cross-device sync, and offline dictionary serving.
- Dictionary datasets are built by `pamphlet-project/scripts/dictionary/` (shared tooling, not part of this repo).
- Conventions, branch workflow, and known debt: `AGENTS.md`.
- Sandbox deploy: `pamphlet-project/DEPLOY.md`.
