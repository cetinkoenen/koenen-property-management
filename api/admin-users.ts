import { createClient, type User } from "@supabase/supabase-js";
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";

const ADMIN_EMAIL = "info.koenen@gmail.com";

type ApiRequest = {
  method?: string;
  headers: { authorization?: string };
  body?: Record<string, unknown>;
};

type ApiResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): { json(payload: unknown): void };
};

type AppUserAccessRow = {
  email: string;
  role: "admin" | "viewer";
  requires_login_approval: boolean;
  approved_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type AdminUser = {
  id: string;
  email?: string;
};

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isValidRole(value: unknown): value is "admin" | "viewer" {
  return value === "admin" || value === "viewer";
}

async function requireAdmin(req: ApiRequest): Promise<AdminUser> {
  const authHeader = String(req.headers.authorization ?? "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) throw new Error("Auth token missing");

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase public env fehlt");

  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || normalizeEmail(data.user?.email) !== ADMIN_EMAIL) {
    throw new Error("Nur Admin darf Benutzer verwalten.");
  }
  const tokenPayload = parseJwtPayload(token);
  if (tokenPayload.aal !== "aal2") {
    throw new Error("Bitte Authenticator-Code bestaetigen, bevor Benutzerrechte geaendert werden.");
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

async function listAllAuthUsers(admin: ReturnType<typeof supabaseAdmin>) {
  const allUsers: User[] = [];
  let page = 1;
  const perPage = 1000;

  while (page < 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    allUsers.push(...(data.users as User[]));
    if (data.users.length < perPage) break;
    page += 1;
  }

  return allUsers;
}

async function findAuthUserByEmail(admin: ReturnType<typeof supabaseAdmin>, email: string) {
  const users = await listAllAuthUsers(admin);
  return users.find((user) => normalizeEmail(user.email) === email) ?? null;
}

async function logAdminUserAction(
  admin: ReturnType<typeof supabaseAdmin>,
  actor: AdminUser,
  action: string,
  payload: Record<string, unknown>,
) {
  await admin.from("app_audit_log").insert({
    action,
    label: "admin-users",
    created_by: actor.id,
    meta: {
      actor_email: normalizeEmail(actor.email),
      ...payload,
    },
  });
}

async function handleGet(admin: ReturnType<typeof supabaseAdmin>, res: ApiResponse) {
  const [{ data: accessRows, error: accessError }, authUsers] = await Promise.all([
    admin
      .from("app_user_access")
      .select("email, role, requires_login_approval, approved_at, is_active, created_at, updated_at")
      .order("created_at", { ascending: true }),
    listAllAuthUsers(admin),
  ]);
  if (accessError) throw accessError;

  const rowsByEmail = new Map<string, AppUserAccessRow>();
  (accessRows as AppUserAccessRow[] | null ?? []).forEach((row) => rowsByEmail.set(normalizeEmail(row.email), row));

  const emails = new Set<string>([
    ...authUsers.map((user) => normalizeEmail(user.email)).filter(Boolean),
    ...rowsByEmail.keys(),
  ]);

  const users = Array.from(emails)
    .map((email) => {
      const authUser = authUsers.find((user) => normalizeEmail(user.email) === email);
      const access = rowsByEmail.get(email);
      const role = access?.role ?? (email === ADMIN_EMAIL ? "admin" : "viewer");
      return {
        email,
        user_id: authUser?.id ?? null,
        role,
        requires_login_approval: access?.requires_login_approval ?? role !== "admin",
        approved_at: access?.approved_at ?? null,
        is_active: access?.is_active ?? true,
        created_at: authUser?.created_at ?? access?.created_at ?? null,
        access_created_at: access?.created_at ?? null,
        updated_at: access?.updated_at ?? null,
        last_sign_in_at: authUser?.last_sign_in_at ?? null,
      };
    })
    .sort((a, b) => {
      if (a.email === ADMIN_EMAIL) return -1;
      if (b.email === ADMIN_EMAIL) return 1;
      return a.email.localeCompare(b.email);
    });

  res.status(200).json({ users });
}

async function handlePatch(admin: ReturnType<typeof supabaseAdmin>, actor: AdminUser, req: ApiRequest, res: ApiResponse) {
  const email = normalizeEmail(req.body?.email);
  const role = req.body?.role;
  if (!email || !isValidRole(role)) {
    res.status(400).json({ error: "E-Mail und gueltige Rolle sind Pflicht." });
    return;
  }
  if (email === ADMIN_EMAIL && role !== "admin") {
    res.status(400).json({ error: "Der Haupt-Admin darf nicht auf Read gesetzt werden." });
    return;
  }

  const authUser = await findAuthUserByEmail(admin, email);
  if (authUser?.id) {
    const { error: updateAuthError } = await admin.auth.admin.updateUserById(authUser.id, {
      app_metadata: { ...(authUser.app_metadata ?? {}), role, access: role === "viewer" ? "readonly" : "admin" },
      user_metadata: { ...(authUser.user_metadata ?? {}), role, access: role === "viewer" ? "readonly" : "admin" },
    });
    if (updateAuthError) throw updateAuthError;

    await admin.from("account_members").update({ role }).eq("user_id", authUser.id);
  }

  const { error: accessError } = await admin.from("app_user_access").upsert({
    email,
    role,
    is_active: true,
    requires_login_approval: role === "viewer",
    approved_at: role === "admin" ? new Date().toISOString() : null,
  });
  if (accessError) throw accessError;

  await logAdminUserAction(admin, actor, "admin_update_user_role", { target_email: email, target_role: role });
  res.status(200).json({ ok: true });
}

async function handleDelete(admin: ReturnType<typeof supabaseAdmin>, actor: AdminUser, req: ApiRequest, res: ApiResponse) {
  const email = normalizeEmail(req.body?.email);
  if (!email) {
    res.status(400).json({ error: "E-Mail ist Pflicht." });
    return;
  }
  if (email === ADMIN_EMAIL || email === normalizeEmail(actor.email)) {
    res.status(400).json({ error: "Der Haupt-Admin kann nicht geloescht werden." });
    return;
  }

  const authUser = await findAuthUserByEmail(admin, email);
  if (authUser?.id) {
    await admin.from("account_members").delete().eq("user_id", authUser.id);
    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(authUser.id);
    if (deleteAuthError) throw deleteAuthError;
  }

  await admin.from("login_approval_requests").delete().eq("email", email);
  const { error: accessError } = await admin.from("app_user_access").delete().eq("email", email);
  if (accessError) throw accessError;

  await logAdminUserAction(admin, actor, "admin_delete_user", { target_email: email, target_user_id: authUser?.id ?? null });
  res.status(200).json({ ok: true });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!["GET", "PATCH", "DELETE"].includes(req.method ?? "")) {
    res.setHeader("Allow", "GET, PATCH, DELETE");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let actor: AdminUser | null = null;
  let admin: ReturnType<typeof supabaseAdmin> | null = null;

  try {
    actor = await requireAdmin(req);
    admin = supabaseAdmin();

    if (req.method === "GET") {
      await handleGet(admin, res);
      return;
    }
    if (req.method === "PATCH") {
      await handlePatch(admin, actor, req, res);
      return;
    }
    await handleDelete(admin, actor, req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Benutzerverwaltung konnte nicht geladen werden.";
    if (admin && actor) {
      await logAdminUserAction(admin, actor, "admin_users_error", { error: message }).catch(() => undefined);
    }
    res.status(500).json({ error: message });
  }
}
