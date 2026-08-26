import { createClient, type User } from "@supabase/supabase-js";
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";

const ADMIN_EMAIL = "info.koenen@gmail.com";
const ADMIN_CREATE_USER_RATE_LIMIT = 5;
const ADMIN_CREATE_USER_WINDOW_MINUTES = 15;

type ApiRequest = {
  method?: string;
  headers: { authorization?: string };
  body?: Record<string, unknown>;
};

type ApiResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): { json(payload: unknown): void };
};

type AdminUser = {
  id: string;
  email?: string;
};

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

async function requireAdmin(req: ApiRequest) {
  const authHeader = String(req.headers.authorization ?? "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) throw new Error("Auth token missing");

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase public env fehlt");

  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || normalizeEmail(data.user?.email) !== ADMIN_EMAIL) {
    throw new Error("Nur Admin darf User anlegen.");
  }
  const tokenPayload = parseJwtPayload(token);
  if (tokenPayload.aal !== "aal2") {
    throw new Error("Bitte Authenticator-Code bestaetigen, bevor Benutzer angelegt werden.");
  }
  return data.user;
}

function parseJwtPayload(token: string): { aal?: string } {
  try {
    const payload = token.split(".")[1] ?? "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(normalized, "base64").toString("utf8")) as { aal?: string };
  } catch {
    return {};
  }
}

async function logAdminUserAction(
  admin: ReturnType<typeof supabaseAdmin>,
  actor: AdminUser,
  action: string,
  payload: Record<string, unknown>,
) {
  await admin.from("app_audit_log").insert({
    action,
    label: "admin-create-user",
    created_by: actor.id,
    meta: {
      actor_email: normalizeEmail(actor.email),
      ...payload,
    },
  });
}

async function enforceAdminCreateUserRateLimit(admin: ReturnType<typeof supabaseAdmin>, actor: AdminUser) {
  const windowStart = new Date(Date.now() - ADMIN_CREATE_USER_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("app_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("created_by", actor.id)
    .eq("action", "admin_create_user_attempt")
    .gte("created_at", windowStart);

  if (error) throw error;

  if ((count ?? 0) >= ADMIN_CREATE_USER_RATE_LIMIT) {
    throw new Error(
      `Zu viele User-Anlageversuche. Bitte nach ${ADMIN_CREATE_USER_WINDOW_MINUTES} Minuten erneut versuchen.`,
    );
  }
}

async function findAuthUserByEmail(admin: ReturnType<typeof supabaseAdmin>, email: string): Promise<User | null> {
  let page = 1;
  const perPage = 1000;

  while (page < 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data.users as User[];
    const match = users.find((user) => normalizeEmail(user.email) === email);
    if (match) return match;
    if (users.length < perPage) return null;
    page += 1;
  }

  return null;
}

async function resolveAccountId(admin: ReturnType<typeof supabaseAdmin>, requestedAccountId: unknown) {
  const fromRequestOrEnv = String(requestedAccountId ?? process.env.KOENEN_ACCOUNT_ID ?? "").trim();
  if (fromRequestOrEnv) return fromRequestOrEnv;

  const adminUser = await findAuthUserByEmail(admin, ADMIN_EMAIL);
  if (!adminUser?.id) return "";

  const { data, error } = await admin
    .from("account_members")
    .select("account_id")
    .eq("user_id", adminUser.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return String(data?.account_id ?? "");
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let actor: AdminUser | null = null;
  let admin: ReturnType<typeof supabaseAdmin> | null = null;
  let targetEmail = "";
  let targetRole = "viewer";

  try {
    actor = await requireAdmin(req);

    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password ?? "");
    const role = req.body?.role === "admin" ? "admin" : "viewer";
    const requiresApproval = Boolean(req.body?.requiresApproval);
    targetEmail = email;
    targetRole = role;
    admin = supabaseAdmin();

    await enforceAdminCreateUserRateLimit(admin, actor);
    await logAdminUserAction(admin, actor, "admin_create_user_attempt", {
      target_email: email,
      target_role: role,
      requires_approval: requiresApproval,
    });

    if (!email || !password) {
      res.status(400).json({ error: "E-Mail und Passwort sind Pflicht." });
      return;
    }

    let authUser = await findAuthUserByEmail(admin, email);

    if (authUser?.id) {
      const { data, error } = await admin.auth.admin.updateUserById(authUser.id, {
        password,
        email_confirm: true,
        app_metadata: { ...(authUser.app_metadata ?? {}), role, access: role === "viewer" ? "readonly" : "admin" },
        user_metadata: { role, access: role === "viewer" ? "readonly" : "admin" },
      });
      if (error) throw error;
      authUser = data.user;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role, access: role === "viewer" ? "readonly" : "admin" },
        user_metadata: { role, access: role === "viewer" ? "readonly" : "admin" },
      });
      if (error) throw error;
      authUser = data.user;
    }

    await admin.from("app_user_access").upsert({
      email,
      role,
      requires_login_approval: requiresApproval,
      approved_at: requiresApproval ? null : new Date().toISOString(),
      is_active: true,
    });

    const accountId = await resolveAccountId(admin, req.body?.accountId);
    const userId = authUser?.id;
    if (accountId && userId) {
      await admin.from("account_members").upsert({
        account_id: accountId,
        user_id: userId,
        role,
      });
    }

    await logAdminUserAction(admin, actor, "admin_create_user_success", {
      target_email: email,
      target_role: role,
      target_user_id: userId ?? null,
      requires_approval: requiresApproval,
    });

    res.status(200).json({ ok: true, userId: userId ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "User konnte nicht angelegt werden.";
    if (admin && actor) {
      await logAdminUserAction(admin, actor, "admin_create_user_error", {
        target_email: targetEmail,
        target_role: targetRole,
        error: message,
      }).catch(() => undefined);
    }
    res.status(500).json({ error: message });
  }
}
