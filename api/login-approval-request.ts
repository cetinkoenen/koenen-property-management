import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";

const ADMIN_EMAIL = "info.koenen@gmail.com";
const READONLY_EMAILS = new Set(["nihal.koenen@gmail.com", "cetin.koenen@gmail.com"]);

type ApiRequest = {
  method?: string;
  headers: { authorization?: string };
};

type ApiResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): { json(payload: unknown): void };
};

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

async function sendAdminMail(email: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "RESEND_API_KEY fehlt" };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.LOGIN_APPROVAL_FROM_EMAIL ?? "Koenen Property Management <onboarding@resend.dev>",
      to: ADMIN_EMAIL,
      subject: "Koenen Property Management: Login-Freigabe erforderlich",
      text: `Der Nutzer ${email} möchte sich bei Koenen Property Management anmelden. Bitte Login-Freigabe in Supabase/app_user_access bestätigen.`,
    }),
  });

  if (!response.ok) {
    return { sent: false, reason: await response.text() };
  }

  return { sent: true };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const authHeader = String(req.headers.authorization ?? "");
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
    if (!token) {
      res.status(401).json({ error: "Auth token missing" });
      return;
    }

    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anonKey) throw new Error("Supabase public env fehlt");

    const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user?.email) {
      res.status(401).json({ error: "Invalid auth token" });
      return;
    }

    const email = normalizeEmail(userData.user.email);
    if (!READONLY_EMAILS.has(email)) {
      res.status(403).json({ error: "User does not require approval" });
      return;
    }

    const admin = supabaseAdmin();
    await admin.from("login_approval_requests").insert({
      email,
      user_id: userData.user.id,
      status: "pending",
      note: "Automatische Login-Benachrichtigung an Admin ausgelöst.",
    });

    const mail = await sendAdminMail(email);
    res.status(200).json({ ok: true, mail });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login approval request failed";
    res.status(500).json({ error: message });
  }
}
