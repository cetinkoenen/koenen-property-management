import { supabase } from "@/lib/supabase";

export const PROPERTY_DOCUMENTS_BUCKET = "property-documents";

export type PropertyDocumentCategory =
  | "mietvertrag"
  | "rechnung"
  | "nk_abrechnung"
  | "energieausweis"
  | "darlehensunterlage"
  | "weg_protokoll"
  | "expose"
  | "steuer"
  | "versicherung"
  | "sonstiges";

export type PropertyDocumentStatus = "vorhanden" | "fehlt" | "läuft_bald_ab" | "abgelaufen" | "archiviert";

export type PropertyDocumentRow = {
  id: string;
  property_id: string | null;
  portfolio_property_id: string | null;
  objekt_code: string | null;
  property_name: string | null;
  title: string;
  category: PropertyDocumentCategory;
  document_year: number | null;
  valid_from: string | null;
  valid_until: string | null;
  status: PropertyDocumentStatus;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  notes: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type UploadPropertyDocumentInput = {
  file: File;
  title?: string;
  category: PropertyDocumentCategory;
  propertyId?: string | null;
  portfolioPropertyId?: string | null;
  objektCode?: string | null;
  propertyName?: string | null;
  documentYear?: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
  notes?: string | null;
  meta?: Record<string, unknown>;
};

function safePathPart(value: unknown, fallback = "unbekannt") {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return normalized || fallback;
}

function buildStoragePath(input: UploadPropertyDocumentInput) {
  const year = input.documentYear ?? new Date().getFullYear();
  const objectPart = safePathPart(input.propertyName ?? input.objektCode ?? input.propertyId ?? input.portfolioPropertyId, "objekt");
  const categoryPart = safePathPart(input.category, "sonstiges");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePart = safePathPart(input.file.name, "dokument");
  return `${objectPart}/${year}/${categoryPart}/${timestamp}-${filePart}`;
}

export async function listPropertyDocuments(params: {
  propertyId?: string | null;
  portfolioPropertyId?: string | null;
  objektCode?: string | null;
  year?: number | null;
} = {}) {
  let query = supabase
    .from("property_documents")
    .select("*")
    .order("document_year", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (params.propertyId) query = query.eq("property_id", params.propertyId);
  if (params.portfolioPropertyId) query = query.eq("portfolio_property_id", params.portfolioPropertyId);
  if (params.objektCode) query = query.eq("objekt_code", params.objektCode);
  if (params.year) query = query.eq("document_year", params.year);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PropertyDocumentRow[];
}

export async function uploadPropertyDocument(input: UploadPropertyDocumentInput) {
  const storagePath = buildStoragePath(input);
  const { error: uploadError } = await supabase.storage
    .from(PROPERTY_DOCUMENTS_BUCKET)
    .upload(storagePath, input.file, { upsert: false, contentType: input.file.type || undefined });

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("property_documents")
    .insert({
      property_id: input.propertyId ?? null,
      portfolio_property_id: input.portfolioPropertyId ?? null,
      objekt_code: input.objektCode ?? null,
      property_name: input.propertyName ?? null,
      title: input.title?.trim() || input.file.name,
      category: input.category,
      document_year: input.documentYear ?? new Date().getFullYear(),
      valid_from: input.validFrom ?? null,
      valid_until: input.validUntil ?? null,
      status: "vorhanden",
      storage_bucket: PROPERTY_DOCUMENTS_BUCKET,
      storage_path: storagePath,
      file_name: input.file.name,
      mime_type: input.file.type || null,
      size_bytes: input.file.size,
      notes: input.notes ?? null,
      meta: input.meta ?? {},
    })
    .select("*")
    .single();

  if (error) {
    await supabase.storage.from(PROPERTY_DOCUMENTS_BUCKET).remove([storagePath]);
    throw error;
  }

  return data as PropertyDocumentRow;
}

export async function getPropertyDocumentSignedUrl(
  storagePath: string,
  expiresInSeconds = 60 * 10,
  storageBucket = PROPERTY_DOCUMENTS_BUCKET,
) {
  if (!storagePath) throw new Error("Dokument hat keinen Storage-Pfad.");

  const { data, error } = await supabase.storage
    .from(storageBucket || PROPERTY_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Supabase konnte keine Vorschau-/Download-URL erzeugen.");

  return data.signedUrl;
}

export async function deletePropertyDocument(document: Pick<PropertyDocumentRow, "id" | "storage_path">) {
  const { error: storageError } = await supabase.storage.from(PROPERTY_DOCUMENTS_BUCKET).remove([document.storage_path]);
  if (storageError) throw storageError;

  const { error } = await supabase.from("property_documents").delete().eq("id", document.id);
  if (error) throw error;
}

export async function getPropertyDocumentSummary(year?: number | null) {
  const { data, error } = await supabase.rpc("get_property_document_summary", { p_year: year ?? null });
  if (error) throw error;
  return data ?? [];
}
