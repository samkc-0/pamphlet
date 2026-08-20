import { usePopupPosition } from "@/lib/use-popup-position";

export type SentenceLookupState = {
  anchorRect: DOMRect;
  error?: string;
  isInstructional?: boolean;
  result?: string;
  sentence: string;
  status: "error" | "loading" | "ready";
};

export function SentenceLookupPopup({
  lookup,
  onDismiss
}: {
  lookup: SentenceLookupState;
  onDismiss: () => void;
}) {
  const { popupRef, position } = usePopupPosition(lookup.anchorRect);
  const isMuted = Boolean(lookup.isInstructional);

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
        <p className="font-serif text-base italic text-neutral-950 dark:text-neutral-100">
          {lookup.sentence}
        </p>

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
