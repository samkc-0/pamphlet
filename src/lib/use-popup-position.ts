import { useEffect, useRef, useState } from "react";

export function usePopupPosition(anchorRect: DOMRect) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(
    null
  );

  useEffect(() => {
    const popup = popupRef.current;
    if (!popup) return;

    const recalculate = () => {
      const margin = 12;
      const popupRect = popup.getBoundingClientRect();
      // window.innerHeight (and the CSS vh unit) report mobile Safari's
      // layout viewport as if the address/tab bars were collapsed, not
      // what's actually visible right now — visualViewport tracks the
      // real, currently-visible area, updating live as the toolbars
      // show/hide.
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;

      let top = anchorRect.bottom + 8;
      if (top + popupRect.height + margin > viewportHeight) {
        top = anchorRect.top - popupRect.height - 8;
      }
      top = Math.max(
        margin,
        Math.min(top, viewportHeight - popupRect.height - margin)
      );

      let left = anchorRect.left + anchorRect.width / 2 - popupRect.width / 2;
      left = Math.max(
        margin,
        Math.min(left, window.innerWidth - popupRect.width - margin)
      );

      setPosition({ left, top });
    };

    // ResizeObserver fires once immediately on observe() (covering the
    // initial layout) and again any time the popup's rendered size
    // changes — critically, when content grows from a one-line "Looking
    // up..." placeholder to a multi-sense definition list. Without this,
    // the position stays locked in from that much-shorter initial height
    // and the popup can run off the bottom of the screen once real
    // content loads in.
    const observer = new ResizeObserver(recalculate);
    observer.observe(popup);
    return () => observer.disconnect();
  }, [anchorRect]);

  return { popupRef, position };
}
