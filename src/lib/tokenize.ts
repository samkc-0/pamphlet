export type TextToken = {
  type: "text" | "word";
  value: string;
};

export type OffsetToken = TextToken & {
  end: number;
  start: number;
};

const WORD_PATTERN = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ'’]+/g;

export function tokenizeParagraph(text: string): TextToken[] {
  const tokens: TextToken[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(WORD_PATTERN)) {
    const index = match.index ?? 0;

    if (index > lastIndex) {
      tokens.push({ type: "text", value: text.slice(lastIndex, index) });
    }

    tokens.push({ type: "word", value: match[0] });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: "text", value: text.slice(lastIndex) });
  }

  return tokens;
}

export function tokenizeParagraphWithOffsets(text: string): OffsetToken[] {
  let offset = 0;

  return tokenizeParagraph(text).map((token) => {
    const start = offset;
    offset += token.value.length;
    return { ...token, end: offset, start };
  });
}

export function normalizeWord(word: string) {
  return word.trim().toLowerCase();
}
