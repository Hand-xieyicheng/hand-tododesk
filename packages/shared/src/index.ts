import { z } from "zod";

export const authEmailSchema = z.string().trim().email().max(255).toLowerCase();

export const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[A-Za-z]/, "Password must include a letter")
  .regex(/[0-9]/, "Password must include a number");

export const registerRequestSchema = z.object({
  email: authEmailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(80).optional()
});

export const loginRequestSchema = z.object({
  email: authEmailSchema,
  password: z.string().min(1)
});

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(20)
});

export const forgotPasswordRequestSchema = z.object({
  email: authEmailSchema
});

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(20),
  password: passwordSchema
});

export const taskStatusValues = ["TODO", "IN_PROGRESS", "COMPLETED", "ARCHIVED"] as const;
export const taskPriorityValues = [
  "IMPORTANT_URGENT",
  "IMPORTANT_NOT_URGENT",
  "NOT_IMPORTANT_URGENT",
  "NOT_IMPORTANT_NOT_URGENT"
] as const;
export const recurrenceFrequencyValues = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;
export const taskExceptionStatusValues = ["SKIPPED", "COMPLETED", "RESCHEDULED"] as const;
export const pomodoroStatusValues = ["RUNNING", "COMPLETED", "CANCELLED"] as const;
export const calendarViewValues = ["month", "week", "day"] as const;
export const themeIdValues = ["default", "shinchan", "labubu", "doraemon"] as const;
export const userGenderValues = ["PRIVATE", "MALE", "FEMALE", "OTHER"] as const;

export const recurrenceRuleSchema = z.object({
  frequency: z.enum(recurrenceFrequencyValues),
  interval: z.number().int().min(1).max(365).default(1),
  until: z.string().datetime().optional().nullable(),
  count: z.number().int().min(1).max(1000).optional().nullable(),
  byWeekday: z.array(z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"])).optional().nullable()
});

export const createTaskRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  notes: z.string().trim().max(4000).optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  priority: z.enum(taskPriorityValues).default("IMPORTANT_NOT_URGENT"),
  status: z.enum(taskStatusValues).default("TODO"),
  tagNames: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  recurrenceRule: recurrenceRuleSchema.optional().nullable()
});

export const updateTaskRequestSchema = createTaskRequestSchema.partial().extend({
  recurrenceRule: recurrenceRuleSchema.optional().nullable()
});

export const calendarQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  view: z.enum(calendarViewValues)
});

export const createPomodoroSessionRequestSchema = z.object({
  taskId: z.string().min(1),
  durationMinutes: z.number().int().min(1).max(180).default(25)
});

export const completePomodoroSessionRequestSchema = z.object({
  actualMinutes: z.number().int().min(1).max(240).optional()
});

export const updateThemePreferenceRequestSchema = z.object({
  themeId: z.enum(themeIdValues)
});

export const updateProfileRequestSchema = z.object({
  name: z.string().trim().min(1).max(80).nullable().optional(),
  gender: z.enum(userGenderValues).optional()
});

export const changeEmailRequestSchema = z.object({
  email: authEmailSchema,
  currentPassword: z.string().min(1)
});

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
export type ChangeEmailRequest = z.infer<typeof changeEmailRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;
export type UpdateTaskRequest = z.infer<typeof updateTaskRequestSchema>;
export type RecurrenceRuleInput = z.infer<typeof recurrenceRuleSchema>;
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
export type CalendarView = (typeof calendarViewValues)[number];
export type TaskStatus = (typeof taskStatusValues)[number];
export type TaskPriority = (typeof taskPriorityValues)[number];
export type ThemeId = (typeof themeIdValues)[number];
export type PomodoroStatus = (typeof pomodoroStatusValues)[number];
export type UserGender = (typeof userGenderValues)[number];

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface ApiUser {
  id: string;
  email: string;
  name: string | null;
  gender: UserGender;
  avatarUrl: string | null;
  emailVerifiedAt: string | null;
}

export interface ApiTag {
  id: string;
  name: string;
}

export interface ApiTask {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  recurrenceRule: RecurrenceRuleInput | null;
  tags: ApiTag[];
  pomodoroCompletedCount: number;
  pomodoroCompletedMinutes: number;
}

export interface CalendarOccurrence {
  id: string;
  taskId: string;
  title: string;
  date: string;
  dueAt: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  isRecurring: boolean;
  exceptionStatus: "SKIPPED" | "COMPLETED" | "RESCHEDULED" | null;
  task: ApiTask;
}

export interface PomodoroSession {
  id: string;
  taskId: string;
  status: "RUNNING" | "COMPLETED" | "CANCELLED";
  durationMinutes: number;
  actualMinutes: number | null;
  startedAt: string;
  endedAt: string | null;
}

export interface PomodoroStats {
  totalCompletedMinutes: number;
  totalCompletedSessions: number;
  byTask: Array<{
    taskId: string;
    title: string;
    completedMinutes: number;
    completedSessions: number;
  }>;
}
