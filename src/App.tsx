import { useMemo } from "react";

import {
  SwipeWorkspace,
  type WorkspaceRow
} from "@/components/swipe-workspace";

function App() {
  const rows = useMemo(() => createCoordinateRows(), []);

  return <SwipeWorkspace rows={rows} />;
}

function createCoordinateRows(): WorkspaceRow[] {
  const rowLabels = ["A", "B", "C", "D", "E", "F"];

  return rowLabels.map((rowLabel) => ({
    id: rowLabel,
    pages: Array.from({ length: 8 }, (_, pageIndex) => {
      const coordinate = `${rowLabel}${pageIndex + 1}`;

      return {
        id: coordinate,
        render: () => <CoordinateScreen coordinate={coordinate} />
      };
    })
  }));
}

function CoordinateScreen({ coordinate }: { coordinate: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="text-[clamp(4rem,20vw,12rem)] font-semibold leading-none tracking-normal text-neutral-950">
        {coordinate}
      </div>
    </div>
  );
}

export default App;
