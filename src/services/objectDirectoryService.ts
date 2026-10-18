import { supabase } from "@/lib/supabase";

export type ObjectDirectoryRow = {
  value: string | null;
  object_id: string | null;
  property_id: string | null;
  objekt_code: string | null;
  label: string | null;
};

/**
 * Zentrale Objektliste der Anwendung.
 *
 * Alle Fachseiten erhalten damit dieselben Objekt-IDs, Codes und Bezeichnungen.
 * Die View wird vollständig und deterministisch paginiert, damit auch ein
 * wachsendes Portfolio nicht auf einzelnen Seiten abgeschnitten wird.
 */
export async function listObjectDirectory(): Promise<ObjectDirectoryRow[]> {
  const pageSize = 500;
  const rows: ObjectDirectoryRow[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("v_object_dropdown")
      .select("value,object_id,property_id,objekt_code,label")
      .order("label", { ascending: true })
      .order("objekt_code", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    const page = (data ?? []) as ObjectDirectoryRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}
