import { Pin } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { WordLookupResult } from "@/lib/dictionary";

export type WordLookupState = {
  anchorRect: DOMRect;
  error?: string;
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
            {lookup.word}
          </span>
          <button
            aria-label={lookup.pinned ? "Unpin word" : "Pin word"}
            aria-pressed={lookup.pinned}
            className={`shrink-0 rounded-full p-1 ${
              lookup.pinned
                ? "text-neutral-950 dark:text-neutral-100"
                : "text-neutral-400 dark:text-neutral-600"
            }`}
            onClick={onTogglePin}
            type="button"
          >
            <Pin className="h-4 w-4" fill={lookup.pinned ? "currentColor" : "none"} />
          </button>
        </div>

        <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
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
