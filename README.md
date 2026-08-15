# Pamphlet

A small React workspace for moving through 2D rows of screens.

The reusable piece is `SwipeWorkspace`. It treats the app as vertical rows, where each row has its own horizontal pages. Moving left/right changes the active page for the current row. Moving up/down switches rows and restores the saved page for that target row.

```tsx
import { SwipeWorkspace, type WorkspaceRow } from "@/components/swipe-workspace";

const rows: WorkspaceRow[] = [
  {
    id: "library",
    pages: [
      { id: "all", render: () => <Library /> },
      { id: "open", render: () => <OpenArticles /> }
    ]
  },
  {
    id: "article-one",
    pages: [
      { id: "page-1", render: () => <Article articleId="one" page={1} /> },
      { id: "page-2", render: () => <Article articleId="one" page={2} /> }
    ]
  }
];

export function App() {
  return <SwipeWorkspace rows={rows} />;
}
```

Rows and pages use stable IDs, so dynamic rows can preserve their horizontal position while rows are added, removed, or reordered.

Another possible shape:

```tsx
const rows = projects.map((project) => ({
  id: project.id,
  pages: [
    { id: "editor", render: () => <Editor project={project} /> },
    { id: "repl", render: () => <Repl project={project} /> },
    { id: "webgl", render: () => <WebGLPreview project={project} /> }
  ]
}));
```

Run locally:

```bash
bun install
bun run dev
```
