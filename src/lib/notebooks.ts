// A notebook page is authored, not measured: text sits in boxes the user
// placed, so unlike a book's pages it can't be reflowed by pagination.
//
// Positions are fractions of the page canvas (0..1), never pixels - a box
// placed on a phone has to land in the same relative spot on a desktop, the
// same reason a ReaderPage.id is never synced across devices.

export type NotebookBox = {
  id: string;
  text: string;
  width: number;
  x: number;
  y: number;
};

export type NotebookPage = {
  boxes: NotebookBox[];
  id: string;
};

export type NotebookDoc = {
  pages: NotebookPage[];
};

export const NOTEBOOK_BOX_DEFAULT_WIDTH = 0.42;
// Keeps a newly placed box from starting so low that it has nowhere to grow.
const MAX_BOX_Y = 0.88;
const ENTRY_STEP_Y = 0.12;

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `nb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createNotebookPage(boxes: NotebookBox[] = []): NotebookPage {
  return { boxes, id: createId() };
}

export function createNotebookBox(
  x: number,
  y: number,
  width = NOTEBOOK_BOX_DEFAULT_WIDTH,
  text = ""
): NotebookBox {
  const clampedWidth = clamp(width, 0.12, 1);

  return {
    id: createId(),
    text,
    width: clampedWidth,
    x: clamp(x, 0, 1 - clampedWidth),
    y: clamp(y, 0, MAX_BOX_Y)
  };
}

export function createEmptyNotebookDoc(): NotebookDoc {
  return { pages: [createNotebookPage()] };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isBlankPage(page: NotebookPage) {
  return page.boxes.every((box) => !box.text.trim());
}

// Every notebook always shows one blank page at the end, so swiping past
// the last written page lands on a fresh one - "add a page" with no button,
// the way a paper notebook just has more pages behind the last one.
//
// The blank page's id is derived from the page count rather than generated,
// because this runs on every render: a fresh id each time would mean the
// page SwipeWorkspace just navigated to no longer exists on the next
// render, and it would bounce straight back to the start of the notebook.
// Writing on the blank page makes it a real page and bumps the count, so
// the next blank gets its own id rather than colliding.
export function withTrailingBlankPage(doc: NotebookDoc): NotebookPage[] {
  const pages = doc.pages.length > 0 ? doc.pages : [createNotebookPage()];
  const lastPage = pages[pages.length - 1];

  return isBlankPage(lastPage)
    ? pages
    : [...pages, { boxes: [], id: `blank-${pages.length}` }];
}

// Drops the blank pages that withTrailingBlankPage adds for display, so
// they don't accumulate in storage on every save. Always keeps one page.
export function trimTrailingBlankPages(doc: NotebookDoc): NotebookDoc {
  const pages = [...doc.pages];

  while (pages.length > 1 && isBlankPage(pages[pages.length - 1])) {
    pages.pop();
  }

  return { pages: pages.length > 0 ? pages : [createNotebookPage()] };
}

// Drops boxes the user tapped out but never typed into, so a stray tap
// doesn't leave an invisible empty box behind.
export function withoutEmptyBoxes(doc: NotebookDoc): NotebookDoc {
  return {
    pages: doc.pages.map((page) => ({
      ...page,
      boxes: page.boxes.filter((box) => box.text.trim())
    }))
  };
}

export function updateNotebookBox(
  doc: NotebookDoc,
  pageId: string,
  boxId: string,
  text: string
): NotebookDoc {
  return {
    pages: doc.pages.map((page) =>
      page.id === pageId
        ? {
            ...page,
            boxes: page.boxes.map((box) =>
              box.id === boxId ? { ...box, text } : box
            )
          }
        : page
    )
  };
}

export function addNotebookBox(
  doc: NotebookDoc,
  pageId: string,
  box: NotebookBox
): NotebookDoc {
  const hasPage = doc.pages.some((page) => page.id === pageId);
  const pages = hasPage
    ? doc.pages
    : [...doc.pages, { boxes: [], id: pageId } satisfies NotebookPage];

  return {
    pages: pages.map((page) =>
      page.id === pageId ? { ...page, boxes: [...page.boxes, box] } : page
    )
  };
}

// Places a dictionary entry sent from a book as a new box, stacked below
// the last one on the page the notebook is currently showing - that's the
// page the reader is looking at, so it's where they expect the entry to
// land. A full page keeps its entries rather than pushing them onto a page
// that isn't in view; the slot is just clamped to the bottom.
export function appendNotebookEntry(
  doc: NotebookDoc,
  text: string,
  pageId?: string
): NotebookDoc {
  const pages = doc.pages.length > 0 ? doc.pages : [createNotebookPage()];
  const targetIndex = pageId
    ? pages.findIndex((page) => page.id === pageId)
    : pages.length - 1;

  // The page on screen may be the blank one always shown at the end, which
  // isn't part of the document until something lands on it. Sending an
  // entry there creates it, the same way tapping to place a box does -
  // without this the entry falls back to the first page, which is the last
  // place the reader is looking.
  if (targetIndex === -1) {
    return {
      pages: [
        ...pages,
        {
          boxes: [createNotebookBox(0.06, 0.06, 0.5, text)],
          id: pageId as string
        }
      ]
    };
  }

  const targetPage = pages[targetIndex] ?? pages[pages.length - 1];
  const lowestY = targetPage.boxes.reduce(
    (lowest, box) => Math.max(lowest, box.y),
    -ENTRY_STEP_Y
  );
  const nextY = clamp(lowestY + ENTRY_STEP_Y, 0, MAX_BOX_Y);

  return {
    pages: pages.map((page, index) =>
      index === targetIndex
        ? {
            ...page,
            boxes: [...page.boxes, createNotebookBox(0.06, nextY, 0.5, text)]
          }
        : page
    )
  };
}

export function removeNotebookBox(
  doc: NotebookDoc,
  pageId: string,
  boxId: string
): NotebookDoc {
  return {
    pages: doc.pages.map((page) =>
      page.id === pageId
        ? { ...page, boxes: page.boxes.filter((box) => box.id !== boxId) }
        : page
    )
  };
}

// Keeps a box's left edge on the page. The vertical limit depends on how
// tall the box has grown, which only the rendered page knows, so the drag
// works that out and this just guards the range.
export function clampBoxX(x: number, width: number) {
  return clamp(x, 0, 1 - width);
}

export function moveNotebookBox(
  doc: NotebookDoc,
  pageId: string,
  boxId: string,
  x: number,
  y: number
): NotebookDoc {
  return {
    pages: doc.pages.map((page) =>
      page.id === pageId
        ? {
            ...page,
            boxes: page.boxes.map((box) =>
              box.id === boxId
                ? {
                    ...box,
                    x: clampBoxX(x, box.width),
                    y: clamp(y, 0, 1)
                  }
                : box
            )
          }
        : page
    )
  };
}

// The flat text of a notebook, used where a notebook has to look like a
// book's extracted chapters (metadata, language detection).
export function notebookDocToParagraphs(doc: NotebookDoc): string[] {
  const paragraphs = doc.pages.flatMap((page) =>
    page.boxes.map((box) => box.text.trim()).filter(Boolean)
  );

  return paragraphs.length > 0 ? paragraphs : [""];
}

// Turns a pre-boxes notebook (a flat list of paragraphs) into placed boxes,
// stacked down the page, so notebooks written before this change keep their
// text instead of coming back empty.
export function notebookDocFromParagraphs(paragraphs: string[]): NotebookDoc {
  const texts = paragraphs.map((text) => text.trim()).filter(Boolean);

  if (texts.length === 0) return createEmptyNotebookDoc();

  const pages: NotebookPage[] = [];
  let boxes: NotebookBox[] = [];
  let y = 0.06;

  for (const text of texts) {
    if (y > MAX_BOX_Y) {
      pages.push(createNotebookPage(boxes));
      boxes = [];
      y = 0.06;
    }

    boxes.push(createNotebookBox(0.06, y, 0.62, text));
    y += ENTRY_STEP_Y;
  }

  pages.push(createNotebookPage(boxes));

  return { pages };
}

export function serializeNotebookDoc(doc: NotebookDoc): string {
  return JSON.stringify(doc);
}

// Accepts either the JSON document written since notebooks gained boxes or
// the blank-line-separated plain text they synced as before it.
export function parseNotebookContent(content: string): NotebookDoc {
  const trimmed = content.trim();

  if (!trimmed) return createEmptyNotebookDoc();

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const doc = toNotebookDoc(parsed);
      if (doc) return doc;
    } catch {
      // Fall through to the legacy plain-text reading below.
    }
  }

  return notebookDocFromParagraphs(trimmed.split(/\n{2,}/));
}

export function toNotebookDoc(value: unknown): NotebookDoc | null {
  if (!value || typeof value !== "object") return null;

  const pages = (value as NotebookDoc).pages;
  if (!Array.isArray(pages)) return null;

  const parsedPages = pages.map((page) => ({
    boxes: Array.isArray(page?.boxes)
      ? page.boxes
          .filter((box): box is NotebookBox => Boolean(box) && typeof box.text === "string")
          .map((box) => ({
            id: typeof box.id === "string" ? box.id : createId(),
            text: box.text,
            width: Number.isFinite(box.width) ? box.width : NOTEBOOK_BOX_DEFAULT_WIDTH,
            x: Number.isFinite(box.x) ? box.x : 0.06,
            y: Number.isFinite(box.y) ? box.y : 0.06
          }))
      : [],
    id: typeof page?.id === "string" ? page.id : createId()
  }));

  return { pages: parsedPages.length > 0 ? parsedPages : [createNotebookPage()] };
}
