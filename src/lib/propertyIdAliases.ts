export type PropertyIdAliasRow = {
  object_id: string;
  legacy_property_id: string;
};

function cleanId(value: unknown): string {
  return String(value ?? "").trim();
}

export function expandPropertyIdAliases(ids: string[], rows: PropertyIdAliasRow[]): string[] {
  const requested = new Set(ids.map(cleanId).filter(Boolean));
  const relatedCanonicalIds = new Set(
    rows
      .filter((row) => requested.has(cleanId(row.object_id)) || requested.has(cleanId(row.legacy_property_id)))
      .map((row) => cleanId(row.object_id))
      .filter(Boolean),
  );
  return Array.from(new Set(rows
    .filter((row) => relatedCanonicalIds.has(cleanId(row.object_id)))
    .flatMap((row) => [cleanId(row.object_id), cleanId(row.legacy_property_id)])
    .filter(Boolean)));
}
