import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, PointerEvent, ReactNode } from "react";

import {
  SentenceLookupPopup,
  type SentenceLookupState
} from "@/components/sentence-lookup-popup";
import {
  WordLookupPopup,
  type WordLookupState
} from "@/components/word-lookup-popup";
import { lookupWord, translateText } from "@/lib/dictionary";
import {
  loadPinnedSentences,
  setSentencePinned
} from "@/lib/pinned-sentences";
import { loadPinnedWords, setWordPinned } from "@/lib/pinned-words";
import { speakWord } from "@/lib/speech";
import {
  getStoredSessionToken,
  pushPinnedSentence,
  pushPinnedWord,
  type SyncUser
} from "@/lib/sync-client";
import { normalizeWord, tokenizeParagraphWithOffsets } from "@/lib/tokenize";

const LONG_PRESS_MS = 550;

// Tap-a-word-to-look-it-up, long-press-to-select-a-sentence, and pinning,
// over an ordered list of text blocks. Deliberately knows nothing about how
// those blocks are laid out: a book renders them as flowing paragraphs, a
// notebook renders them as boxes placed anywhere on the page, and both get
// identical behaviour because every position here is an index into `blocks`
// plus a token index, and every popup anchors off the tapped token's own
// bounding rect.
export function useTextLookup({
  autoPlayWordAudio,
  blocks,
  currentUser,
  dictionaryLanguageCode,
  languageCode,
  onSendToNotebook,
  spokenLanguageCode
}: {
  autoPlayWordAudio: boolean;
  blocks: string[];
  currentUser: SyncUser | null;
  dictionaryLanguageCode: string;
  languageCode: string;
  onSendToNotebook?: (entry: string) => void;
  spokenLanguageCode: string;
}): { popups: ReactNode; renderBlock: (blockIndex: number) => ReactNode } {
  const [pinnedWords, setPinnedWords] = useState<Set<string>>(new Set());
  const [pinnedSentences, setPinnedSentences] = useState<Set<string>>(
    new Set()
  );
  const [lookup, setLookup] = useState<WordLookupState | null>(null);
  const [wordLookupHighlight, setWordLookupHighlight] = useState<{
    blockIndex: number;
    tokenIndex: number;
  } | null>(null);
  const [sentenceLookup, setSentenceLookup] =
    useState<SentenceLookupState | null>(null);
  const [selectionRange, setSelectionRange] = useState<{
    blockIndex: number;
    maxIndex: number;
    minIndex: number;
  } | null>(null);
  const isSelecting = useRef(false);
  const selectionAnchorIndex = useRef(0);
  const sentenceLongPressTimer = useRef<number | null>(null);
  const suppressNextWordClick = useRef(false);

  const blockTokens = useMemo(
    () => blocks.map((block) => tokenizeParagraphWithOffsets(block)),
    [blocks]
  );

  // Character ranges of pinned sentences within each block, so the whole
  // underlined span can cover punctuation/whitespace between words too, not
  // just the individual word tokens - a pinned sentence with a dashed
  // underline only under its words, with gaps at every space, would read as
  // broken rather than "this whole sentence is pinned".
  const pinnedSentenceRangesByBlock = useMemo(() => {
    if (pinnedSentences.size === 0) return [];

    return blocks.map((block) => {
      const ranges: Array<{ end: number; start: number }> = [];

      for (const sentence of pinnedSentences) {
        const start = block.indexOf(sentence);
        if (start === -1) continue;

        ranges.push({ end: start + sentence.length, start });
      }

      return ranges;
    });
  }, [blocks, pinnedSentences]);

  useEffect(() => {
    return () => {
      if (sentenceLongPressTimer.current) {
        window.clearTimeout(sentenceLongPressTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadPinnedWords(languageCode).then((words) => {
      if (!cancelled) setPinnedWords(words);
    });

    return () => {
      cancelled = true;
    };
  }, [languageCode]);

  useEffect(() => {
    let cancelled = false;

    loadPinnedSentences(languageCode).then((sentences) => {
      if (!cancelled) setPinnedSentences(sentences);
    });

    return () => {
      cancelled = true;
    };
  }, [languageCode]);

  const clearSentenceLongPress = () => {
    if (sentenceLongPressTimer.current) {
      window.clearTimeout(sentenceLongPressTimer.current);
      sentenceLongPressTimer.current = null;
    }
  };

  const startSelectionLongPress = (
    event: PointerEvent<HTMLButtonElement>,
    blockIndex: number,
    tokenIndex: number
  ) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    event.currentTarget.setPointerCapture(event.pointerId);

    clearSentenceLongPress();
    suppressNextWordClick.current = false;
    sentenceLongPressTimer.current = window.setTimeout(() => {
      sentenceLongPressTimer.current = null;
      suppressNextWordClick.current = true;
      isSelecting.current = true;
      selectionAnchorIndex.current = tokenIndex;
      setSelectionRange({ blockIndex, maxIndex: tokenIndex, minIndex: tokenIndex });
    }, LONG_PRESS_MS);
  };

  const handleSelectionPointerMove = (
    event: PointerEvent<HTMLButtonElement>,
    blockIndex: number
  ) => {
    if (!isSelecting.current) return;

    event.stopPropagation();

    const hovered = document.elementFromPoint(event.clientX, event.clientY);
    const tokenElement = hovered?.closest<HTMLElement>("[data-token-index]");
    if (!tokenElement) return;

    if (Number(tokenElement.dataset.paragraphIndex) !== blockIndex) return;

    const tokenIndex = Number(tokenElement.dataset.tokenIndex);

    setSelectionRange({
      blockIndex,
      maxIndex: Math.max(selectionAnchorIndex.current, tokenIndex),
      minIndex: Math.min(selectionAnchorIndex.current, tokenIndex)
    });
  };

  const handleSelectionPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    clearSentenceLongPress();

    if (!isSelecting.current) return;

    event.stopPropagation();
    isSelecting.current = false;

    if (!selectionRange) return;

    const tokens = blockTokens[selectionRange.blockIndex];
    const text = tokens
      .slice(selectionRange.minIndex, selectionRange.maxIndex + 1)
      .map((token) => token.value)
      .join("")
      .trim();

    if (text) {
      translateSelection(text, event.currentTarget.getBoundingClientRect());
    }
  };

  const handleSelectionPointerCancel = (
    event: PointerEvent<HTMLButtonElement>
  ) => {
    clearSentenceLongPress();

    if (isSelecting.current) {
      event.stopPropagation();
      isSelecting.current = false;
      setSelectionRange(null);
    }
  };

  const translateSelection = (text: string, anchorRect: DOMRect) => {
    if (languageCode === dictionaryLanguageCode || languageCode === "und") {
      setSentenceLookup({
        anchorRect,
        error:
          languageCode === "und"
            ? "Set a book language to translate text."
            : "Text is already in your dictionary language.",
        isInstructional: true,
        languageCode: spokenLanguageCode,
        pinned: pinnedSentences.has(text),
        sentence: text,
        status: "error"
      });
      return;
    }

    setSentenceLookup({
      anchorRect,
      languageCode: spokenLanguageCode,
      pinned: pinnedSentences.has(text),
      sentence: text,
      status: "loading"
    });

    translateText(text, languageCode, dictionaryLanguageCode)
      .then((result) => {
        setSentenceLookup((current) =>
          current && current.sentence === text
            ? { ...current, result: result.senses[0].definitions[0], status: "ready" }
            : current
        );
      })
      .catch((error: unknown) => {
        setSentenceLookup((current) =>
          current && current.sentence === text
            ? {
                ...current,
                error:
                  error instanceof Error ? error.message : "Translation failed.",
                status: "error"
              }
            : current
        );
      });
  };

  const handleSentenceDismiss = () => {
    setSentenceLookup(null);
    setSelectionRange(null);
  };

  const handleWordClick = (
    event: MouseEvent<HTMLButtonElement>,
    rawWord: string,
    blockIndex: number,
    tokenIndex: number
  ) => {
    clearSentenceLongPress();

    if (suppressNextWordClick.current) {
      suppressNextWordClick.current = false;
      return;
    }

    const word = normalizeWord(rawWord);
    const displayWord = rawWord.trim();
    const anchorRect = event.currentTarget.getBoundingClientRect();

    setWordLookupHighlight({ blockIndex, tokenIndex });

    if (languageCode === "und") {
      setLookup({
        anchorRect,
        displayWord,
        error: "Set a book language to look up words.",
        languageCode: spokenLanguageCode,
        pinned: pinnedWords.has(word),
        status: "error",
        word
      });
      return;
    }

    if (autoPlayWordAudio) {
      speakWord(word, spokenLanguageCode);
    }

    setLookup({
      anchorRect,
      displayWord,
      languageCode: spokenLanguageCode,
      pinned: pinnedWords.has(word),
      status: "loading",
      word
    });

    lookupWord(word, languageCode, dictionaryLanguageCode)
      .then((result) => {
        setLookup((current) =>
          current && current.word === word
            ? { ...current, result, status: "ready" }
            : current
        );
      })
      .catch((error: unknown) => {
        setLookup((current) =>
          current && current.word === word
            ? {
                ...current,
                error: error instanceof Error ? error.message : "Lookup failed.",
                status: "error"
              }
            : current
        );
      });
  };

  const handleTogglePin = () => {
    if (!lookup) return;

    const nextPinned = !lookup.pinned;
    const { word } = lookup;

    setLookup({ ...lookup, pinned: nextPinned });
    setPinnedWords((current) => {
      const next = new Set(current);

      if (nextPinned) {
        next.add(word);
      } else {
        next.delete(word);
      }

      return next;
    });

    const updatedAt = Date.now();
    setWordPinned(languageCode, word, nextPinned, updatedAt).catch(() => {});

    const token = getStoredSessionToken();
    if (currentUser && token) {
      pushPinnedWord(token, { languageCode, word, pinned: nextPinned, updatedAt });
    }
  };

  const handleSentenceTogglePin = () => {
    if (!sentenceLookup) return;

    const nextPinned = !sentenceLookup.pinned;
    const { sentence } = sentenceLookup;

    setSentenceLookup({ ...sentenceLookup, pinned: nextPinned });
    setPinnedSentences((current) => {
      const next = new Set(current);

      if (nextPinned) {
        next.add(sentence);
      } else {
        next.delete(sentence);
      }

      return next;
    });

    const updatedAt = Date.now();
    setSentencePinned(languageCode, sentence, nextPinned, updatedAt).catch(
      () => {}
    );

    const token = getStoredSessionToken();
    if (currentUser && token) {
      pushPinnedSentence(token, {
        languageCode,
        sentence,
        pinned: nextPinned,
        updatedAt
      });
    }
  };

  const renderBlock = (blockIndex: number): ReactNode => {
    const tokens = blockTokens[blockIndex] ?? [];

    return tokens.map((token, tokenIndex) => {
      const isHighlighted =
        (selectionRange?.blockIndex === blockIndex &&
          tokenIndex >= selectionRange.minIndex &&
          tokenIndex <= selectionRange.maxIndex) ||
        (wordLookupHighlight?.blockIndex === blockIndex &&
          wordLookupHighlight?.tokenIndex === tokenIndex);
      const isPinnedSentenceToken = (
        pinnedSentenceRangesByBlock[blockIndex] ?? []
      ).some((range) => token.start >= range.start && token.end <= range.end);

      if (token.type === "word") {
        const classNames = ["reader-word"];
        if (
          pinnedWords.has(normalizeWord(token.value)) ||
          isPinnedSentenceToken
        ) {
          classNames.push("reader-word--pinned");
        }
        if (isHighlighted) {
          classNames.push("sentence-highlight");
        }

        return (
          <button
            className={classNames.join(" ")}
            data-paragraph-index={blockIndex}
            data-token-index={tokenIndex}
            key={tokenIndex}
            onClick={(event) =>
              handleWordClick(event, token.value, blockIndex, tokenIndex)
            }
            onPointerCancel={handleSelectionPointerCancel}
            onPointerDown={(event) =>
              startSelectionLongPress(event, blockIndex, tokenIndex)
            }
            onPointerLeave={() => {
              if (!isSelecting.current) clearSentenceLongPress();
            }}
            onPointerMove={(event) =>
              handleSelectionPointerMove(event, blockIndex)
            }
            onPointerUp={handleSelectionPointerUp}
            type="button"
          >
            {token.value}
          </button>
        );
      }

      const textClassNames = [];
      if (isPinnedSentenceToken) {
        textClassNames.push("reader-word--pinned");
      }
      if (isHighlighted) {
        textClassNames.push("sentence-highlight");
      }

      return (
        <span
          className={textClassNames.join(" ")}
          data-paragraph-index={blockIndex}
          data-token-index={tokenIndex}
          key={tokenIndex}
        >
          {token.value}
        </span>
      );
    });
  };

  const popups = (
    <>
      {lookup ? (
        <WordLookupPopup
          lookup={lookup}
          onDismiss={() => {
            setLookup(null);
            setWordLookupHighlight(null);
          }}
          onSendToNotebook={
            onSendToNotebook
              ? () => onSendToNotebook(formatWordNotebookEntry(lookup))
              : undefined
          }
          onTogglePin={handleTogglePin}
        />
      ) : null}

      {sentenceLookup ? (
        <SentenceLookupPopup
          lookup={sentenceLookup}
          onDismiss={handleSentenceDismiss}
          onSendToNotebook={
            onSendToNotebook
              ? () => onSendToNotebook(formatSentenceNotebookEntry(sentenceLookup))
              : undefined
          }
          onTogglePin={handleSentenceTogglePin}
        />
      ) : null}
    </>
  );

  return { popups, renderBlock };
}

function formatWordNotebookEntry(lookup: WordLookupState): string {
  const definitions = (lookup.result?.senses ?? [])
    .flatMap((sense) => sense.definitions)
    .filter(Boolean);

  return definitions.length > 0
    ? `${lookup.displayWord} — ${definitions.join("; ")}`
    : lookup.displayWord;
}

function formatSentenceNotebookEntry(lookup: SentenceLookupState): string {
  return lookup.result ? `${lookup.sentence} — ${lookup.result}` : lookup.sentence;
}
