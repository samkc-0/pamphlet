import { Circle, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { WordLookupResult } from "@/lib/dictionary";
import { speakWord } from "@/lib/speech";

export type WordLookupState = {
  anchorRect: DOMRect;
  displayWord: string;
  error?: string;
  languageCode: string;
  pinned: boolean;
  result?: WordLookupResult;
  status: "error" | "loading" | "ready";
  word: string;
};

export function WordLookupPopup({
  lookup,
  onDismiss,
  onTogglePin
}: {
  lookup: WordLookupState;
  onDismiss: () => void;
  onTogglePin: () => void;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(
    null
  );

  useEffect(() => {
    const popup = popupRef.current;
    if (!popup) return;

    const margin = 12;
    const popupRect = popup.getBoundingClientRect();
    const { anchorRect } = lookup;

    let top = anchorRect.bottom + 8;
    if (top + popupRect.height + margin > window.innerHeight) {
      top = anchorRect.top - popupRect.height - 8;
    }
    top = Math.max(
      margin,
      Math.min(top, window.innerHeight - popupRect.height - margin)
    );

    let left = anchorRect.left + anchorRect.width / 2 - popupRect.width / 2;
    left = Math.max(
      margin,
      Math.min(left, window.innerWidth - popupRect.width - margin)
    );

    setPosition({ left, top });
  }, [lookup]);

  return (
    <div className="fixed inset-0 z-40" onClick={onDismiss}>
      <div
        className="absolute w-64 max-w-[calc(100vw-24px)] rounded-lg border border-neutral-200 bg-white p-4 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(event) => event.stopPropagation()}
        ref={popupRef}
        style={{
          left: position?.left ?? lookup.anchorRect.left,
          top: position?.top ?? lookup.anchorRect.bottom + 8,
          visibility: position ? "visible" : "hidden"
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="font-serif text-lg text-neutral-950 dark:text-neutral-100">
            {lookup.displayWord}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              aria-label={
                lookup.languageCode === "und"
                  ? "Listen (unavailable for this language)"
                  : "Listen"
              }
              className={`rounded-full p-1 ${
                lookup.languageCode === "und"
                  ? "text-neutral-300 dark:text-neutral-600"
                  : "text-neutral-500 dark:text-neutral-400"
              }`}
              disabled={lookup.languageCode === "und"}
              onClick={() => speakWord(lookup.word, lookup.languageCode)}
              type="button"
            >
              {lookup.languageCode === "und" ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            <button
              aria-label={lookup.pinned ? "Unpin word" : "Pin word"}
              aria-pressed={lookup.pinned}
              className={`rounded-full p-1 ${
                lookup.pinned
                  ? "text-neutral-950 dark:text-neutral-100"
                  : "text-neutral-400 dark:text-neutral-600"
              }`}
              onClick={onTogglePin}
              type="button"
            >
              <Circle
                className="h-3 w-3"
                fill={lookup.pinned ? "currentColor" : "none"}
              />
            </button>
          </div>
        </div>

        <p
          className={`mt-2 text-sm leading-relaxed ${
            lookup.languageCode === "und"
              ? "italic text-neutral-400 dark:text-neutral-500"
              : "text-neutral-700 dark:text-neutral-300"
          }`}
        >
          {lookup.status === "loading"
            ? "Looking up…"
            : lookup.status === "error"
              ? (lookup.error ?? "Not found.")
              : lookup.result?.text}
        </p>
      </div>
    </div>
  );
}
