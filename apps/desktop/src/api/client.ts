import type {
  AppBootstrapResponse,
  ApiAnniversaryEvent,
  ApiHabit,
  ApiHabitDetail,
  ApiMemo,
  ApiMemoAsset,
  ApiMemoListItem,
  ApiPrintShareResponse,
  ApiTag,
  ApiTask,
  ApiThemePreference,
  ApiUser,
  AuthTokens,
  CalendarResponse,
  CalendarView,
  ChangeEmailRequest,
  ChangePasswordRequest,
  CreateHabitRequest,
  CreateMemoRequest,
  CreatePrintShareRequest,
  CreateAnniversaryRequest,
  CreateTagRequest,
  CreateTaskRequest,
  PomodoroSession,
  PomodoroStats,
  RefreshRequest,
  RegisterRequest,
  TaskPriority,
  UpdateMemoRequest,
  UpdateAnniversaryOrderRequest,
  UpdateAnniversaryRequest,
  UpdateHabitOrderRequest,
  UpdateHabitRequest,
  UpdateProfileRequest,
  UpdateTagRequest,
  UpdateThemePreferenceRequest,
  UpdateTaskOrderRequest,
  UpdateTaskRequest
} from "@todo/shared";
import {
  appBootstrapResponseSchema,
  changeEmailRequestSchema,
  changePasswordRequestSchema,
  createAnniversaryRequestSchema,
  createHabitRequestSchema,
  createMemoRequestSchema,
  createPrintShareRequestSchema,
  createTagRequestSchema,
  forgotPasswordRequestSchema,
  habitCheckInRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  updateMemoRequestSchema,
  updateAnniversaryOrderRequestSchema,
  updateAnniversaryRequestSchema,
  updateHabitOrderRequestSchema,
  updateHabitRequestSchema,
  updateProfileRequestSchema,
  updateTagRequestSchema,
  updateTaskOrderRequestSchema,
  updateThemePreferenceRequestSchema
} from "@todo/shared";
import { clearSession, getAccessToken, getRefreshToken, saveAccessToken, saveRefreshToken } from "../lib/authStorage";

const productionApiBaseUrl = "https://api.handjp.com";
const localApiBaseUrlPattern = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::|\/|$)/;

function resolveApiBaseUrl() {
  const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configuredApiBaseUrl) {
    return configuredApiBaseUrl.replace(/\/+$/, "");
  }

  if (import.meta.env.DEV) {
    return "/api";
  }

  if (import.meta.env.DEV) {
    return "/api";
  }

  if (typeof window !== "undefined" && window.location.hostname) {
    if (window.location.hostname === "tauri.localhost") {
      return productionApiBaseUrl;
    }

    return "/api";
  }

  return productionApiBaseUrl;
}

const API_BASE_URL = resolveApiBaseUrl();
export const authSessionExpiredEvent = "tododesk:auth-session-expired";

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

interface RequestOptions {
  retry?: boolean;
  includeAuth?: boolean;
  expireSessionOnUnauthorized?: boolean;
}

function networkErrorMessage() {
  const appOrigin = typeof window !== "undefined" && window.location.origin !== "null"
    ? window.location.origin
    : "当前前端地址";
  const apiTarget = API_BASE_URL.startsWith("/")
    ? `${appOrigin}${API_BASE_URL}（开发代理到 http://127.0.0.1:4020）`
    : API_BASE_URL;
  return `无法连接到本机 API（${apiTarget}）。请确认后端服务已启动，并且后端 APP_ORIGIN/EXTRA_APP_ORIGINS 包含 ${appOrigin} 或 http://tauri.localhost。`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(payload.error ?? "Request failed", response.status);
  }
  return payload as T;
}

function normalizeRequestOptions(options: RequestOptions | boolean): Required<RequestOptions> {
  if (typeof options === "boolean") {
    return {
      retry: options,
      includeAuth: true,
      expireSessionOnUnauthorized: true
    };
  }

  const includeAuth = options.includeAuth ?? true;
  return {
    retry: options.retry ?? true,
    includeAuth,
    expireSessionOnUnauthorized: options.expireSessionOnUnauthorized ?? includeAuth
  };
}

async function expireSession() {
  await clearSession();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(authSessionExpiredEvent));
  }
}

async function request<T>(path: string, init: RequestInit = {}, options: RequestOptions | boolean = {}): Promise<T> {
  const requestOptions = normalizeRequestOptions(options);
  const accessToken = getAccessToken();
  const headers = new Headers(init.headers);
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (requestOptions.includeAuth && accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(apiUrl(path), {
    ...init,
    headers
  }).catch((error: unknown) => {
    if (error instanceof TypeError) {
      throw new ApiError(networkErrorMessage(), 0);
    }
    throw error;
  });

  if (response.status === 401 && requestOptions.includeAuth && requestOptions.retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request<T>(path, init, { ...requestOptions, retry: false });
    }
  }

  if (response.status === 401 && requestOptions.includeAuth && !requestOptions.retry && requestOptions.expireSessionOnUnauthorized) {
    await expireSession();
  }

  return parseResponse<T>(response);
}

export async function fetchPublicPrintHtml(token: string) {
  const response = await fetch(apiUrl(`/print/${encodeURIComponent(token)}`), {
    credentials: "omit"
  });
  if (!response.ok) {
    throw new ApiError("打印链接不可用", response.status);
  }
  return response.text();
}

let refreshAccessTokenPromise: Promise<boolean> | null = null;

async function refreshAccessToken() {
  refreshAccessTokenPromise ??= refreshAccessTokenOnce().finally(() => {
    refreshAccessTokenPromise = null;
  });
  return refreshAccessTokenPromise;
}

async function refreshAccessTokenOnce() {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    await expireSession();
    return false;
  }

  try {
    const payload = await request<AuthTokens>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken } satisfies RefreshRequest)
    }, { retry: false, includeAuth: false, expireSessionOnUnauthorized: false });
    saveAccessToken(payload.accessToken);
    await saveRefreshToken(payload.refreshToken);
    return true;
  } catch {
    await expireSession();
    return false;
  }
}

export const api = {
  async appBootstrap() {
    return appBootstrapResponseSchema.parse(await request<AppBootstrapResponse>("/app/bootstrap", {}, { retry: false, includeAuth: false, expireSessionOnUnauthorized: false }));
  },
  async register(input: RegisterRequest) {
    return request<{ user: ApiUser; verificationEmailSent: boolean }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(registerRequestSchema.parse(input))
    }, { retry: false, includeAuth: false, expireSessionOnUnauthorized: false });
  },
  async login(email: string, password: string) {
    const payload = await request<{ user: ApiUser; tokens: AuthTokens }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(loginRequestSchema.parse({ email, password }))
    }, { retry: false, includeAuth: false, expireSessionOnUnauthorized: false });
    saveAccessToken(payload.tokens.accessToken);
    await saveRefreshToken(payload.tokens.refreshToken);
    return payload;
  },
  async logout() {
    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      await request<void>("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken })
      }, { retry: false, includeAuth: false, expireSessionOnUnauthorized: false }).catch(() => undefined);
    }
    await clearSession();
  },
  async forgotPassword(email: string) {
    return request<{ ok: true }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(forgotPasswordRequestSchema.parse({ email }))
    }, { retry: false, includeAuth: false, expireSessionOnUnauthorized: false });
  },
  async resetPassword(token: string, password: string) {
    return request<{ ok: true }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(resetPasswordRequestSchema.parse({ token, password }))
    }, { retry: false, includeAuth: false, expireSessionOnUnauthorized: false });
  },
  async memos(query = "", archived = false) {
    const params = new URLSearchParams({ archived: String(archived) });
    if (query.trim()) {
      params.set("query", query.trim());
    }
    return request<{ memos: ApiMemoListItem[] }>(`/memos?${params}`);
  },
  async memo(id: string) {
    return request<{ memo: ApiMemo }>(`/memos/${id}`);
  },
  async createMemo(input: CreateMemoRequest = {}) {
    return request<{ memo: ApiMemo }>("/memos", {
      method: "POST",
      body: JSON.stringify(createMemoRequestSchema.parse(input))
    });
  },
  async updateMemo(id: string, input: UpdateMemoRequest) {
    return request<{ memo: ApiMemo }>(`/memos/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updateMemoRequestSchema.parse(input))
    });
  },
  async deleteMemo(id: string) {
    return request<void>(`/memos/${id}`, { method: "DELETE" });
  },
  async uploadMemoAsset(memoId: string, image: Blob, filename = "memo-image.png") {
    const formData = new FormData();
    formData.append("image", image, filename);
    return request<{ asset: ApiMemoAsset }>(`/memos/${memoId}/assets`, {
      method: "POST",
      body: formData
    });
  },
  async anniversaries() {
    return request<{ anniversaries: ApiAnniversaryEvent[] }>("/anniversaries");
  },
  async createAnniversary(input: CreateAnniversaryRequest) {
    return request<{ anniversary: ApiAnniversaryEvent }>("/anniversaries", {
      method: "POST",
      body: JSON.stringify(createAnniversaryRequestSchema.parse(input))
    });
  },
  async updateAnniversary(id: string, input: UpdateAnniversaryRequest) {
    return request<{ anniversary: ApiAnniversaryEvent }>(`/anniversaries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updateAnniversaryRequestSchema.parse(input))
    });
  },
  async updateAnniversaryOrder(input: UpdateAnniversaryOrderRequest) {
    return request<{ ok: true }>("/anniversaries/order", {
      method: "PUT",
      body: JSON.stringify(updateAnniversaryOrderRequestSchema.parse(input))
    });
  },
  async deleteAnniversary(id: string) {
    return request<void>(`/anniversaries/${id}`, { method: "DELETE" });
  },
  async habits(includeArchived = false) {
    const params = new URLSearchParams({ includeArchived: String(includeArchived) });
    return request<{ habits: ApiHabit[] }>(`/habits?${params}`);
  },
  async habitDetail(id: string, month?: string) {
    const params = new URLSearchParams();
    if (month) {
      params.set("month", month);
    }
    const query = params.toString();
    return request<ApiHabitDetail>(`/habits/${id}/detail${query ? `?${query}` : ""}`);
  },
  async createHabit(input: CreateHabitRequest) {
    return request<{ habit: ApiHabit }>("/habits", {
      method: "POST",
      body: JSON.stringify(createHabitRequestSchema.parse(input))
    });
  },
  async updateHabit(id: string, input: UpdateHabitRequest) {
    return request<{ habit: ApiHabit }>(`/habits/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updateHabitRequestSchema.parse(input))
    });
  },
  async updateHabitOrder(input: UpdateHabitOrderRequest) {
    return request<{ ok: true }>("/habits/order", {
      method: "PUT",
      body: JSON.stringify(updateHabitOrderRequestSchema.parse(input))
    });
  },
  async deleteHabit(id: string) {
    return request<void>(`/habits/${id}`, { method: "DELETE" });
  },
  async checkInHabit(id: string, date: string, note?: string | null) {
    return request<{ checkIn: ApiHabitDetail["logs"][number] | null }>(`/habits/${id}/check-ins`, {
      method: "POST",
      body: JSON.stringify(habitCheckInRequestSchema.parse({ date, note }))
    });
  },
  async cancelHabitCheckIn(id: string, date: string) {
    return request<void>(`/habits/${id}/check-ins/${encodeURIComponent(date)}`, { method: "DELETE" });
  },
  async tasks() {
    return request<{ tasks: ApiTask[] }>("/tasks");
  },
  async taskQuadrants() {
    return request<{ quadrants: Record<TaskPriority, ApiTask[]> }>("/tasks/quadrants");
  },
  async tags() {
    return request<{ tags: ApiTag[] }>("/tags");
  },
  async createTag(input: CreateTagRequest) {
    return request<{ tag: ApiTag }>("/tags", {
      method: "POST",
      body: JSON.stringify(createTagRequestSchema.parse(input))
    });
  },
  async updateTag(id: string, input: UpdateTagRequest) {
    return request<{ tag: ApiTag }>(`/tags/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updateTagRequestSchema.parse(input))
    });
  },
  async deleteTag(id: string) {
    return request<void>(`/tags/${id}`, { method: "DELETE" });
  },
  async createTask(input: CreateTaskRequest) {
    return request<{ task: ApiTask }>("/tasks", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  async updateTask(id: string, input: UpdateTaskRequest) {
    return request<{ task: ApiTask }>(`/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  },
  async updateTaskOrder(input: UpdateTaskOrderRequest) {
    return request<{ ok: true }>("/tasks/order", {
      method: "PUT",
      body: JSON.stringify(updateTaskOrderRequestSchema.parse(input))
    });
  },
  async deleteTask(id: string) {
    return request<void>(`/tasks/${id}`, { method: "DELETE" });
  },
  async calendar(from: string, to: string, view: CalendarView) {
    const params = new URLSearchParams({ from, to, view });
    return request<CalendarResponse>(`/calendar?${params}`);
  },
  async completeOccurrence(taskId: string, date: string) {
    return request<{ ok: true }>(`/tasks/${taskId}/occurrences/${encodeURIComponent(date)}/complete`, {
      method: "POST"
    });
  },
  async createPomodoro(taskId: string, durationMinutes: number) {
    return request<{ session: PomodoroSession }>("/pomodoro/sessions", {
      method: "POST",
      body: JSON.stringify({ taskId, durationMinutes })
    });
  },
  async completePomodoro(id: string, actualMinutes?: number) {
    return request<{ session: PomodoroSession }>(`/pomodoro/sessions/${id}/complete`, {
      method: "PATCH",
      body: JSON.stringify({ actualMinutes })
    });
  },
  async cancelPomodoro(id: string) {
    return request<{ session: PomodoroSession }>(`/pomodoro/sessions/${id}/cancel`, {
      method: "PATCH"
    });
  },
  async pomodoroStats() {
    return request<PomodoroStats>("/pomodoro/stats");
  },
  async currentUser() {
    return request<{ user: ApiUser }>("/users/me");
  },
  async updateProfile(input: UpdateProfileRequest) {
    return request<{ user: ApiUser }>("/users/me", {
      method: "PATCH",
      body: JSON.stringify(updateProfileRequestSchema.parse(input))
    });
  },
  async uploadAvatar(avatar: Blob) {
    const formData = new FormData();
    formData.append("avatar", avatar, "avatar.png");
    return request<{ user: ApiUser }>("/users/me/avatar", {
      method: "POST",
      body: formData
    });
  },
  async changeEmail(input: ChangeEmailRequest) {
    return request<{ user: ApiUser; verificationEmailSent: boolean }>("/users/me/email-change", {
      method: "POST",
      body: JSON.stringify(changeEmailRequestSchema.parse(input))
    });
  },
  async changePassword(input: ChangePasswordRequest) {
    await request<void>("/users/me/password", {
      method: "POST",
      body: JSON.stringify(changePasswordRequestSchema.parse(input))
    });
    await clearSession();
  },
  async createPrintShare(input: CreatePrintShareRequest) {
    return request<ApiPrintShareResponse>("/print-shares", {
      method: "POST",
      body: JSON.stringify(createPrintShareRequestSchema.parse(input))
    });
  },
  async revokePrintShare(id: string) {
    return request<{ ok: true }>(`/print-shares/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
  },
  async getThemePreference() {
    return request<ApiThemePreference>("/preferences/theme");
  },
  async setThemePreference(input: UpdateThemePreferenceRequest) {
    return request<ApiThemePreference>("/preferences/theme", {
      method: "PUT",
      body: JSON.stringify(updateThemePreferenceRequestSchema.parse(input))
    });
  }
};
