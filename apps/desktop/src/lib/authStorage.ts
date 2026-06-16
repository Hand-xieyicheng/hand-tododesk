import type { ApiUser } from "@todo/shared";

const accessTokenKey = "tododesk.accessToken";
const refreshTokenKey = "tododesk.refreshToken";
const userKey = "tododesk.user";
const lastLoginEmailKey = "tododesk.lastLoginEmail";
const rememberedPasswordEmailKey = "tododesk.rememberedPasswordEmail";
const rememberedPasswordFallbackKeyPrefix = "tododesk.rememberedPassword.";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function rememberedPasswordFallbackKey(email: string) {
  return `${rememberedPasswordFallbackKeyPrefix}${email}`;
}

export function getRememberedPasswordEmail() {
  return localStorage.getItem(rememberedPasswordEmailKey) ?? "";
}

async function deleteRememberedPasswordCredential(normalizedEmail: string) {
  localStorage.removeItem(rememberedPasswordFallbackKey(normalizedEmail));
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("delete_remembered_password", { email: normalizedEmail });
  } catch {
    // Browser preview fallback.
  }
}

export function getAccessToken() {
  return localStorage.getItem(accessTokenKey);
}

export function saveAccessToken(token: string) {
  localStorage.setItem(accessTokenKey, token);
}

export async function getRefreshToken() {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const token = await invoke<string | null>("load_refresh_token");
    if (token) {
      localStorage.setItem(refreshTokenKey, token);
      return token;
    }
  } catch {
    // Browser preview fallback.
  }
  return localStorage.getItem(refreshTokenKey);
}

export async function saveRefreshToken(token: string) {
  localStorage.setItem(refreshTokenKey, token);
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_refresh_token", { token });
  } catch {
    // Browser preview fallback.
  }
}

export async function deleteRefreshToken() {
  localStorage.removeItem(refreshTokenKey);
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("delete_refresh_token");
  } catch {
    // Browser preview fallback.
  }
}

export function getLastLoginEmail() {
  return localStorage.getItem(lastLoginEmailKey) ?? "";
}

export function saveLastLoginEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    localStorage.setItem(lastLoginEmailKey, normalizedEmail);
  } else {
    localStorage.removeItem(lastLoginEmailKey);
  }
}

export async function getRememberedPassword(email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || getRememberedPasswordEmail() !== normalizedEmail) {
    return null;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const password = await invoke<string | null>("load_remembered_password", { email: normalizedEmail });
    if (password) {
      localStorage.setItem(rememberedPasswordFallbackKey(normalizedEmail), password);
      return password;
    }
  } catch {
    // Browser preview fallback.
  }
  return localStorage.getItem(rememberedPasswordFallbackKey(normalizedEmail));
}

export async function saveRememberedPassword(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) {
    return;
  }

  const previousEmail = getRememberedPasswordEmail();
  if (previousEmail && previousEmail !== normalizedEmail) {
    await deleteRememberedPasswordCredential(previousEmail);
  }

  localStorage.setItem(rememberedPasswordEmailKey, normalizedEmail);
  localStorage.setItem(rememberedPasswordFallbackKey(normalizedEmail), password);
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_remembered_password", { email: normalizedEmail, password });
  } catch {
    // Browser preview fallback.
  }
}

export async function deleteRememberedPassword(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const rememberedEmail = getRememberedPasswordEmail();
  const emailsToDelete = Array.from(new Set([normalizedEmail, rememberedEmail].filter(Boolean)));

  for (const emailToDelete of emailsToDelete) {
    await deleteRememberedPasswordCredential(emailToDelete);
  }

  if (!rememberedEmail || emailsToDelete.includes(rememberedEmail)) {
    localStorage.removeItem(rememberedPasswordEmailKey);
  }
}

export function saveUser(user: ApiUser) {
  localStorage.setItem(userKey, JSON.stringify(user));
}

export function getSavedUser() {
  const raw = localStorage.getItem(userKey);
  if (!raw) {
    return null;
  }
  try {
    const user = JSON.parse(raw) as Partial<ApiUser>;
    if (!user.id || !user.email) {
      return null;
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name ?? null,
      gender: user.gender ?? "PRIVATE",
      avatarUrl: user.avatarUrl ?? null,
      emailVerifiedAt: user.emailVerifiedAt ?? null
    } satisfies ApiUser;
  } catch {
    return null;
  }
}

export async function clearSession() {
  localStorage.removeItem(accessTokenKey);
  localStorage.removeItem(userKey);
  await deleteRefreshToken();
}
