import { useEffect, useRef, useState } from "react";

export function usePopupPosition(anchorRect: DOMRect) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(
    null
  );

  useEffect(() => {
    const popup = popupRef.current;
    if (!popup) return;

    const margin = 12;
    const popupRect = popup.getBoundingClientRect();

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
  }, [anchorRect]);

  return { popupRef, position };
}
