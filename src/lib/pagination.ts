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
  let pageParagraphs: string[] = [];
  let pageIndex = 1;

  for (const paragraph of chapter.paragraphs) {
    const nextParagraphs = [...pageParagraphs, paragraph];
    const nextHeight = measurePage(
      measurer,
      getPageChapterTitle(chapter, pageIndex),
      nextParagraphs
    );

    if (pageParagraphs.length > 0 && nextHeight > maxHeight) {
      pages.push({
        chapterTitle: getPageChapterTitle(chapter, pageIndex),
        id: `${chapter.id}-${pageIndex}`,
        paragraphs: pageParagraphs
      });

      pageIndex += 1;
      pageParagraphs = [paragraph];
    } else {
      pageParagraphs = nextParagraphs;
    }

    if (
      measurePage(
        measurer,
        getPageChapterTitle(chapter, pageIndex),
        pageParagraphs
      ) > maxHeight
    ) {
      const split = splitOversizedParagraph(
        measurer,
        chapter,
        pageIndex,
        pageParagraphs[0],
        maxHeight
      );
      pages.push(...split.pages.map((paragraphs, index) => ({
        chapterTitle: getPageChapterTitle(chapter, pageIndex + index),
        id: `${chapter.id}-${pageIndex + index}`,
        paragraphs
      })));
      pageIndex += split.pages.length;
      pageParagraphs = split.remainder ? [split.remainder] : [];
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

function splitOversizedParagraph(
  measurer: ReturnType<typeof createMeasurer>,
  chapter: EpubSection,
  pageIndex: number,
  paragraph: string,
  maxHeight: number
) {
  const words = paragraph.split(" ");
  const pages: string[][] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (
      current &&
      measurePage(measurer, getPageChapterTitle(chapter, pageIndex), [
        candidate
      ]) > maxHeight
    ) {
      pages.push([current]);
      current = word;
      pageIndex += 1;
    } else {
      current = candidate;
    }
  }

  return {
    pages,
    remainder: current
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
  return window.innerWidth >= 640 ? 210 : 170;
}
