import { useCallback, useEffect, useRef, useState } from "react";

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
