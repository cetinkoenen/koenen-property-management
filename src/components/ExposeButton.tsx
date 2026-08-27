
import { useEffect, useState } from "react";
import { createExposeSignedUrl } from "../lib/uploadExpose";

type ExposeButtonProps = {
  exposePath?: string | null;
};

function emptyButton() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 110,
        padding: "8px 14px",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        background: "#f9fafb",
        fontSize: 14,
        fontWeight: 800,
        color: "#9ca3af",
        whiteSpace: "nowrap",
      }}
      title="Noch kein Exposé hinterlegt"
    >
      Kein Exposé
    </span>
  );
}

export default function ExposeButton({ exposePath }: ExposeButtonProps) {
  const cleanedPath = typeof exposePath === "string" ? exposePath.trim() : "";
  const [linkState, setLinkState] = useState<{ path: string; url: string; failed: boolean }>({ path: "", url: "", failed: false });

  useEffect(() => {
    let cancelled = false;
    if (!cleanedPath) return;
    createExposeSignedUrl(cleanedPath)
      .then((url) => {
        if (!cancelled) setLinkState({ path: cleanedPath, url, failed: false });
      })
      .catch((error) => {
        console.warn("Exposé-Link konnte nicht geladen werden", error);
        if (!cancelled) setLinkState({ path: cleanedPath, url: "", failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [cleanedPath]);

  if (!cleanedPath || (linkState.path === cleanedPath && linkState.failed)) {
    return emptyButton();
  }

  if (linkState.path !== cleanedPath || !linkState.url) return <span aria-live="polite">Exposé wird geladen…</span>;

  return (
    <a
      href={linkState.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 110,
        padding: "8px 14px",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        background: "#ffffff",
        fontSize: 14,
        fontWeight: 800,
        color: "#111827",
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}
      title={cleanedPath}
    >
      Exposé
    </a>
  );
}
