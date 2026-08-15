import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

const ROWS = ["A", "B", "C", "D", "E", "F"] as const;
const COLUMN_COUNT = 8;
const SWIPE_THRESHOLD = 48;

type Point = {
  x: number;
  y: number;
};

function App() {
  const [currentRow, setCurrentRow] = useState(0);
  const [rowColumns, setRowColumns] = useState<number[]>(
    () => new Array(ROWS.length).fill(0)
  );
  const pointerStart = useRef<Point | null>(null);

  const currentColumn = rowColumns[currentRow];
  const coordinate = `${ROWS[currentRow]}${currentColumn + 1}`;

  const moveHorizontal = useCallback((direction: -1 | 1) => {
    setRowColumns((columns) => {
      const next = [...columns];
      next[currentRow] = clamp(next[currentRow] + direction, 0, COLUMN_COUNT - 1);
      return next;
    });
  }, [currentRow]);

  const moveVertical = useCallback((direction: -1 | 1) => {
    setCurrentRow((row) => clamp(row + direction, 0, ROWS.length - 1));
  }, []);

  const navigate = useCallback(
    (direction: "left" | "right" | "up" | "down") => {
      if (direction === "left") moveHorizontal(-1);
      if (direction === "right") moveHorizontal(1);
      if (direction === "up") moveVertical(-1);
      if (direction === "down") moveVertical(1);
    },
    [moveHorizontal, moveVertical]
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

  const screens = useMemo(() => {
    return ROWS.flatMap((rowLabel) =>
      Array.from({ length: COLUMN_COUNT }, (_, columnIndex) => ({
        id: `${rowLabel}${columnIndex + 1}`,
        rowLabel,
        columnIndex
      }))
    );
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
      <div
        className="grid h-full transition-transform duration-300 ease-out"
        style={{
          gridTemplateColumns: `repeat(${COLUMN_COUNT}, 100vw)`,
          gridTemplateRows: `repeat(${ROWS.length}, 100dvh)`,
          width: `${COLUMN_COUNT * 100}vw`,
          height: `${ROWS.length * 100}dvh`,
          transform: `translate3d(-${currentColumn * 100}vw, -${currentRow * 100}dvh, 0)`
        }}
      >
        {screens.map((screen) => (
          <section
            aria-label={`Screen ${screen.id}`}
            className="relative flex h-dvh w-screen select-none items-center justify-center bg-white"
            key={screen.id}
          >
            <div className="text-center">
              <div className="text-[clamp(4rem,20vw,12rem)] font-semibold leading-none tracking-normal text-neutral-950">
                {screen.id}
              </div>
            </div>
          </section>
        ))}
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

export default App;
