import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

const ROWS = ["A", "B", "C", "D", "E", "F"] as const;
const COLUMN_COUNT = 8;
const SWIPE_THRESHOLD = 48;
const TRANSITION_MS = 300;

type Direction = "left" | "right" | "up" | "down";

type ScreenTransition = {
  from: string;
  to: string;
  direction: Direction;
  key: number;
};

type Point = {
  x: number;
  y: number;
};

function App() {
  const [currentRow, setCurrentRow] = useState(0);
  const [rowColumns, setRowColumns] = useState<number[]>(
    () => new Array(ROWS.length).fill(0)
  );
  const [transition, setTransition] = useState<ScreenTransition | null>(null);
  const pointerStart = useRef<Point | null>(null);
  const transitionTimer = useRef<number | null>(null);

  const currentColumn = rowColumns[currentRow];
  const coordinate = getCoordinate(currentRow, currentColumn);

  const startTransition = useCallback(
    (
      toRow: number,
      toColumn: number,
      direction: Direction,
      commit: () => void
    ) => {
      if (transition) return;

      setTransition({
        from: coordinate,
        to: getCoordinate(toRow, toColumn),
        direction,
        key: Date.now()
      });

      transitionTimer.current = window.setTimeout(() => {
        commit();
        setTransition(null);
        transitionTimer.current = null;
      }, TRANSITION_MS);
    },
    [coordinate, transition]
  );

  const navigate = useCallback(
    (direction: Direction) => {
      if (transition) return;

      if (direction === "left" || direction === "right") {
        const step = direction === "left" ? -1 : 1;
        const nextColumn = clamp(currentColumn + step, 0, COLUMN_COUNT - 1);

        if (nextColumn === currentColumn) return;

        startTransition(currentRow, nextColumn, direction, () => {
          setRowColumns((columns) => {
            const next = [...columns];
            next[currentRow] = nextColumn;
            return next;
          });
        });
      }

      if (direction === "up" || direction === "down") {
        const step = direction === "up" ? -1 : 1;
        const nextRow = clamp(currentRow + step, 0, ROWS.length - 1);

        if (nextRow === currentRow) return;

        startTransition(nextRow, rowColumns[nextRow], direction, () => {
          setCurrentRow(nextRow);
        });
      }
    },
    [
      currentColumn,
      currentRow,
      rowColumns,
      startTransition,
      transition
    ]
  );

  useEffect(() => {
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
  }, [navigate]);

  useEffect(() => {
    return () => {
      if (transitionTimer.current) {
        window.clearTimeout(transitionTimer.current);
      }
    };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pointerStart.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerStart.current) return;

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

  return (
    <main
      className="h-dvh w-screen overflow-hidden bg-background text-foreground"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <div className="relative h-full w-full overflow-hidden">
        {transition ? (
          <div key={transition.key}>
            <Screen
              animationClass={getExitClass(transition.direction)}
              coordinate={transition.from}
            />
            <Screen
              animationClass={getEnterClass(transition.direction)}
              coordinate={transition.to}
            />
          </div>
        ) : (
          <Screen coordinate={coordinate} />
        )}
      </div>

      <div className="pointer-events-none fixed inset-x-0 top-0 flex items-center justify-between p-3 sm:p-4">
        <div className="rounded-md border border-border bg-background/90 px-3 py-2 text-sm shadow-sm backdrop-blur">
          <span className="font-medium">{coordinate}</span>
          <span className="ml-2 text-muted-foreground">
            Row positions: {ROWS.map((row, index) => `${row}${rowColumns[index] + 1}`).join(", ")}
          </span>
        </div>
      </div>

      <nav
        aria-label="Grid navigation"
        className="pointer-events-none fixed bottom-4 left-1/2 grid -translate-x-1/2 grid-cols-3 gap-2"
      >
        <div />
        <Button
          aria-label="Move up"
          className="pointer-events-auto bg-background/95 text-foreground shadow-md hover:bg-muted"
          disabled={currentRow === 0}
          onClick={() => navigate("up")}
          size="icon"
          variant="secondary"
        >
          <ArrowUp className="h-5 w-5" />
        </Button>
        <div />
        <Button
          aria-label="Move left"
          className="pointer-events-auto bg-background/95 text-foreground shadow-md hover:bg-muted"
          disabled={currentColumn === 0}
          onClick={() => navigate("left")}
          size="icon"
          variant="secondary"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Button
          aria-label="Current screen"
          className="pointer-events-auto min-w-16 bg-background/95 px-3 text-foreground shadow-md hover:bg-background/95"
          disabled
          variant="secondary"
        >
          {coordinate}
        </Button>
        <Button
          aria-label="Move right"
          className="pointer-events-auto bg-background/95 text-foreground shadow-md hover:bg-muted"
          disabled={currentColumn === COLUMN_COUNT - 1}
          onClick={() => navigate("right")}
          size="icon"
          variant="secondary"
        >
          <ArrowRight className="h-5 w-5" />
        </Button>
        <div />
        <Button
          aria-label="Move down"
          className="pointer-events-auto bg-background/95 text-foreground shadow-md hover:bg-muted"
          disabled={currentRow === ROWS.length - 1}
          onClick={() => navigate("down")}
          size="icon"
          variant="secondary"
        >
          <ArrowDown className="h-5 w-5" />
        </Button>
        <div />
      </nav>
    </main>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getCoordinate(row: number, column: number) {
  return `${ROWS[row]}${column + 1}`;
}

function Screen({
  animationClass,
  coordinate
}: {
  animationClass?: string;
  coordinate: string;
}) {
  return (
    <section
      aria-label={`Screen ${coordinate}`}
      className={`absolute inset-0 flex h-dvh w-screen select-none items-center justify-center bg-white ${animationClass ?? ""}`}
    >
      <div className="text-center">
        <div className="text-[clamp(4rem,20vw,12rem)] font-semibold leading-none tracking-normal text-neutral-950">
          {coordinate}
        </div>
      </div>
    </section>
  );
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

export default App;
