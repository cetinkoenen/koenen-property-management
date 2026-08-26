import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import JSZip from "https://esm.sh/jszip@3.10.1";

const allowedOrigins = new Set([
  "https://koenen-investment.com",
  "https://www.koenen-investment.com",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://koenen-investment.com",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

type UploadedFilePayload = {
  name: string;
  size: number;
  type: string;
  dataUrl: string;
};

type StorageFilePayload = {
  bucket: string;
  path: string;
  name: string;
  size: number;
  type: string;
};

const reportChapters = [
  "Executive Summary und Objektübersicht",
  "Standort- und Marktanalyse",
  "Objektbilder, Grundrisse und Bauzeichnungen",
  "Dokumentenprüfung: Teilungserklärung, Energieausweis, Mietvertrag",
  "Wirtschaftsplan und Hausgeldanalyse",
  "Rendite-, Cashflow- und Finanzierungsanalyse",
  "WEG-Analyse und Risikoanalyse",
  "Kaufempfehlung und Bankfazit",
];

const INVESTMENT_ANALYSIS_BUCKET = "investment-analysis-files";
const MAX_STORAGE_FILES = 24;

function isStorageFileForUser(file: StorageFilePayload, userId: string) {
  const path = String(file.path ?? "");
  return (
    file.bucket === INVESTMENT_ANALYSIS_BUCKET &&
    path.startsWith(`${userId}/`) &&
    !path.includes("..") &&
    !path.includes("//") &&
    path.length <= 512
  );
}

const reportSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "statusLabel",
    "summary",
    "risks",
    "nextSteps",
    "chapterStatus",
    "bankFazit",
    "profile",
    "financialScenarios",
    "riskMatrix",
    "openQuestions",
    "documentFindings",
  ],
  properties: {
    statusLabel: { type: "string" },
    summary: { type: "string" },
    risks: { type: "array", items: { type: "string" } },
    nextSteps: { type: "array", items: { type: "string" } },
    chapterStatus: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["chapter", "status", "note"],
        properties: {
          chapter: { type: "string", enum: reportChapters },
          status: { type: "string", enum: ["Bereit", "Prüfen", "Offen"] },
          note: { type: "string" },
        },
      },
    },
    bankFazit: { type: "string" },
    profile: {
      type: "object",
      additionalProperties: false,
      required: [
        "objectType",
        "address",
        "purchasePrice",
        "buyerProvision",
        "acquisitionCosts",
        "livingArea",
        "rooms",
        "monthlyRent",
        "monthlyHousegeld",
        "annualRent",
        "grossYieldPurchasePrice",
        "grossYieldAcquisitionCosts",
        "purchaseFactor",
        "rentPerSqm",
        "monthlySurplusBeforeFinancing",
        "energyValue",
        "energyClass",
        "heating",
        "investorScore",
        "recommendation",
        "bankKeyMessage",
        "housegeldNote",
      ],
      properties: {
        objectType: { type: "string" },
        address: { type: "string" },
        purchasePrice: { type: ["number", "null"] },
        buyerProvision: { type: ["number", "null"] },
        acquisitionCosts: { type: ["number", "null"] },
        livingArea: { type: ["number", "null"] },
        rooms: { type: ["number", "null"] },
        monthlyRent: { type: ["number", "null"] },
        monthlyHousegeld: { type: ["number", "null"] },
        annualRent: { type: ["number", "null"] },
        grossYieldPurchasePrice: { type: ["number", "null"] },
        grossYieldAcquisitionCosts: { type: ["number", "null"] },
        purchaseFactor: { type: ["number", "null"] },
        rentPerSqm: { type: ["number", "null"] },
        monthlySurplusBeforeFinancing: { type: ["number", "null"] },
        energyValue: { type: "string" },
        energyClass: { type: "string" },
        heating: { type: "string" },
        investorScore: { type: "string" },
        recommendation: { type: "string" },
        bankKeyMessage: { type: "string" },
        housegeldNote: { type: "string" },
      },
    },
    financialScenarios: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "loanAmount", "monthlyRate", "cashflowAfterRate"],
        properties: {
          label: { type: "string" },
          loanAmount: { type: "number" },
          monthlyRate: { type: "number" },
          cashflowAfterRate: { type: ["number", "null"] },
        },
      },
    },
    riskMatrix: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "rating", "finding"],
        properties: {
          field: { type: "string" },
          rating: { type: "string" },
          finding: { type: "string" },
        },
      },
    },
    openQuestions: { type: "array", items: { type: "string" } },
    documentFindings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["document", "status", "finding"],
        properties: {
          document: { type: "string" },
          status: { type: "string" },
          finding: { type: "string" },
        },
      },
    },
  },
};

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function extractOutputText(data: Record<string, unknown>) {
  if (typeof data.output_text === "string") return data.output_text;

  const output = Array.isArray(data.output) ? data.output : [];
  const textParts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown }).content)
      ? (item as { content: unknown[] }).content
      : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") textParts.push(text);
    }
  }
  return textParts.join("\n").trim();
}

function dataUrlToBytes(dataUrl: string) {
  const [, base64 = ""] = dataUrl.split(",");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string) {
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function mimeFromName(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

function isSupportedForAi(name: string) {
  return /\.(pdf|docx|doc|xlsx|xls|jpg|jpeg|png|txt)$/i.test(name);
}

async function expandZipFiles(files: UploadedFilePayload[]) {
  const expanded: UploadedFilePayload[] = [];
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".zip")) continue;
    const zip = await JSZip.loadAsync(dataUrlToBytes(file.dataUrl));
    const entries = Object.values(zip.files).filter((entry) => !entry.dir && isSupportedForAi(entry.name));
    for (const entry of entries.slice(0, 20)) {
      const bytes = await entry.async("uint8array");
      const type = mimeFromName(entry.name);
      expanded.push({
        name: `${file.name}/${entry.name}`,
        type,
        size: bytes.byteLength,
        dataUrl: `data:${type};base64,${bytesToBase64(bytes)}`,
      });
    }
  }
  return expanded;
}

async function blobToBytes(blob: Blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Nur POST ist erlaubt." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(req, { error: "Supabase Edge Function ist nicht vollständig konfiguriert." }, 500);
  }

  if (!openaiApiKey) {
    return jsonResponse(
      req,
      {
        error:
          "OPENAI_API_KEY fehlt in Supabase Secrets. Bitte in Supabase setzen, damit die Dokumente wirklich per KI analysiert werden können.",
      },
      503,
    );
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return jsonResponse(req, { error: "Nicht angemeldet oder Sitzung abgelaufen." }, 401);
  }

  const payload = await req.json();
  const storageFiles: StorageFilePayload[] = Array.isArray(payload.storageFiles) ? payload.storageFiles : [];
  if (!storageFiles.length) {
    return jsonResponse(req, { error: "Keine Unterlagen übertragen." }, 400);
  }
  if (storageFiles.length > MAX_STORAGE_FILES) {
    return jsonResponse(req, { error: `Maximal ${MAX_STORAGE_FILES} Unterlagen pro Analyse erlaubt.` }, 400);
  }
  if (!storageFiles.every((file) => isStorageFileForUser(file, user.id))) {
    return jsonResponse(req, { error: "Unterlagenpfad ist nicht fuer diesen Nutzer freigegeben." }, 403);
  }

  const cleanupTargets = storageFiles.reduce<Record<string, string[]>>((groups, file) => {
    groups[file.bucket] = [...(groups[file.bucket] ?? []), file.path];
    return groups;
  }, {});

  async function cleanupStorageFiles() {
    await Promise.all(
      Object.entries(cleanupTargets).map(([bucket, paths]) => supabase.storage.from(bucket).remove(paths)),
    );
  }

  const files: UploadedFilePayload[] = [];
  try {
    for (const storageFile of storageFiles) {
      const { data, error } = await supabase.storage.from(storageFile.bucket).download(storageFile.path);
      if (error || !data) {
        throw new Error(`Unterlage konnte nicht gelesen werden: ${storageFile.name}`);
      }
      const bytes = await blobToBytes(data);
      const type = storageFile.type || mimeFromName(storageFile.name);
      files.push({
        name: storageFile.name,
        type,
        size: bytes.byteLength,
        dataUrl: bytesToDataUrl(bytes, type),
      });
    }
  } catch (error) {
    await cleanupStorageFiles();
    return jsonResponse(
      req,
      { error: error instanceof Error ? error.message : "Unterlagen konnten nicht aus dem Storage gelesen werden." },
      500,
    );
  }

  const expandedZipFiles = await expandZipFiles(files);
  const allReadableFiles = [...files.filter((file) => !file.name.toLowerCase().endsWith(".zip")), ...expandedZipFiles];

  const manifest = [...files, ...expandedZipFiles].map((file) => ({
    name: file.name,
    type: file.type,
    sizeMb: Math.round((file.size / 1024 / 1024) * 10) / 10,
  }));

  const prompt = `
Du bist ein konservativer Immobilien-Investmentanalyst fuer private Kapitalanleger und Bankvorpruefungen in Deutschland.

Aufgabe:
- Analysiere die hochgeladenen Unterlagen inhaltlich, nicht nur Dateinamen.
- Erstelle eine fachliche Erstbewertung aus finanzieller, technischer, mietrechtlicher, WEG- und Investmentsicht.
- Liefere die Kapitel 1 bis 8 exakt in der vorgegebenen Struktur.
- Uebernimm keine Beispielwerte und erfinde keine Zahlen. Wenn ein Wert nicht in Unterlagen oder Eingabefeldern steht, nutze null oder "offen/zu pruefen".
- Jede Zahl muss aus Unterlagen oder Eingabefeldern plausibel abgeleitet sein.
- Markiere widerspruechliche Werte ausdruecklich als Risiko.
- Schreibe auf Deutsch, banknah, klar und konservativ.

Kapitel:
${reportChapters.map((chapter, index) => `${index + 1}. ${chapter}`).join("\n")}

Manuelle Eingaben:
Objekt: ${payload.objectName || "offen"}
Standort: ${payload.location || "offen"}
Kaufpreis: ${payload.purchasePrice || "offen"}
Kaeuferprovision: ${payload.buyerProvision || "offen"}
Eigenkapital: ${payload.equity || "offen"}
Soll-/Zielmiete: ${payload.targetRent || "offen"}
Wohnflaeche: ${payload.livingArea || "offen"}
Zimmer: ${payload.rooms || "offen"}
Hausgeld: ${payload.monthlyHousegeld || "offen"}
Sollzins: ${payload.interestRate || "offen"}
Tilgung: ${payload.amortizationRate || "offen"}

Dateimanifest:
${manifest.map((file) => `- ${file.name} (${file.type || "Datei"}, ${file.sizeMb} MB)`).join("\n")}
`;

  const supportedFiles = allReadableFiles
    .filter((file) => file.dataUrl && isSupportedForAi(file.name))
    .slice(0, 12)
    .map((file) => ({
      type: "input_file",
      filename: file.name,
      file_data: file.dataUrl,
    }));

  const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_MODEL") || "gpt-5-mini",
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: prompt }, ...supportedFiles],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "investment_report",
          strict: true,
          schema: reportSchema,
        },
      },
    }),
  });

  const openaiData = await openaiResponse.json();

  if (!openaiResponse.ok) {
    await cleanupStorageFiles();
    return jsonResponse(
      req,
      {
        error:
          typeof openaiData?.error?.message === "string"
            ? openaiData.error.message
            : "OpenAI konnte die Investmentanalyse nicht erstellen.",
      },
      502,
    );
  }

  const outputText = extractOutputText(openaiData);
  if (!outputText) {
    await cleanupStorageFiles();
    return jsonResponse(req, { error: "OpenAI hat keinen auswertbaren Berichtstext zurückgegeben." }, 502);
  }

  try {
    const report = JSON.parse(outputText);
    await cleanupStorageFiles();
    return jsonResponse(req, {
      report: {
        ...report,
        generatedAt: new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" }),
      },
    });
  } catch {
    await cleanupStorageFiles();
    return jsonResponse(req, { error: "KI-Antwort konnte nicht als strukturierter Bericht gelesen werden." }, 502);
  }
});
