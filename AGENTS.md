# Pamphlet (frontend)

Offline-first PWA EPUB reader. React 19 + TypeScript + Vite. Navigation
between screens (library, reader, settings, etc.) is a swipeable grid,
implemented in `src/components/swipe-workspace.tsx`.

## Package manager: bun, not npm

This project uses **bun**, not node/npm. `bun.lock` is the lockfile of
record — `package-lock.json` should not exist; if one reappears (e.g. from
`npm install` being run by mistake), delete it rather than committing it.

```
bun install
bun run dev       # vite dev server, host 0.0.0.0
bun run build     # tsc -b && vite build — type errors fail the build
bun run preview
```

No lint script and no test suite exist yet. Don't invent or assume either
is present.

## Branch workflow

Work happens on `sandbox`. **Never push or merge to `main`** — that is done
manually by the maintainer, deliberately, after reviewing `sandbox`.

## Style

- No comments unless the *why* is genuinely non-obvious (a hidden
  constraint, a workaround, something that would surprise a reader).
- Tailwind, utility-first. `@/` path alias resolves to `src/`.
- Screen-transition and other UI animation is hand-written CSS `@keyframes`
  (see `screen-enter-*` / `screen-exit-*` in `src/index.css`), not a JS
  animation library. Follow that pattern rather than reaching for
  `framer-motion` or similar.

## Direction: swipe feel

The swipe navigation currently detects a gesture and then snaps/animates to
the target screen. The intended feel is more physical: content should track
the finger in real time as you drag (the page/screen moves *with* your
thumb, not just in response to a completed gesture), the way a native
carousel or iOS page-turn behaves. This hasn't been built yet — if you're
touching `swipe-workspace.tsx`, know that's the target, not the current
gesture-detect-then-animate implementation.

## Cross-device sync

Signed-in users sync book content, reading progress, and pinned words via
`pamphlet-sync` (`src/lib/sync-client.ts`, plus the push/pull effects in
`App.tsx`). **Whenever you add or change state that should follow the user
across devices, it needs both halves**: a backend model + endpoint pair in
`pamphlet-sync` (see the matching note in its AGENTS.md) *and* the frontend
wiring here, following the pattern already established:

- Push on local change, fire-and-forget (`.catch()`, never `await` in a way
  that blocks the UI) — sync must never break or slow down local-only/
  offline usage.
- Pull on sign-in, guarded exactly like the seed-demo-book effect
  (`if (!isStateLoaded || !isBookCatalogLoaded) return;`) so it can't race
  the local catalog/state load on startup.
- Last-write-wins by a client-supplied timestamp, same as the backend.
- A book reference in synced state must be its content hash
  (`BookSource.fingerprint`), not the local `id` — the hash is what's
  portable across devices; the local id embeds a device-local slug.
- A `ReaderPage.id` is viewport-dependent and meaningless on another
  device's screen size — never sync one directly. Express a position as
  `{chapterId, paragraphIndex}` (see `pagination.ts`'s
  `findPageForMarker`/`startParagraphIndex`) and resolve it into a real
  page lazily, only once the target device has actually paginated that
  book.

Don't add frontend-only "syncable-sounding" state without checking whether
it needs the backend counterpart — a half-wired sync feature silently does
nothing.

## Related

- Backend lives in the sibling repo `pamphlet-sync` (Go + Gin + GORM +
  Postgres), providing Google OAuth login and session tokens.
- The sandbox deploy pipeline for both repos is documented in
  `../DEPLOY.md`.
