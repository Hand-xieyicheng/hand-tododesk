import type { ApiUser } from "@todo/shared";

const accessTokenKey = "tododesk.accessToken";
const refreshTokenKey = "tododesk.refreshToken";
const userKey = "tododesk.user";

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
      return token;
    }
  } catch {
    // Browser preview fallback.
  }
  return localStorage.getItem(refreshTokenKey);
}

export async function saveRefreshToken(token: string) {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_refresh_token", { token });
  } catch {
    localStorage.setItem(refreshTokenKey, token);
  }
}

export async function deleteRefreshToken() {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("delete_refresh_token");
  } catch {
    localStorage.removeItem(refreshTokenKey);
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
    return JSON.parse(raw) as ApiUser;
  } catch {
    return null;
  }
}

export async function clearSession() {
  localStorage.removeItem(accessTokenKey);
  localStorage.removeItem(userKey);
  await deleteRefreshToken();
}

