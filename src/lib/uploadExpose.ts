import { supabase } from "./supabaseClient";

const EXPOSE_BUCKET = "exposes";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

type UploadExposeResult = {
  filePath: string;
  signedUrl: string;
};

export type StoredExposeLink = UploadExposeResult & {
  portfolioPropertyId: string;
  corePropertyId: string | null;
  fileName: string;
};

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function createExposeSignedUrl(filePath: string): Promise<string> {
  const cleanedPath = String(filePath ?? "").trim();
  if (!cleanedPath) throw new Error("Exposé-Pfad fehlt.");
  const { data, error } = await supabase.storage
    .from(EXPOSE_BUCKET)
    .createSignedUrl(cleanedPath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    throw new Error(`Geschützter Exposé-Link konnte nicht erstellt werden: ${error?.message ?? "Unbekannter Fehler"}`);
  }
  return data.signedUrl;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateExposeUpload(propertyId: string, file: File | null | undefined) {
  if (!propertyId || typeof propertyId !== "string" || !propertyId.trim()) {
    throw new Error("Ungültige propertyId.");
  }

  if (!file) {
    throw new Error("Keine Datei ausgewählt.");
  }

  if (file.type !== "application/pdf") {
    throw new Error("Nur PDF-Dateien sind erlaubt.");
  }

  if (file.size <= 0) {
    throw new Error("Die ausgewählte Datei ist leer.");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `Die PDF ist zu groß. Erlaubt sind maximal ${formatBytes(
        MAX_FILE_SIZE_BYTES
      )}. Ausgewählt: ${formatBytes(file.size)}.`
    );
  }
}

export async function uploadExpose(
  propertyId: string,
  file: File
): Promise<UploadExposeResult> {
  validateExposeUpload(propertyId, file);

  const normalizedPropertyId = propertyId.trim();
  const filePath = `${normalizedPropertyId}/expose.pdf`;

  if (import.meta.env.DEV) console.debug("[uploadExpose] start", {
    propertyId: normalizedPropertyId,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    filePath,
  });

  // 1. Datei in Supabase Storage hochladen
  const { error: uploadError } = await supabase.storage
    .from(EXPOSE_BUCKET)
    .upload(filePath, file, {
      upsert: true,
      contentType: "application/pdf",
    });

  if (uploadError) {
    console.error("[uploadExpose] storage upload error", uploadError);
    throw new Error(`Storage-Upload fehlgeschlagen: ${uploadError.message}`);
  }

  if (import.meta.env.DEV) console.debug("[uploadExpose] storage upload success", { filePath });

  // 2. DB aktualisieren
  const { data: updatedRows, error: updateError } = await supabase
    .from("portfolio_properties")
    .update({ expose_path: filePath })
    .eq("id", normalizedPropertyId)
    .select("id, name, expose_path");

  if (updateError) {
    console.error("[uploadExpose] db update error", updateError);
    throw new Error(
      `DB-Update für expose_path fehlgeschlagen: ${updateError.message}`
    );
  }

  if (!updatedRows || updatedRows.length === 0) {
    console.error("[uploadExpose] no rows updated", {
      propertyId: normalizedPropertyId,
      filePath,
    });
    throw new Error(
      "DB-Update fehlgeschlagen: Es wurde keine Immobilie aktualisiert."
    );
  }

  if (import.meta.env.DEV) console.debug("[uploadExpose] db update success", updatedRows[0]);

  // 3. Zeitlich begrenzten Link fuer den privaten Bucket erzeugen
  const signedUrl = await createExposeSignedUrl(filePath);

  if (import.meta.env.DEV) console.debug("[uploadExpose] done", {
    propertyId: normalizedPropertyId,
    filePath,
    signedUrl,
  });

  return {
    filePath,
    signedUrl,
  };
}

export async function loadExposeLinks(): Promise<StoredExposeLink[]> {
  const { data, error } = await supabase
    .from("portfolio_properties")
    .select("id,core_property_id,expose_path")
    .not("expose_path", "is", null);

  if (error) throw new Error(`Exposé-Verweise konnten nicht geladen werden: ${error.message}`);

  const links = await Promise.all((data ?? []).map(async (row) => {
    const filePath = String(row.expose_path ?? "").trim();
    if (!filePath) return null;
    let signedUrl: string;
    try {
      signedUrl = await createExposeSignedUrl(filePath);
    } catch (linkError) {
      const message = linkError instanceof Error ? linkError.message : String(linkError);
      // Ein alter DB-Verweis kann nach einer bewussten Storage-Bereinigung noch
      // auf eine nicht mehr vorhandene PDF zeigen. Andere Exposés müssen deshalb
      // weiterhin geladen werden; die betroffene Immobilie erscheint korrekt
      // wieder ohne hinterlegtes PDF.
      if (message.toLowerCase().includes("object not found")) {
        if (import.meta.env.DEV) console.debug("Veralteter Exposé-Verweis wird ignoriert", { filePath });
        return null;
      }
      throw linkError;
    }
    return {
      portfolioPropertyId: String(row.id),
      corePropertyId: row.core_property_id ? String(row.core_property_id) : null,
      filePath,
      signedUrl,
      fileName: filePath.split("/").at(-1) || "expose.pdf",
    };
  }));
  return links.filter((link): link is StoredExposeLink => Boolean(link));
}
