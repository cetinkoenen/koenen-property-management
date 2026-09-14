import { createClient } from "@supabase/supabase-js";

type RequiredEnvVar = "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY";

function getEnvVar(name: RequiredEnvVar): string {
  const value = import.meta.env[name];

  if (!value || typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `${name} fehlt oder ist leer. Bitte prüfe deine .env-Datei oder die Umgebungsvariablen im Deployment.`
    );
  }

  return value.trim();
}

const supabaseUrl = getEnvVar("VITE_SUPABASE_URL");
const supabaseAnonKey = getEnvVar("VITE_SUPABASE_ANON_KEY");

const nativeFetch = globalThis.fetch.bind(globalThis);

/**
 * Browsers normally connect directly to Supabase. Some company networks, DNS
 * filters and privacy tools block *.supabase.co while the application domain
 * remains reachable. In that case, retry the identical request through the
 * same-origin Vercel rewrite. Authentication headers and RLS remain unchanged.
 */
async function resilientSupabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const requestUrl = request.url;

  try {
    return await nativeFetch(request.clone());
  } catch (directError) {
    if (typeof window === "undefined" || !requestUrl.startsWith(`${supabaseUrl}/`)) {
      throw directError;
    }

    const proxyUrl = `${window.location.origin}/supabase/${requestUrl.slice(supabaseUrl.length + 1)}`;
    return nativeFetch(new Request(proxyUrl, request));
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
  global: {
    fetch: resilientSupabaseFetch,
    headers: {
      "x-application-name": "koenen-property-management",
    },
  },
});
