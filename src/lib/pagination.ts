import type { EpubBook, EpubSection } from "@/lib/epub";

export type ReaderPage = {
  chapterTitle?: string;
  id: string;
  paragraphs: string[];
};

export type PaginationMetrics = {
  height: number;
  width: number;
};

const PAGE_WIDTH_MAX = 768;

export function getPaginationMetrics(): PaginationMetrics {
  const width = Math.min(
    PAGE_WIDTH_MAX,
    Math.max(280, window.innerWidth - getHorizontalReaderPadding())
  );
  const height = Math.max(320, window.innerHeight - getVerticalReaderChrome());

  return { height, width };
}

export async function paginateBookByLayout(book: EpubBook) {
  if ("fonts" in document) {
    await document.fonts.ready;
  }

  const metrics = getPaginationMetrics();
  const measurer = createMeasurer(metrics);
  const pages: ReaderPage[] = [];

  try {
    for (const chapter of book.chapters) {
      pages.push(...paginateChapter(chapter, measurer, metrics.height));
    }
  } finally {
    measurer.root.remove();
  }

  return pages;
}

function paginateChapter(
  chapter: EpubSection,
  measurer: ReturnType<typeof createMeasurer>,
  maxHeight: number
) {
  const pages: ReaderPage[] = [];
  const paragraphs = [...chapter.paragraphs];
  let pageParagraphs: string[] = [];
  let pageIndex = 1;

  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length;) {
    const paragraph = paragraphs[paragraphIndex];
    const nextParagraphs = [...pageParagraphs, paragraph];
    const nextHeight = measurePage(
      measurer,
      getPageChapterTitle(chapter, pageIndex),
      nextParagraphs
    );

    if (nextHeight <= maxHeight) {
      pageParagraphs = nextParagraphs;
      paragraphIndex += 1;
      continue;
    }

    const split = splitParagraphToFit(
      measurer,
      getPageChapterTitle(chapter, pageIndex),
      pageParagraphs,
      paragraph,
      maxHeight
    );

    if (split.fittingText) {
      pageParagraphs = [...pageParagraphs, split.fittingText];
      paragraphs[paragraphIndex] = split.remainingText;
    }

    if (pageParagraphs.length > 0) {
      pages.push({
        chapterTitle: getPageChapterTitle(chapter, pageIndex),
        id: `${chapter.id}-${pageIndex}`,
        paragraphs: pageParagraphs
      });

      pageIndex += 1;
      pageParagraphs = [];
      continue;
    }

    const forcedSplit = splitParagraphToFit(
      measurer,
      getPageChapterTitle(chapter, pageIndex),
      [],
      paragraph,
      maxHeight
    );

    pages.push({
      chapterTitle: getPageChapterTitle(chapter, pageIndex),
      id: `${chapter.id}-${pageIndex}`,
      paragraphs: [forcedSplit.fittingText || paragraph]
    });

    pageIndex += 1;

    if (forcedSplit.remainingText) {
      paragraphs[paragraphIndex] = forcedSplit.remainingText;
    } else {
      paragraphIndex += 1;
    }
  }

  if (pageParagraphs.length > 0) {
    pages.push({
      chapterTitle: getPageChapterTitle(chapter, pageIndex),
      id: `${chapter.id}-${pageIndex}`,
      paragraphs: pageParagraphs
    });
  }

  return pages;
}

function splitParagraphToFit(
  measurer: ReturnType<typeof createMeasurer>,
  chapterTitle: string | undefined,
  baseParagraphs: string[],
  paragraph: string,
  maxHeight: number
) {
  const words = paragraph.split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return { fittingText: "", remainingText: "" };
  }

  let low = 0;
  let high = words.length;
  let best = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = words.slice(0, mid).join(" ");
    const height = measurePage(
      measurer,
      chapterTitle,
      candidate ? [...baseParagraphs, candidate] : baseParagraphs
    );

    if (height <= maxHeight) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (best === 0 && baseParagraphs.length > 0) {
    return { fittingText: "", remainingText: paragraph };
  }

  if (best === 0) {
    best = 1;
  }

  return {
    fittingText: words.slice(0, best).join(" "),
    remainingText: words.slice(best).join(" ")
  };
}

function getPageChapterTitle(chapter: EpubSection, pageIndex: number) {
  return pageIndex === 1 ? chapter.chapterTitle : undefined;
}

function measurePage(
  measurer: ReturnType<typeof createMeasurer>,
  chapterTitle: string | undefined,
  paragraphs: string[]
) {
  measurer.content.replaceChildren();

  if (chapterTitle) {
    const heading = document.createElement("div");
    heading.className = "reader-chapter-heading";
    heading.textContent = chapterTitle;
    measurer.content.append(heading);
  }

  const body = document.createElement("div");
  body.className = "reader-page-body";

  for (const paragraph of paragraphs) {
    const element = document.createElement("p");
    element.textContent = paragraph;
    body.append(element);
  }

  measurer.content.append(body);
  return measurer.content.scrollHeight;
}

function createMeasurer(metrics: PaginationMetrics) {
  const root = document.createElement("div");
  root.className = "reader-measurer";
  root.style.width = `${metrics.width}px`;
  root.style.height = `${metrics.height}px`;

  const content = document.createElement("div");
  content.className = "reader-page-content";
  root.append(content);
  document.body.append(root);

  return { content, root };
}

function getHorizontalReaderPadding() {
  return window.innerWidth >= 640 ? 80 : 40;
}

function getVerticalReaderChrome() {
  return window.innerWidth >= 640 ? 176 : 144;
}
