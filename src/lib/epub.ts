import JSZip from "jszip";

export type EpubSection = {
  chapterTitle?: string;
  id: string;
  pageNumber: number;
  paragraphs: string[];
};

export type EpubBook = {
  author?: string;
  sections: EpubSection[];
  title?: string;
};

type ManifestItem = {
  href: string;
  id: string;
  mediaType: string;
};

export async function loadEpub(url: string): Promise<EpubBook> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load EPUB: ${response.status}`);
  }

  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const containerXml = await readZipText(zip, "META-INF/container.xml");
  const rootfilePath = parseRootfilePath(containerXml);
  const opfXml = await readZipText(zip, rootfilePath);
  const opfDirectory = getDirectory(rootfilePath);
  const opfDocument = parseXml(opfXml);
  const manifest = parseManifest(opfDocument);
  const spineIds = parseSpine(opfDocument);
  const metadata = parseMetadata(opfDocument);

  const chapterPages = await Promise.all(
    spineIds.map(async (idref) => {
      const item = manifest.get(idref);

      if (!item || !item.mediaType.includes("html")) {
        return null;
      }

      const sectionPath = joinPath(opfDirectory, item.href);
      const html = await readZipText(zip, sectionPath);
      const { heading, paragraphs } = extractReadableText(html);

      return paginateParagraphs({
        chapterId: item.id,
        chapterTitle: heading,
        paragraphs
      });
    })
  );
  const sections = chapterPages
    .flat()
    .filter((section): section is Omit<EpubSection, "pageNumber"> =>
      Boolean(section)
    )
    .map((section, index) => ({ ...section, pageNumber: index + 1 }));

  return {
    ...metadata,
    sections
  };
}

function parseRootfilePath(containerXml: string) {
  const document = parseXml(containerXml);
  const rootfile = document.querySelector("rootfile");
  const path = rootfile?.getAttribute("full-path");

  if (!path) {
    throw new Error("EPUB container is missing rootfile path.");
  }

  return path;
}

function parseManifest(document: Document) {
  const items = Array.from(document.querySelectorAll("manifest > item"));
  const manifest = new Map<string, ManifestItem>();

  for (const item of items) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    const mediaType = item.getAttribute("media-type") ?? "";

    if (id && href) {
      manifest.set(id, { href, id, mediaType });
    }
  }

  return manifest;
}

function parseSpine(document: Document) {
  return Array.from(document.querySelectorAll("spine > itemref"))
    .map((item) => item.getAttribute("idref"))
    .filter((idref): idref is string => Boolean(idref));
}

function parseMetadata(document: Document) {
  const title = getMetadataText(document, "title");
  const author = getMetadataText(document, "creator");

  return { author, title };
}

function getMetadataText(document: Document, localName: string) {
  const element = Array.from(document.getElementsByTagName("*")).find(
    (node) => node.localName === localName
  );

  return element?.textContent?.trim();
}

function extractReadableText(html: string) {
  const document = new DOMParser().parseFromString(html, "text/html");

  document
    .querySelectorAll("script, style, nav, img, svg")
    .forEach((element) => element.remove());

  const heading = textContent(document.querySelector("h1, h2, h3"));
  const blockElements = Array.from(
    document.body.querySelectorAll("h1, h2, h3, h4, p, blockquote, li")
  );
  const paragraphs = blockElements
    .map((element) => textContent(element))
    .filter(Boolean)
    .filter((paragraph, index, all) => paragraph !== all[index - 1]);

  return {
    heading,
    paragraphs:
      paragraphs.length > 0
        ? paragraphs
        : [textContent(document.body)].filter(Boolean)
  };
}

function paginateParagraphs({
  chapterId,
  chapterTitle,
  paragraphs
}: {
  chapterId: string;
  chapterTitle?: string;
  paragraphs: string[];
}) {
  const pages: Omit<EpubSection, "pageNumber">[] = [];
  let page: string[] = [];
  let pageLength = 0;
  const targetLength = 850;
  const maxLength = 1150;

  for (const paragraph of paragraphs) {
    const nextLength = pageLength + paragraph.length;
    const shouldStartNewPage =
      page.length > 0 &&
      (nextLength > maxLength ||
        (pageLength > targetLength && paragraph.length > 120));

    if (shouldStartNewPage) {
      pages.push({
        chapterTitle,
        id: `${chapterId}-${pages.length + 1}`,
        paragraphs: page
      });
      page = [];
      pageLength = 0;
    }

    page.push(paragraph);
    pageLength += paragraph.length;
  }

  if (page.length > 0) {
    pages.push({
      chapterTitle,
      id: `${chapterId}-${pages.length + 1}`,
      paragraphs: page
    });
  }

  return pages;
}

function textContent(element: Element | null) {
  return (
    element?.textContent
      ?.replace(/\s+/g, " ")
      .replace(/\u00a0/g, " ")
      .trim() ?? ""
  );
}

async function readZipText(zip: JSZip, path: string) {
  const file = zip.file(path);

  if (!file) {
    throw new Error(`Missing EPUB file: ${path}`);
  }

  return file.async("text");
}

function parseXml(xml: string) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = document.querySelector("parsererror");

  if (parserError) {
    throw new Error(parserError.textContent ?? "Failed to parse XML.");
  }

  return document;
}

function getDirectory(path: string) {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash === -1 ? "" : path.slice(0, lastSlash);
}

function joinPath(directory: string, path: string) {
  return [directory, path].filter(Boolean).join("/").replace(/\/+/g, "/");
}
