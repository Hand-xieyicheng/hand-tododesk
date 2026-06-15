import type {
  ApiTask,
  ApiThemePreference,
  ApiUser,
  AuthTokens,
  CalendarOccurrence,
  CalendarView,
  ChangeEmailRequest,
  ChangePasswordRequest,
  CreateTaskRequest,
  PomodoroSession,
  PomodoroStats,
  RefreshRequest,
  RegisterRequest,
  TaskPriority,
  UpdateProfileRequest,
  UpdateThemePreferenceRequest,
  UpdateTaskRequest
} from "@todo/shared";
import {
  changeEmailRequestSchema,
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  updateThemePreferenceRequestSchema,
  updateProfileRequestSchema
} from "@todo/shared";
import { clearSession, getAccessToken, getRefreshToken, saveAccessToken, saveRefreshToken } from "../lib/authStorage";

function resolveApiBaseUrl() {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  if (typeof window !== "undefined" && window.location.hostname) {
    if (window.location.hostname === "tauri.localhost") {
      return "http://127.0.0.1:4020";
    }

    return `http://${window.location.hostname}:4020`;
  }

  return "http://127.0.0.1:4020";
}

const API_BASE_URL = resolveApiBaseUrl();

function networkErrorMessage() {
  return `无法连接到本机 API（${API_BASE_URL}）。请确认后端服务已启动，并且后端 EXTRA_APP_ORIGINS 包含 http://tauri.localhost。`;
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

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const accessToken = getAccessToken();
  const headers = new Headers(init.headers);
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  }).catch((error: unknown) => {
    if (error instanceof TypeError) {
      throw new ApiError(networkErrorMessage(), 0);
    }
    throw error;
  });

  if (response.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request<T>(path, init, false);
    }
  }

  return parseResponse<T>(response);
}

async function refreshAccessToken() {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    return false;
  }

  try {
    const payload = await request<AuthTokens>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken } satisfies RefreshRequest)
    }, false);
    saveAccessToken(payload.accessToken);
    await saveRefreshToken(payload.refreshToken);
    return true;
  } catch {
    await clearSession();
    return false;
  }
}

export const api = {
  async register(input: RegisterRequest) {
    return request<{ user: ApiUser; verificationEmailSent: boolean }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(registerRequestSchema.parse(input))
    }, false);
  },
  async login(email: string, password: string) {
    const payload = await request<{ user: ApiUser; tokens: AuthTokens }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(loginRequestSchema.parse({ email, password }))
    }, false);
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
      }, false).catch(() => undefined);
    }
    await clearSession();
  },
  async forgotPassword(email: string) {
    return request<{ ok: true }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(forgotPasswordRequestSchema.parse({ email }))
    }, false);
  },
  async resetPassword(token: string, password: string) {
    return request<{ ok: true }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(resetPasswordRequestSchema.parse({ token, password }))
    }, false);
  },
  async tasks() {
    return request<{ tasks: ApiTask[] }>("/tasks");
  },
  async taskQuadrants() {
    return request<{ quadrants: Record<TaskPriority, ApiTask[]> }>("/tasks/quadrants");
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
  async deleteTask(id: string) {
    return request<void>(`/tasks/${id}`, { method: "DELETE" });
  },
  async calendar(from: string, to: string, view: CalendarView) {
    const params = new URLSearchParams({ from, to, view });
    return request<{ view: CalendarView; occurrences: CalendarOccurrence[] }>(`/calendar?${params}`);
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
