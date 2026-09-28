import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { flushSync } from "react-dom";

// Movement before a drag takes over. Higher when the finger went down on a
// text field, so placing a cursor in a notebook box never nudges the page.
const DRAG_START_PX = 8;
const TEXT_DRAG_START_PX = 16;
// Travel past a quarter of the screen commits, but so does a flick that
// never gets that far - which is the part a fixed distance threshold alone
// gets wrong.
const COMMIT_FRACTION = 0.25;
const FLICK_VELOCITY_PX_PER_MS = 0.5;
const VELOCITY_WINDOW_MS = 60;
// Two samples a fraction of a millisecond apart divide into an enormous
// speed, and high-rate touch digitizers deliver exactly that - so a window
// this short is treated as no reading rather than as a flick.
const MIN_VELOCITY_WINDOW_MS = 8;
const SETTLE_MS = 240;
// Dragging towards an edge that has nowhere to go still moves, just barely,
// so the end of a book reads as an end rather than as dead input.
const EDGE_RESISTANCE = 0.35;

type Axis = "x" | "y";
type Direction = "left" | "right" | "up" | "down";

export type WorkspacePage = {
  id: string;
  render: () => ReactNode;
};

export type WorkspaceRow = {
  id: string;
  initialPageId?: string;
  pages: WorkspacePage[];
};

type SwipeWorkspaceProps = {
  animations?: boolean;
  initialPageByRowId?: Record<string, string>;
  initialRowId?: string;
  keyboard?: boolean;
  onStateChange?: (state: {
    activePageByRowId: Record<string, string>;
    activeRowId: string;
  }) => void;
  pageJump?: {
    pageId: string;
    rowId: string;
    serial: number;
  } | null;
  rowJump?: {
    rowId: string;
    serial: number;
  } | null;
  rows: WorkspaceRow[];
  swipe?: boolean;
};

type Gesture = {
  axis: Axis | null;
  interactive: boolean;
  samples: Array<{ position: number; time: number }>;
  settling: boolean;
  startThreshold: number;
  startX: number;
  startY: number;
};

// The workspace is a track that is always somewhere: at rest it sits at 0
// with a single screen mounted, and during a gesture it holds the screen
// either side along the axis being dragged and follows the pointer. Turning
// a page is that offset being carried to the next stop rather than an event
// firing at the end of a gesture.
export function SwipeWorkspace({
  animations = true,
  initialPageByRowId,
  initialRowId,
  keyboard = true,
  onStateChange,
  pageJump,
  rowJump,
  rows,
  swipe = true
}: SwipeWorkspaceProps) {
  const [activeRowId, setActiveRowId] = useState(
    () => initialRowId ?? rows[0]?.id ?? ""
  );
  const [activePageByRowId, setActivePageByRowId] = useState<
    Record<string, string>
  >(() => getInitialPageMap(rows, initialPageByRowId));
  // Non-null only while a gesture (or its settle) is in flight - that is
  // what mounts the neighbours, so at rest this stays a single screen.
  const [dragAxis, setDragAxis] = useState<Axis | null>(null);

  const trackRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const offset = useRef(0);
  const pendingNavigation = useRef<{ axis: Axis; towards: 1 | -1 } | null>(null);
  const processedPageJumpSerial = useRef<number | null>(null);
  const processedRowJumpSerial = useRef<number | null>(null);
  const suppressClick = useRef(false);

  const rowIndex = Math.max(
    0,
    rows.findIndex((row) => row.id === activeRowId)
  );
  const activeRow = rows[rowIndex];
  const activePageId = activeRow
    ? activePageByRowId[activeRow.id] ?? activeRow.pages[0]?.id
    : undefined;
  const pageIndex = Math.max(
    0,
    activeRow?.pages.findIndex((page) => page.id === activePageId) ?? 0
  );
  const activePage = activeRow?.pages[pageIndex];

  // Whether there is anywhere to go, taken from the rows themselves rather
  // than from the mounted neighbours. The neighbours only exist once a
  // render has happened, so asking them would make the opening moments of
  // every drag behave like an edge and feel sticky.
  const canGo = (axis: Axis, towards: 1 | -1) => {
    if (axis === "x") {
      return towards === -1
        ? pageIndex > 0
        : pageIndex < (activeRow?.pages.length ?? 0) - 1;
    }

    return towards === -1 ? rowIndex > 0 : rowIndex < rows.length - 1;
  };

  const pageForRow = useCallback(
    (row: WorkspaceRow | undefined) => {
      if (!row) return undefined;

      const savedPageId =
        activePageByRowId[row.id] ?? row.initialPageId ?? row.pages[0]?.id;

      return row.pages.find((page) => page.id === savedPageId) ?? row.pages[0];
    },
    [activePageByRowId]
  );

  // What sits either side of the active screen along the axis in play.
  // "next" is always the one revealed by dragging left/up, matching the
  // directions the keyboard and the old gesture already used.
  const neighbours = useMemo(() => {
    if (!dragAxis) return { next: undefined, previous: undefined };

    if (dragAxis === "x") {
      return {
        next: activeRow?.pages[pageIndex + 1],
        previous: activeRow?.pages[pageIndex - 1]
      };
    }

    return {
      next: pageForRow(rows[rowIndex + 1]),
      previous: pageForRow(rows[rowIndex - 1])
    };
  }, [activeRow, dragAxis, pageForRow, pageIndex, rowIndex, rows]);

  useEffect(() => {
    onStateChange?.({ activePageByRowId, activeRowId });
  }, [activePageByRowId, activeRowId, onStateChange]);

  useEffect(() => {
    setActivePageByRowId((current) => {
      const next: Record<string, string> = {};

      for (const row of rows) {
        const existingPageId = current[row.id];
        const hasExistingPage = row.pages.some(
          (page) => page.id === existingPageId
        );

        next[row.id] = hasExistingPage
          ? existingPageId
          : row.initialPageId ??
            initialPageByRowId?.[row.id] ??
            row.pages[0]?.id ??
            "";
      }

      return next;
    });

    setActiveRowId((current) =>
      rows.some((row) => row.id === current) ? current : rows[0]?.id ?? ""
    );
  }, [initialPageByRowId, rows]);

  useEffect(() => {
    if (!pageJump) return;
    if (processedPageJumpSerial.current === pageJump.serial) return;

    const row = rows.find((candidate) => candidate.id === pageJump.rowId);
    const page = row?.pages.find((candidate) => candidate.id === pageJump.pageId);

    if (!row || !page) return;

    processedPageJumpSerial.current = pageJump.serial;

    setActivePageByRowId((current) =>
      current[row.id] === page.id
        ? current
        : {
            ...current,
            [row.id]: page.id
          }
    );
  }, [pageJump, rows]);

  // initialRowId only seeds the first render, so moving to another row from
  // outside (creating a notebook, say) needs its own signal - the same
  // serial-guarded shape as pageJump. An unknown row isn't marked as
  // processed, so a jump issued before its row exists still lands once the
  // row shows up.
  useEffect(() => {
    if (!rowJump) return;
    if (processedRowJumpSerial.current === rowJump.serial) return;
    if (!rows.some((row) => row.id === rowJump.rowId)) return;

    processedRowJumpSerial.current = rowJump.serial;
    setActiveRowId(rowJump.rowId);
  }, [rowJump, rows]);

  const extentFor = (axis: Axis) => {
    const element = trackRef.current;
    if (!element) return 1;

    return axis === "x" ? element.clientWidth : element.clientHeight;
  };

  const paint = () => {
    const element = trackRef.current;
    const current = gesture.current;
    if (!element || !current?.axis) return;

    element.style.transform =
      current.axis === "x"
        ? `translate3d(${offset.current}px, 0, 0)`
        : `translate3d(0, ${offset.current}px, 0)`;
  };

  // Commits the page or row the offset has been carried to, then puts the
  // track back at rest in the same synchronous step, so the newly centred
  // screen is never painted at the old offset.
  const settleTo = (direction: 1 | -1 | 0, axis: Axis) => {
    const element = trackRef.current;
    const target = direction === 0 ? 0 : direction * extentFor(axis);

    // Where the track was carried to, read from the rows rather than from
    // the mounted neighbours: those only exist once a render has happened,
    // so a gesture that begins and ends inside one tick would otherwise
    // move the page under the finger and then quietly fail to commit.
    const step = direction === 1 ? -1 : 1;

    const finish = () => {
      flushSync(() => {
        if (direction !== 0) {
          if (axis === "x" && activeRow) {
            const target = activeRow.pages[pageIndex + step];
            if (target) {
              setActivePageByRowId((current) => ({
                ...current,
                [activeRow.id]: target.id
              }));
            }
          } else if (axis === "y") {
            const nextRow = rows[rowIndex + step];
            if (nextRow) setActiveRowId(nextRow.id);
          }
        }

        offset.current = 0;
        gesture.current = null;
        setDragAxis(null);
      });

      if (element) {
        element.style.transition = "";
        element.style.transform = "";
      }
    };

    if (!element || !animations || prefersReducedMotion()) {
      finish();
      return;
    }

    let done = false;
    const complete = () => {
      if (done) return;
      done = true;
      window.clearTimeout(fallback);
      element.removeEventListener("transitionend", onEnd);
      finish();
    };
    const onEnd = (event: TransitionEvent) => {
      // transitionend bubbles, so a button's colour transition inside a
      // page would otherwise cut the settle short.
      if (event.target !== element || event.propertyName !== "transform") return;
      complete();
    };
    // A transitionend that never arrives (a backgrounded tab, an
    // interrupted animation) would otherwise leave the gesture mid-settle
    // and swallow every later touch.
    const fallback = window.setTimeout(complete, SETTLE_MS + 120);

    element.addEventListener("transitionend", onEnd);
    // Flush the current transform so the browser has a start value to
    // animate from rather than jumping straight to the target.
    void element.offsetWidth;
    element.style.transition = `transform ${SETTLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    element.style.transform =
      axis === "x"
        ? `translate3d(${target}px, 0, 0)`
        : `translate3d(0, ${target}px, 0)`;

    // A transform that doesn't actually change fires no transitionend.
    if (offset.current === target) complete();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!swipe) return;
    if (gesture.current?.settling) return;

    gesture.current = {
      axis: null,
      interactive: isInteractiveTarget(event.target),
      samples: [],
      settling: false,
      startThreshold: isTextEntryTarget(event.target)
        ? TEXT_DRAG_START_PX
        : DRAG_START_PX,
      startX: event.clientX,
      startY: event.clientY
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!swipe || !current || current.settling) return;

    const deltaX = event.clientX - current.startX;
    const deltaY = event.clientY - current.startY;

    // The axis is chosen once, by whichever way the finger committed first,
    // and then held - otherwise a diagonal drag wobbles between turning a
    // page and changing row.
    if (!current.axis) {
      const travelled = Math.max(Math.abs(deltaX), Math.abs(deltaY));
      if (travelled < current.startThreshold) return;

      current.axis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
      setDragAxis(current.axis);
    }

    const raw = current.axis === "x" ? deltaX : deltaY;
    const canMove = canGo(current.axis, raw > 0 ? -1 : 1);
    offset.current = canMove ? raw : raw * EDGE_RESISTANCE;

    const now = event.timeStamp || performance.now();
    current.samples.push({ position: raw, time: now });
    while (
      current.samples.length > 2 &&
      now - current.samples[0].time > VELOCITY_WINDOW_MS
    ) {
      current.samples.shift();
    }

    // Written straight to the node rather than through state: a re-render
    // per pointermove would drag a few hundred token buttons through React
    // on every frame of every swipe. Written synchronously rather than in
    // an animation frame, because pointermove is already delivered at most
    // once per frame, and a frame callback never arrives at all while the
    // tab is in the background - which would leave a drag stuck mid-air.
    paint();
  };

  const endGesture = () => {
    const current = gesture.current;
    if (!current) return;

    if (!current.axis) {
      gesture.current = null;
      return;
    }

    if (current.interactive && Math.abs(offset.current) > 0) {
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 250);
    }

    const axis = current.axis;
    const extent = extentFor(axis);
    const travelled = offset.current;
    const velocity = velocityOf(current.samples);
    const direction = travelled > 0 ? 1 : -1;
    const reachable = canGo(axis, direction === 1 ? -1 : 1);
    const carried =
      Math.abs(travelled) > extent * COMMIT_FRACTION ||
      (Math.abs(velocity) > FLICK_VELOCITY_PX_PER_MS &&
        Math.sign(velocity) === direction);

    current.settling = true;
    settleTo(carried && reachable ? direction : 0, axis);
  };

  useEffect(() => {
    const onWindowUp = () => {
      if (gesture.current && !gesture.current.settling) endGesture();
    };

    window.addEventListener("pointerup", onWindowUp);
    window.addEventListener("pointercancel", onWindowUp);
    return () => {
      window.removeEventListener("pointerup", onWindowUp);
      window.removeEventListener("pointercancel", onWindowUp);
    };
  });

  // Keyboard navigation carries the track the same way a finger does, so
  // there is one way a screen moves rather than two that can disagree.
  const navigate = useCallback(
    (direction: Direction) => {
      if (gesture.current || !activeRow || !activePage) return;

      const axis: Axis = direction === "left" || direction === "right" ? "x" : "y";
      const towardsNext = direction === "right" || direction === "down";

      const target =
        axis === "x"
          ? activeRow.pages[pageIndex + (towardsNext ? 1 : -1)]
          : pageForRow(rows[rowIndex + (towardsNext ? 1 : -1)]);

      if (!target) return;

      gesture.current = {
        axis,
        interactive: false,
        samples: [],
        settling: true,
        startThreshold: 0,
        startX: 0,
        startY: 0
      };
      offset.current = 0;
      pendingNavigation.current = { axis, towards: towardsNext ? -1 : 1 };
      setDragAxis(axis);
    },
    [activePage, activeRow, pageForRow, pageIndex, rowIndex, rows]
  );

  useEffect(() => {
    const pending = pendingNavigation.current;
    if (!pending || !dragAxis) return;

    pendingNavigation.current = null;
    settleTo(pending.towards, pending.axis);
  });

  useEffect(() => {
    if (!keyboard) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextEntryTarget(event.target)) return;

      if (event.key === "ArrowLeft") navigate("left");
      if (event.key === "ArrowRight") navigate("right");
      if (event.key === "ArrowUp") navigate("up");
      if (event.key === "ArrowDown") navigate("down");

      if (event.key.startsWith("Arrow")) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [keyboard, navigate]);

  const content = useMemo(() => activePage?.render() ?? null, [activePage]);

  return (
    <main
      className="h-dvh w-screen touch-none overflow-hidden bg-background text-foreground"
      onClickCapture={(event) => {
        if (!suppressClick.current) return;

        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerCancel={endGesture}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endGesture}
    >
      <div className="relative h-full w-full overflow-hidden">
        <div className="absolute inset-0" ref={trackRef}>
          {neighbours.previous ? (
            <Screen offset={dragAxis === "y" ? "up" : "left"}>
              {neighbours.previous.render()}
            </Screen>
          ) : null}
          <Screen>{content}</Screen>
          {neighbours.next ? (
            <Screen offset={dragAxis === "y" ? "down" : "right"}>
              {neighbours.next.render()}
            </Screen>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function Screen({
  children,
  offset
}: {
  children: ReactNode;
  offset?: "down" | "left" | "right" | "up";
}) {
  const style: CSSProperties | undefined = offset
    ? {
        transform: {
          down: "translate3d(0, 100%, 0)",
          left: "translate3d(-100%, 0, 0)",
          right: "translate3d(100%, 0, 0)",
          up: "translate3d(0, -100%, 0)"
        }[offset]
      }
    : undefined;

  return (
    <section
      className="absolute inset-0 h-dvh w-screen select-none bg-white dark:bg-neutral-950"
      style={style}
    >
      {children}
    </section>
  );
}

// Pixels per millisecond over the tail of the gesture, so a quick flick
// reads as intent even when it never travelled far.
function velocityOf(samples: Array<{ position: number; time: number }>) {
  if (samples.length < 2) return 0;

  const last = samples[samples.length - 1];
  const first = samples[0];
  const elapsed = last.time - first.time;

  if (elapsed < MIN_VELOCITY_WINDOW_MS) return 0;

  return (last.position - first.position) / elapsed;
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

function getInitialPageMap(
  rows: WorkspaceRow[],
  initialPageByRowId?: Record<string, string>
) {
  return Object.fromEntries(
    rows.map((row) => [
      row.id,
      row.initialPageId ?? initialPageByRowId?.[row.id] ?? row.pages[0]?.id ?? ""
    ])
  );
}

function isInteractiveTarget(target: EventTarget | null) {
  return matchesTarget(
    target,
    "a, button, input, select, textarea, summary, [contenteditable='true']"
  );
}

function isTextEntryTarget(target: EventTarget | null) {
  return matchesTarget(
    target,
    "input, select, textarea, [contenteditable='true']"
  );
}

function matchesTarget(target: EventTarget | null, selector: string) {
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;

  return element ? Boolean(element.closest(selector)) : false;
}
