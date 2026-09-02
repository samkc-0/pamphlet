import { useState } from "react";
import { Circle, Volume2, VolumeX } from "lucide-react";

import { speakText } from "@/lib/speech";
import { usePopupPosition } from "@/lib/use-popup-position";

export type SentenceLookupState = {
  anchorRect: DOMRect;
  error?: string;
  isInstructional?: boolean;
  languageCode?: string;
  pinned: boolean;
  result?: string;
  sentence: string;
  status: "error" | "loading" | "ready";
};

export function SentenceLookupPopup({
  lookup,
  onDismiss,
  onTogglePin
}: {
  lookup: SentenceLookupState;
  onDismiss: () => void;
  onTogglePin: () => void;
}) {
  const { popupRef, position } = usePopupPosition(lookup.anchorRect);
  const isMuted = Boolean(lookup.isInstructional);
  const [isPlaying, setIsPlaying] = useState(false);
  const canPlayAudio = Boolean(lookup.languageCode) && lookup.languageCode !== "und";

  const handlePlay = () => {
    if (!lookup.languageCode) return;

    const audio = speakText(lookup.sentence, lookup.languageCode);
    if (!audio) return;

    setIsPlaying(true);
    audio.addEventListener("ended", () => setIsPlaying(false));
    audio.addEventListener("pause", () => setIsPlaying(false));
    audio.addEventListener("error", () => setIsPlaying(false));
  };

  return (
    <div className="fixed inset-0 z-40" onClick={onDismiss}>
      <div
        className="absolute w-72 max-w-[calc(100vw-24px)] rounded-lg border border-neutral-200 bg-white p-4 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(event) => event.stopPropagation()}
        ref={popupRef}
        style={{
          left: position?.left ?? lookup.anchorRect.left,
          top: position?.top ?? lookup.anchorRect.bottom + 8,
          visibility: position ? "visible" : "hidden"
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <p
            className={`font-serif text-base italic text-neutral-950 dark:text-neutral-100 ${
              isPlaying ? "underline underline-offset-2" : ""
            }`}
          >
            {lookup.sentence}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <button
              aria-label={
                canPlayAudio
                  ? "Listen"
                  : "Listen (unavailable for this language)"
              }
              className={`rounded-full p-1 ${
                canPlayAudio
                  ? "text-neutral-500 dark:text-neutral-400"
                  : "text-neutral-300 dark:text-neutral-600"
              }`}
              disabled={!canPlayAudio}
              onClick={handlePlay}
              type="button"
            >
              {canPlayAudio ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
            </button>
            <button
              aria-label={lookup.pinned ? "Unpin sentence" : "Pin sentence"}
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
            isMuted
              ? "italic text-neutral-400 dark:text-neutral-500"
              : "text-neutral-700 dark:text-neutral-300"
          }`}
        >
          {lookup.status === "loading"
            ? "Translating…"
            : lookup.status === "error"
              ? (lookup.error ?? "Not found.")
              : lookup.result}
        </p>
      </div>
    </div>
  );
}
