import { useState } from "react";

type DebugPanelProps = {
  ctx: unknown;
};

export function DebugPanel({ ctx }: DebugPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <button
        onClick={() => setOpen(!open)}
        className="text-sm text-blue-600"
      >
        {open ? "Debug ausblenden" : "Debug anzeigen"}
      </button>

      {open && (
        <pre className="text-xs mt-4 overflow-x-auto">
          {JSON.stringify(ctx, null, 2)}
        </pre>
      )}
    </div>
  );
}
