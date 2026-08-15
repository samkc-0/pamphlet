import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

const SWIPE_THRESHOLD = 48;
const TRANSITION_MS = 300;

type Direction = "left" | "right" | "up" | "down";

type Point = {
  x: number;
  y: number;
};

type ScreenTransition = {
  direction: Direction;
  from: ReactNode;
  key: number;
  to: ReactNode;
};

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
  initialRowId?: string;
  keyboard?: boolean;
  rows: WorkspaceRow[];
  swipe?: boolean;
};

export function SwipeWorkspace({
  initialRowId,
  keyboard = true,
  rows,
  swipe = true
}: SwipeWorkspaceProps) {
  const [activeRowId, setActiveRowId] = useState(
    () => initialRowId ?? rows[0]?.id ?? ""
  );
  const [activePageByRowId, setActivePageByRowId] = useState<
    Record<string, string>
  >(() => getInitialPageMap(rows));
  const [transition, setTransition] = useState<ScreenTransition | null>(null);
  const pointerStart = useRef<Point | null>(null);
  const transitionTimer = useRef<number | null>(null);

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
          : row.initialPageId ?? row.pages[0]?.id ?? "";
      }

      return next;
    });

    setActiveRowId((current) =>
      rows.some((row) => row.id === current) ? current : rows[0]?.id ?? ""
    );
  }, [rows]);

  const startTransition = useCallback(
    (to: ReactNode, direction: Direction, commit: () => void) => {
      if (transition || !activePage) return;

      setTransition({
        direction,
        from: activePage.render(),
        key: Date.now(),
        to
      });

      transitionTimer.current = window.setTimeout(() => {
        commit();
        setTransition(null);
        transitionTimer.current = null;
      }, TRANSITION_MS);
    },
    [activePage, transition]
  );

  const navigate = useCallback(
    (direction: Direction) => {
      if (!activeRow || !activePage || transition) return;

      if (direction === "left" || direction === "right") {
        const step = direction === "left" ? -1 : 1;
        const nextPageIndex = clamp(pageIndex + step, 0, activeRow.pages.length - 1);
        const nextPage = activeRow.pages[nextPageIndex];

        if (!nextPage || nextPage.id === activePage.id) return;

        startTransition(nextPage.render(), direction, () => {
          setActivePageByRowId((current) => ({
            ...current,
            [activeRow.id]: nextPage.id
          }));
        });
      }

      if (direction === "up" || direction === "down") {
        const step = direction === "up" ? -1 : 1;
        const nextRowIndex = clamp(rowIndex + step, 0, rows.length - 1);
        const nextRow = rows[nextRowIndex];

        if (!nextRow || nextRow.id === activeRow.id) return;

        const savedPageId =
          activePageByRowId[nextRow.id] ??
          nextRow.initialPageId ??
          nextRow.pages[0]?.id;
        const nextPage =
          nextRow.pages.find((page) => page.id === savedPageId) ??
          nextRow.pages[0];

        if (!nextPage) return;

        startTransition(nextPage.render(), direction, () => {
          setActiveRowId(nextRow.id);
        });
      }
    },
    [
      activePage,
      activePageByRowId,
      activeRow,
      pageIndex,
      rowIndex,
      rows,
      startTransition,
      transition
    ]
  );

  useEffect(() => {
    if (!keyboard) return;

    const onKeyDown = (event: KeyboardEvent) => {
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

  useEffect(() => {
    return () => {
      if (transitionTimer.current) {
        window.clearTimeout(transitionTimer.current);
      }
    };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!swipe) return;
    if (isInteractiveTarget(event.target)) {
      pointerStart.current = null;
      return;
    }

    pointerStart.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!swipe || !pointerStart.current) return;

    const deltaX = event.clientX - pointerStart.current.x;
    const deltaY = event.clientY - pointerStart.current.y;
    pointerStart.current = null;

    if (
      Math.abs(deltaX) < SWIPE_THRESHOLD &&
      Math.abs(deltaY) < SWIPE_THRESHOLD
    ) {
      return;
    }

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      navigate(deltaX < 0 ? "right" : "left");
    } else {
      navigate(deltaY < 0 ? "down" : "up");
    }
  };

  const content = useMemo(() => activePage?.render() ?? null, [activePage]);

  return (
    <main
      className="h-dvh w-screen overflow-hidden bg-background text-foreground"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <div className="relative h-full w-full overflow-hidden">
        {transition ? (
          <div key={transition.key}>
            <Screen animationClass={getExitClass(transition.direction)}>
              {transition.from}
            </Screen>
            <Screen animationClass={getEnterClass(transition.direction)}>
              {transition.to}
            </Screen>
          </div>
        ) : (
          <Screen>{content}</Screen>
        )}
      </div>
    </main>
  );
}

function Screen({
  animationClass,
  children
}: {
  animationClass?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`absolute inset-0 h-dvh w-screen select-none bg-white ${animationClass ?? ""}`}
    >
      {children}
    </section>
  );
}

function getInitialPageMap(rows: WorkspaceRow[]) {
  return Object.fromEntries(
    rows.map((row) => [row.id, row.initialPageId ?? row.pages[0]?.id ?? ""])
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isInteractiveTarget(target: EventTarget) {
  return target instanceof Element
    ? Boolean(
        target.closest(
          "a, button, input, select, textarea, summary, [contenteditable='true']"
        )
      )
    : false;
}

function getExitClass(direction: Direction) {
  return {
    left: "screen-exit-right",
    right: "screen-exit-left",
    up: "screen-exit-down",
    down: "screen-exit-up"
  }[direction];
}

function getEnterClass(direction: Direction) {
  return {
    left: "screen-enter-left",
    right: "screen-enter-right",
    up: "screen-enter-up",
    down: "screen-enter-down"
  }[direction];
}
