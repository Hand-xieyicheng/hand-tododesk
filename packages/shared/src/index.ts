import { z } from "zod";
import { Lunar, Solar } from "lunar-typescript";

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
export const anniversaryCategoryValues = ["ANNIVERSARY", "COUNTDOWN", "BIRTHDAY", "HOLIDAY"] as const;
export const anniversaryRepeatValues = ["NONE", "WEEKLY", "MONTHLY", "YEARLY"] as const;
export const anniversaryDirectionValues = ["AUTO", "ELAPSED", "COUNTDOWN"] as const;
export const anniversaryDisplayDirectionValues = ["ELAPSED", "COUNTDOWN"] as const;
export const anniversaryCalendarTypeValues = ["SOLAR", "LUNAR", "SOLAR_TERM"] as const;
export const anniversarySolarTermValues = ["QINGMING"] as const;
export const anniversaryCardStyleValues = ["lavender", "sunrise", "mint", "ocean", "rose", "classic"] as const;
export const habitFrequencyValues = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export const habitWeekdayValues = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export const habitRecommendedIconValues = [
  "BookOpen",
  "Footprints",
  "Droplets",
  "Dumbbell",
  "Moon",
  "Book",
  "Coffee",
  "Music",
  "PenLine",
  "Smile",
  "Heart",
  "Apple",
  "Bike",
  "Sparkles",
  "Code"
] as const;
export const habitColorValues = ["mint", "blue", "yellow", "orange", "rose", "purple", "teal", "slate"] as const;
export const themeIdValues = [
  "warm-paper",
  "white-ink",
  "black-snow",
  "cream",
  "blush",
  "peach",
  "lemon",
  "mint",
  "sage",
  "sky",
  "aqua",
  "lavender",
  "coral",
  "teal",
  "navy"
] as const;
export const floatingCardThemeIdValues = [...themeIdValues] as const;
export const defaultThemeId = "warm-paper" satisfies ThemeId;
export const legacyThemeIdMap = {
  default: "warm-paper",
  shinchan: "peach",
  labubu: "lavender",
  doraemon: "sky"
} as const satisfies Record<string, ThemeId>;
export const taskViewModeValues = ["list", "quadrant", "kanban"] as const;
export const taskCardDisplayModeValues = ["full", "title"] as const;
export const printTemplateIdValues = ["checklist", "memo", "compact", "decorated"] as const;
export const printFontSizeModeValues = ["small", "normal", "large", "custom"] as const;
export const printMarginModeValues = ["narrow", "normal", "wide"] as const;
export const printSourceTypeValues = ["tasks", "memo"] as const;
export const floatingCardViewModeValues = ["list", "quadrant", "tag"] as const;
export const appCloseBehaviorValues = ["hide", "quit"] as const;
export const displaySizeValues = ["small", "default", "large"] as const;
export const sidebarModuleValues = ["tasks", "memos", "anniversaries", "habits", "calendar", "pomodoro"] as const;
export const defaultVisibleSidebarModules = [...sidebarModuleValues] as Array<(typeof sidebarModuleValues)[number]>;
export const fontFamilyValues = [
  "system",
  "lemi-chunxu-wanxing",
  "lemi-muhe-yuanti",
  "lemi-zhixia-qianfeng",
  "nanxi-xin-yuanti",
  "lemi-xiaonaipao",
  "baiwuchang-keke"
] as const;
export const releaseChannelValues = ["stable"] as const;
export const footerTypeValues = ["sea", "tree"] as const;
export const titleColorValues = [
  "default",
  "app-pink",
  "purple",
  "app-blue",
  "app-yellow",
  "app-orange",
  "app-teal",
  "app-green",
  "app-red",
  "lime-green",
  "yellow-green",
  "brown",
  "warm-peach-pink"
] as const;
export const userGenderValues = ["PRIVATE", "MALE", "FEMALE", "OTHER"] as const;

export const habitIconSchema = z.string().trim().min(1).max(80).regex(/^[A-Za-z][A-Za-z0-9-]*$/, "Icon must be a valid icon key");

export const memoListQuerySchema = z.object({
  query: z.string().trim().max(100).optional().default(""),
  archived: z.enum(["true", "false"]).optional().default("false")
});

export const createMemoRequestSchema = z.object({
  title: z.string().trim().max(160).optional(),
  contentHtml: z.string().max(500000).optional(),
  isPinned: z.boolean().optional()
});

export const updateMemoRequestSchema = z
  .object({
    title: z.string().trim().max(160).optional(),
    contentHtml: z.string().max(500000).optional(),
    isPinned: z.boolean().optional(),
    archived: z.boolean().optional()
  })
  .refine((value) => (
    value.title !== undefined ||
    value.contentHtml !== undefined ||
    value.isPinned !== undefined ||
    value.archived !== undefined
  ), {
    message: "Memo update is required"
  });

export const recurrenceRuleSchema = z.object({
  frequency: z.enum(recurrenceFrequencyValues),
  interval: z.number().int().min(1).max(365).default(1),
  until: z.string().datetime().optional().nullable(),
  count: z.number().int().min(1).max(1000).optional().nullable(),
  byWeekday: z.array(z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"])).optional().nullable()
});

export const dateKeyRegex = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateKey(value: string) {
  if (!dateKeyRegex.test(value)) {
    return false;
  }

  const parts = parseDateKey(value);
  return parts.month >= 1 &&
    parts.month <= 12 &&
    parts.day >= 1 &&
    parts.day <= daysInMonth(parts.year, parts.month) &&
    formatDateKey(parts) === value;
}

export const anniversaryEventBaseSchema = z.object({
  title: z.string().trim().min(1).max(160),
  notes: z.string().trim().max(4000).optional().nullable(),
  category: z.enum(anniversaryCategoryValues),
  date: z.string().refine(isValidDateKey, "Date must be a valid YYYY-MM-DD value"),
  repeat: z.enum(anniversaryRepeatValues).default("NONE"),
  direction: z.enum(anniversaryDirectionValues).default("AUTO"),
  cardStyle: z.enum(anniversaryCardStyleValues).default("lavender"),
  calendarType: z.enum(anniversaryCalendarTypeValues).default("SOLAR"),
  lunarMonth: z.number().int().min(1).max(12).optional().nullable(),
  lunarDay: z.number().int().min(1).max(30).optional().nullable(),
  solarTerm: z.enum(anniversarySolarTermValues).optional().nullable()
});

export const createAnniversaryRequestSchema = anniversaryEventBaseSchema.superRefine((value, ctx) => {
  if (value.calendarType === "LUNAR" && (!value.lunarMonth || !value.lunarDay)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Lunar month and day are required",
      path: ["lunarMonth"]
    });
  }
  if (value.calendarType === "SOLAR_TERM" && !value.solarTerm) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Solar term is required",
      path: ["solarTerm"]
    });
  }
});

export const updateAnniversaryRequestSchema = anniversaryEventBaseSchema.partial().refine((value) => (
  value.title !== undefined ||
  value.notes !== undefined ||
  value.category !== undefined ||
  value.date !== undefined ||
  value.repeat !== undefined ||
  value.direction !== undefined ||
  value.cardStyle !== undefined ||
  value.calendarType !== undefined ||
  value.lunarMonth !== undefined ||
  value.lunarDay !== undefined ||
  value.solarTerm !== undefined
), {
  message: "Anniversary update is required"
});

export const updateAnniversaryOrderRequestSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1).max(500)
}).refine((value) => new Set(value.orderedIds).size === value.orderedIds.length, {
  message: "Anniversary ids must be unique",
  path: ["orderedIds"]
});

const habitScheduleFields = {
  frequency: z.enum(habitFrequencyValues),
  interval: z.number().int().min(1).max(365).default(1),
  weekDays: z.array(z.enum(habitWeekdayValues)).max(7).default([]),
  monthDays: z.array(z.number().int().min(1).max(31)).max(31).default([])
};

function validateHabitSchedule(value: {
  frequency?: HabitFrequency;
  weekDays?: HabitWeekday[];
  monthDays?: number[];
  startDate?: string;
  endDate?: string | null;
}, ctx: z.RefinementCtx) {
  if (value.frequency === "WEEKLY" && (!value.weekDays || value.weekDays.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Weekly habits require at least one weekday",
      path: ["weekDays"]
    });
  }
  if (value.frequency === "MONTHLY" && (!value.monthDays || value.monthDays.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Monthly habits require at least one day",
      path: ["monthDays"]
    });
  }
  if (value.weekDays && new Set(value.weekDays).size !== value.weekDays.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Weekdays must be unique",
      path: ["weekDays"]
    });
  }
  if (value.monthDays && new Set(value.monthDays).size !== value.monthDays.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Month days must be unique",
      path: ["monthDays"]
    });
  }
  if (value.startDate && value.endDate && compareDateKeys(value.startDate, value.endDate) > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "End date must be on or after start date",
      path: ["endDate"]
    });
  }
}

const habitBaseSchema = z.object({
  title: z.string().trim().min(1).max(160),
  notes: z.string().trim().max(4000).optional().nullable(),
  icon: habitIconSchema.default("Smile"),
  color: z.enum(habitColorValues).default("mint"),
  startDate: z.string().refine(isValidDateKey, "Date must be a valid YYYY-MM-DD value"),
  endDate: z.string().refine(isValidDateKey, "Date must be a valid YYYY-MM-DD value").optional().nullable(),
  ...habitScheduleFields
});

export const createHabitRequestSchema = habitBaseSchema.superRefine(validateHabitSchedule);

export const updateHabitRequestSchema = habitBaseSchema.partial().extend({
  archived: z.boolean().optional()
}).superRefine(validateHabitSchedule).refine((value) => (
  value.title !== undefined ||
  value.notes !== undefined ||
  value.icon !== undefined ||
  value.color !== undefined ||
  value.startDate !== undefined ||
  value.endDate !== undefined ||
  value.frequency !== undefined ||
  value.interval !== undefined ||
  value.weekDays !== undefined ||
  value.monthDays !== undefined ||
  value.archived !== undefined
), {
  message: "Habit update is required"
});

export const updateHabitOrderRequestSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1).max(500)
}).refine((value) => new Set(value.orderedIds).size === value.orderedIds.length, {
  message: "Habit ids must be unique",
  path: ["orderedIds"]
});

export const habitCheckInRequestSchema = z.object({
  date: z.string().refine(isValidDateKey, "Date must be a valid YYYY-MM-DD value"),
  note: z.string().trim().max(1000).optional().nullable()
});

export const habitListQuerySchema = z.object({
  includeArchived: z.enum(["true", "false"]).optional().default("false")
});

export const habitDetailQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).refine((value) => {
    const [year, month] = value.split("-").map(Number);
    return Boolean(year && month && month >= 1 && month <= 12);
  }, "Month must be a valid YYYY-MM value").optional()
});

const baseTaskRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  notes: z.string().trim().max(4000).optional().nullable(),
  startAt: z.string().datetime().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  priority: z.enum(taskPriorityValues).default("IMPORTANT_NOT_URGENT"),
  status: z.enum(taskStatusValues).default("TODO"),
  tagId: z.string().trim().min(1).optional().nullable(),
  recurrenceRule: recurrenceRuleSchema.optional().nullable()
});

function validateTaskRequestTimeRange(value: { startAt?: string | null; dueAt?: string | null }, ctx: z.RefinementCtx) {
  if (!value.startAt || !value.dueAt) {
    return;
  }
  if (new Date(value.startAt).getTime() > new Date(value.dueAt).getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Start time must not be later than due time",
      path: ["startAt"]
    });
  }
}

export const createTaskRequestSchema = baseTaskRequestSchema.superRefine(validateTaskRequestTimeRange);

export const updateTaskRequestSchema = baseTaskRequestSchema.partial().extend({
  recurrenceRule: recurrenceRuleSchema.optional().nullable()
}).superRefine(validateTaskRequestTimeRange);

export const updateTaskOrderRequestSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1).max(500)
}).refine((value) => new Set(value.orderedIds).size === value.orderedIds.length, {
  message: "Task ids must be unique",
  path: ["orderedIds"]
});

export const printShareConfigSchema = z.object({
  templateId: z.enum(printTemplateIdValues),
  maxHeightMm: z.number().int().min(40).max(1000).optional().nullable(),
  fontSizeMode: z.enum(printFontSizeModeValues),
  customFontSizePx: z.number().int().min(8).max(28).optional().nullable(),
  marginMode: z.enum(printMarginModeValues),
  expiresInHours: z.number().int().min(1).max(168).default(24)
}).superRefine((value, ctx) => {
  if (value.fontSizeMode === "custom" && !value.customFontSizePx) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Custom font size is required",
      path: ["customFontSizePx"]
    });
  }
});

export const printTasksSourceSchema = z.object({
  tagFilter: z.string().trim().min(1).max(120),
  showCompletedTasks: z.boolean(),
  viewMode: z.enum(taskViewModeValues)
});

export const printMemoSourceSchema = z.object({
  memoId: z.string().trim().min(1).max(191)
});

export const createPrintShareRequestSchema = z.discriminatedUnion("sourceType", [
  z.object({
    sourceType: z.literal("tasks"),
    source: printTasksSourceSchema,
    config: printShareConfigSchema
  }),
  z.object({
    sourceType: z.literal("memo"),
    source: printMemoSourceSchema,
    config: printShareConfigSchema
  })
]);

export const tagNameSchema = z.string().trim().min(1).max(40);

export const createTagRequestSchema = z.object({
  name: tagNameSchema
});

export const updateTagRequestSchema = z.object({
  name: tagNameSchema
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

export const updateThemePreferenceRequestSchema = z
  .object({
    themeId: z.enum(themeIdValues).optional(),
    titleColor: z.enum(titleColorValues).optional(),
    footerVisible: z.boolean().optional(),
    footerType: z.enum(footerTypeValues).optional(),
    printButtonEnabled: z.boolean().optional(),
    showCompletedTasks: z.boolean().optional(),
    taskViewMode: z.enum(taskViewModeValues).optional(),
    taskCardDisplayMode: z.enum(taskCardDisplayModeValues).optional(),
    floatingCardThemeId: z.enum(floatingCardThemeIdValues).optional(),
    floatingCardViewMode: z.enum(floatingCardViewModeValues).optional(),
    appCloseBehavior: z.enum(appCloseBehaviorValues).optional(),
    displaySize: z.enum(displaySizeValues).optional(),
    visibleSidebarModules: z.array(z.enum(sidebarModuleValues)).optional(),
    sidebarCollapsed: z.boolean().optional(),
    fontFamily: z.enum(fontFamilyValues).optional()
  })
  .refine((value) => (
    value.themeId ||
    value.titleColor ||
    value.footerVisible !== undefined ||
    value.footerType ||
    value.printButtonEnabled !== undefined ||
    value.showCompletedTasks !== undefined ||
    value.taskViewMode ||
    value.taskCardDisplayMode ||
    value.floatingCardThemeId ||
    value.floatingCardViewMode ||
    value.appCloseBehavior ||
    value.displaySize ||
    value.visibleSidebarModules !== undefined ||
    value.sidebarCollapsed !== undefined ||
    value.fontFamily
  ), {
    message: "Appearance preference is required"
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

export const appFeatureFlagsSchema = z.object({
  calendar: z.boolean(),
  pomodoro: z.boolean(),
  taskQuadrant: z.boolean(),
  floatingCard: z.boolean(),
  anniversaries: z.boolean(),
  habits: z.boolean()
});

export const appBootstrapResponseSchema = z.object({
  apiVersion: z.string().min(1),
  releaseChannel: z.enum(releaseChannelValues),
  desktop: z.object({
    minimumVersion: z.string().min(1),
    latestVersion: z.string().min(1),
    updateEndpoint: z.string().url()
  }),
  featureFlags: appFeatureFlagsSchema
});

export const defaultAppFeatureFlags = {
  calendar: true,
  pomodoro: true,
  taskQuadrant: true,
  floatingCard: true,
  anniversaries: true,
  habits: true
} satisfies AppFeatureFlags;

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
export type ChangeEmailRequest = z.infer<typeof changeEmailRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type UpdateThemePreferenceRequest = z.infer<typeof updateThemePreferenceRequestSchema>;
export type MemoListQuery = z.infer<typeof memoListQuerySchema>;
export type CreateMemoRequest = z.infer<typeof createMemoRequestSchema>;
export type UpdateMemoRequest = z.infer<typeof updateMemoRequestSchema>;
export type CreateAnniversaryRequest = z.infer<typeof createAnniversaryRequestSchema>;
export type UpdateAnniversaryRequest = z.infer<typeof updateAnniversaryRequestSchema>;
export type UpdateAnniversaryOrderRequest = z.infer<typeof updateAnniversaryOrderRequestSchema>;
export type CreateHabitRequest = z.infer<typeof createHabitRequestSchema>;
export type UpdateHabitRequest = z.infer<typeof updateHabitRequestSchema>;
export type UpdateHabitOrderRequest = z.infer<typeof updateHabitOrderRequestSchema>;
export type HabitCheckInRequest = z.infer<typeof habitCheckInRequestSchema>;
export type HabitListQuery = z.infer<typeof habitListQuerySchema>;
export type HabitDetailQuery = z.infer<typeof habitDetailQuerySchema>;
export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;
export type UpdateTaskRequest = z.infer<typeof updateTaskRequestSchema>;
export type UpdateTaskOrderRequest = z.infer<typeof updateTaskOrderRequestSchema>;
export type CreatePrintShareRequest = z.infer<typeof createPrintShareRequestSchema>;
export type PrintShareConfig = z.infer<typeof printShareConfigSchema>;
export type PrintTasksSource = z.infer<typeof printTasksSourceSchema>;
export type PrintMemoSource = z.infer<typeof printMemoSourceSchema>;
export type CreateTagRequest = z.infer<typeof createTagRequestSchema>;
export type UpdateTagRequest = z.infer<typeof updateTagRequestSchema>;
export type RecurrenceRuleInput = z.infer<typeof recurrenceRuleSchema>;
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
export type CalendarView = (typeof calendarViewValues)[number];
export type AnniversaryCategory = (typeof anniversaryCategoryValues)[number];
export type AnniversaryRepeat = (typeof anniversaryRepeatValues)[number];
export type AnniversaryDirection = (typeof anniversaryDirectionValues)[number];
export type AnniversaryDisplayDirection = (typeof anniversaryDisplayDirectionValues)[number];
export type AnniversaryCalendarType = (typeof anniversaryCalendarTypeValues)[number];
export type AnniversarySolarTerm = (typeof anniversarySolarTermValues)[number];
export type AnniversaryCardStyle = (typeof anniversaryCardStyleValues)[number];
export type HabitFrequency = (typeof habitFrequencyValues)[number];
export type HabitWeekday = (typeof habitWeekdayValues)[number];
export type HabitIcon = string;
export type HabitColor = (typeof habitColorValues)[number];
export type TaskStatus = (typeof taskStatusValues)[number];
export type TaskPriority = (typeof taskPriorityValues)[number];
export type TaskViewMode = (typeof taskViewModeValues)[number];
export type TaskCardDisplayMode = (typeof taskCardDisplayModeValues)[number];
export type PrintTemplateId = (typeof printTemplateIdValues)[number];
export type FloatingCardThemeId = (typeof floatingCardThemeIdValues)[number];
export type FloatingCardViewMode = (typeof floatingCardViewModeValues)[number];
export type AppCloseBehavior = (typeof appCloseBehaviorValues)[number];
export type DisplaySize = (typeof displaySizeValues)[number];
export type SidebarModule = (typeof sidebarModuleValues)[number];
export type FontFamily = (typeof fontFamilyValues)[number];
export type ReleaseChannel = (typeof releaseChannelValues)[number];
export type ThemeId = (typeof themeIdValues)[number];
export type FooterType = (typeof footerTypeValues)[number];
export type TitleColor = (typeof titleColorValues)[number];
export type PomodoroStatus = (typeof pomodoroStatusValues)[number];
export type UserGender = (typeof userGenderValues)[number];
export type AppFeatureFlags = z.infer<typeof appFeatureFlagsSchema>;
export type AppBootstrapResponse = z.infer<typeof appBootstrapResponseSchema>;

export function normalizeThemeId(value: string | null | undefined): ThemeId {
  if (themeIdValues.includes(value as ThemeId)) {
    return value as ThemeId;
  }
  return legacyThemeIdMap[value as keyof typeof legacyThemeIdMap] ?? defaultThemeId;
}

export interface ApiThemePreference {
  themeId: ThemeId;
  titleColor: TitleColor;
  footerVisible: boolean;
  footerType: FooterType;
  printButtonEnabled: boolean;
  showCompletedTasks: boolean;
  taskViewMode: TaskViewMode;
  taskCardDisplayMode: TaskCardDisplayMode;
  floatingCardThemeId: FloatingCardThemeId;
  floatingCardViewMode: FloatingCardViewMode;
  appCloseBehavior: AppCloseBehavior;
  displaySize: DisplaySize;
  visibleSidebarModules: SidebarModule[];
  sidebarCollapsed: boolean;
  fontFamily: FontFamily;
}

export interface ApiPrintShare {
  id: string;
  url: string;
  expiresAt: string;
}

export interface ApiPrintShareResponse {
  printShare: ApiPrintShare;
}

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

export interface ApiMemoAsset {
  id: string;
  memoId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  url: string;
  createdAt: string;
}

export interface ApiMemoListItem {
  id: string;
  title: string;
  excerpt: string | null;
  isPinned: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiMemo extends ApiMemoListItem {
  contentHtml: string;
  assets: ApiMemoAsset[];
}

export interface ApiAnniversaryEvent {
  id: string;
  title: string;
  notes: string | null;
  category: AnniversaryCategory;
  date: string;
  repeat: AnniversaryRepeat;
  direction: AnniversaryDirection;
  cardStyle: AnniversaryCardStyle;
  calendarType: AnniversaryCalendarType;
  lunarMonth: number | null;
  lunarDay: number | null;
  solarTerm: AnniversarySolarTerm | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  displayDirection: AnniversaryDisplayDirection;
  displayDate: string;
  displayValue: string;
  displaySubtext: string;
  daysDelta: number;
}

export interface ApiHabitStats {
  monthCheckIns: number;
  monthPlanned: number;
  monthCompletionRate: number;
  totalCheckIns: number;
  currentStreak: number;
  currentStreakUnit: "天" | "次";
}

export interface ApiHabit {
  id: string;
  title: string;
  notes: string | null;
  icon: HabitIcon;
  color: HabitColor;
  frequency: HabitFrequency;
  interval: number;
  weekDays: HabitWeekday[];
  monthDays: number[];
  startDate: string;
  endDate: string | null;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  todayPlanned: boolean;
  todayChecked: boolean;
  stats: ApiHabitStats;
}

export interface ApiHabitCalendarDay {
  date: string;
  day: number;
  planned: boolean;
  checked: boolean;
  future: boolean;
  note: string | null;
  checkInId: string | null;
}

export interface ApiHabitLog {
  id: string;
  date: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiHabitDetail {
  habit: ApiHabit;
  month: string;
  stats: ApiHabitStats;
  calendarDays: ApiHabitCalendarDay[];
  logs: ApiHabitLog[];
}

export interface ApiTask {
  id: string;
  title: string;
  notes: string | null;
  startAt: string | null;
  dueAt: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  sortOrder: number | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  recurrenceRule: RecurrenceRuleInput | null;
  tags: ApiTag[];
  pomodoroCompletedCount: number;
  pomodoroCompletedMinutes: number;
}

type DisplaySortableTask = Pick<ApiTask, "id" | "createdAt"> & {
  sortOrder?: number | null;
  status?: TaskStatus | string | null;
};

function taskCreatedAtTime(task: DisplaySortableTask) {
  const timestamp = Date.parse(task.createdAt);
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

export function compareTasksForDisplay(left: DisplaySortableTask, right: DisplaySortableTask) {
  const leftCompletionRank = left.status === "COMPLETED" ? 1 : 0;
  const rightCompletionRank = right.status === "COMPLETED" ? 1 : 0;
  if (leftCompletionRank !== rightCompletionRank) {
    return leftCompletionRank - rightCompletionRank;
  }

  const leftSortOrder = typeof left.sortOrder === "number" && Number.isFinite(left.sortOrder) ? left.sortOrder : null;
  const rightSortOrder = typeof right.sortOrder === "number" && Number.isFinite(right.sortOrder) ? right.sortOrder : null;
  const leftHasManualOrder = leftSortOrder !== null;
  const rightHasManualOrder = rightSortOrder !== null;

  if (leftHasManualOrder !== rightHasManualOrder) {
    return leftHasManualOrder ? -1 : 1;
  }
  if (leftSortOrder !== null && rightSortOrder !== null && leftSortOrder !== rightSortOrder) {
    return leftSortOrder - rightSortOrder;
  }

  const createdAtRank = taskCreatedAtTime(left) - taskCreatedAtTime(right);
  if (createdAtRank !== 0) {
    return createdAtRank;
  }

  return left.id.localeCompare(right.id);
}

export function sortTasksForDisplay<TTask extends DisplaySortableTask>(tasks: readonly TTask[]) {
  return [...tasks].sort(compareTasksForDisplay);
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

export interface CalendarHabitCheckIn {
  id: string;
  habitId: string;
  date: string;
  title: string;
  icon: HabitIcon;
  color: HabitColor;
  sortOrder: number;
}

export interface CalendarResponse {
  view: CalendarView;
  occurrences: CalendarOccurrence[];
  habitCheckIns: CalendarHabitCheckIn[];
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

export interface AnniversaryDateParts {
  year: number;
  month: number;
  day: number;
}

export interface AnniversaryDisplayResult {
  displayDirection: AnniversaryDisplayDirection;
  displayDate: string;
  displayValue: string;
  displaySubtext: string;
  daysDelta: number;
}

export interface AnniversaryTimingInput {
  category: AnniversaryCategory;
  date: string;
  repeat: AnniversaryRepeat;
  direction: AnniversaryDirection;
  calendarType: AnniversaryCalendarType;
  lunarMonth?: number | null;
  lunarDay?: number | null;
  solarTerm?: AnniversarySolarTerm | null;
}

export interface BuiltInAnniversaryHolidayTemplate {
  id: string;
  title: string;
  category: "HOLIDAY";
  calendarType: AnniversaryCalendarType;
  month?: number;
  day?: number;
  lunarMonth?: number;
  lunarDay?: number;
  solarTerm?: AnniversarySolarTerm;
  repeat: "YEARLY";
  direction: "COUNTDOWN";
  cardStyle: AnniversaryCardStyle;
  notes: string | null;
}

const msPerDay = 24 * 60 * 60 * 1000;

export const anniversaryCategoryLabels: Record<AnniversaryCategory, string> = {
  ANNIVERSARY: "纪念日",
  COUNTDOWN: "倒数日",
  BIRTHDAY: "生日",
  HOLIDAY: "节日"
};

export const anniversaryRepeatLabels: Record<AnniversaryRepeat, string> = {
  NONE: "不重复",
  WEEKLY: "每周",
  MONTHLY: "每月",
  YEARLY: "每年"
};

export const anniversarySolarTermLabels: Record<AnniversarySolarTerm, string> = {
  QINGMING: "清明"
};

export const builtInAnniversaryHolidayTemplates: BuiltInAnniversaryHolidayTemplate[] = [
  {
    id: "new-year",
    title: "元旦",
    category: "HOLIDAY",
    calendarType: "SOLAR",
    month: 1,
    day: 1,
    repeat: "YEARLY",
    direction: "COUNTDOWN",
    cardStyle: "sunrise",
    notes: null
  },
  {
    id: "spring-festival",
    title: "春节",
    category: "HOLIDAY",
    calendarType: "LUNAR",
    lunarMonth: 1,
    lunarDay: 1,
    repeat: "YEARLY",
    direction: "COUNTDOWN",
    cardStyle: "rose",
    notes: null
  },
  {
    id: "lantern-festival",
    title: "元宵节",
    category: "HOLIDAY",
    calendarType: "LUNAR",
    lunarMonth: 1,
    lunarDay: 15,
    repeat: "YEARLY",
    direction: "COUNTDOWN",
    cardStyle: "lavender",
    notes: null
  },
  {
    id: "qingming",
    title: "清明节",
    category: "HOLIDAY",
    calendarType: "SOLAR_TERM",
    solarTerm: "QINGMING",
    repeat: "YEARLY",
    direction: "COUNTDOWN",
    cardStyle: "mint",
    notes: null
  },
  {
    id: "labor-day",
    title: "劳动节",
    category: "HOLIDAY",
    calendarType: "SOLAR",
    month: 5,
    day: 1,
    repeat: "YEARLY",
    direction: "COUNTDOWN",
    cardStyle: "ocean",
    notes: null
  },
  {
    id: "dragon-boat",
    title: "端午节",
    category: "HOLIDAY",
    calendarType: "LUNAR",
    lunarMonth: 5,
    lunarDay: 5,
    repeat: "YEARLY",
    direction: "COUNTDOWN",
    cardStyle: "mint",
    notes: null
  },
  {
    id: "qixi",
    title: "七夕",
    category: "HOLIDAY",
    calendarType: "LUNAR",
    lunarMonth: 7,
    lunarDay: 7,
    repeat: "YEARLY",
    direction: "COUNTDOWN",
    cardStyle: "rose",
    notes: null
  },
  {
    id: "mid-autumn",
    title: "中秋节",
    category: "HOLIDAY",
    calendarType: "LUNAR",
    lunarMonth: 8,
    lunarDay: 15,
    repeat: "YEARLY",
    direction: "COUNTDOWN",
    cardStyle: "sunrise",
    notes: null
  },
  {
    id: "double-ninth",
    title: "重阳节",
    category: "HOLIDAY",
    calendarType: "LUNAR",
    lunarMonth: 9,
    lunarDay: 9,
    repeat: "YEARLY",
    direction: "COUNTDOWN",
    cardStyle: "classic",
    notes: null
  },
  {
    id: "national-day",
    title: "国庆节",
    category: "HOLIDAY",
    calendarType: "SOLAR",
    month: 10,
    day: 1,
    repeat: "YEARLY",
    direction: "COUNTDOWN",
    cardStyle: "ocean",
    notes: null
  }
];

export function parseDateKey(value: string): AnniversaryDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return {
    year: Number(match?.[1] ?? 0),
    month: Number(match?.[2] ?? 0),
    day: Number(match?.[3] ?? 0)
  };
}

export function formatDateKey(parts: AnniversaryDateParts) {
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0")
  ].join("-");
}

export function toLocalDateKey(date = new Date()) {
  return formatDateKey({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate()
  });
}

export function compareDateKeys(left: string, right: string) {
  return toDayNumber(parseDateKey(left)) - toDayNumber(parseDateKey(right));
}

export function calculateAnniversaryDisplay(event: AnniversaryTimingInput, todayKey = toLocalDateKey()): AnniversaryDisplayResult {
  const intendedDirection = resolveAnniversaryDirection(event.category, event.direction);
  const displayDate = intendedDirection === "COUNTDOWN"
    ? nextOccurrenceOnOrAfter(event, todayKey)
    : previousOccurrenceOnOrBefore(event, todayKey);
  const daysDelta = diffDays(todayKey, displayDate);
  const displayDirection = daysDelta === 0
    ? intendedDirection
    : daysDelta > 0 ? "COUNTDOWN" : "ELAPSED";
  const displayValue = daysDelta === 0
    ? "今天"
    : formatAnniversaryDuration(diffCalendarParts(
      daysDelta > 0 ? todayKey : displayDate,
      daysDelta > 0 ? displayDate : todayKey
    ));
  const displaySubtext = daysDelta === 0
    ? `${formatHumanDate(displayDate)} 就是今天`
    : `距离 ${formatHumanDate(displayDate)} ${displayDirection === "COUNTDOWN" ? "还有" : "已经"}`;

  return {
    displayDirection,
    displayDate,
    displayValue,
    displaySubtext,
    daysDelta
  };
}

export function resolveBuiltInAnniversaryTemplate(templateId: string, todayKey = toLocalDateKey()): CreateAnniversaryRequest | null {
  const template = builtInAnniversaryHolidayTemplates.find((item) => item.id === templateId);
  if (!template) {
    return null;
  }

  const today = parseDateKey(todayKey);
  const seedDate = resolveTemplateSeedDate(template, today.year);
  const event: AnniversaryTimingInput = {
    category: template.category,
    date: seedDate,
    repeat: template.repeat,
    direction: template.direction,
    calendarType: template.calendarType,
    lunarMonth: template.lunarMonth ?? null,
    lunarDay: template.lunarDay ?? null,
    solarTerm: template.solarTerm ?? null
  };

  return {
    title: template.title,
    notes: template.notes,
    category: template.category,
    date: nextOccurrenceOnOrAfter(event, todayKey),
    repeat: template.repeat,
    direction: template.direction,
    cardStyle: template.cardStyle,
    calendarType: template.calendarType,
    lunarMonth: template.lunarMonth ?? null,
    lunarDay: template.lunarDay ?? null,
    solarTerm: template.solarTerm ?? null
  };
}

function resolveAnniversaryDirection(category: AnniversaryCategory, direction: AnniversaryDirection): AnniversaryDisplayDirection {
  if (direction === "ELAPSED" || direction === "COUNTDOWN") {
    return direction;
  }
  return category === "ANNIVERSARY" || category === "BIRTHDAY" ? "ELAPSED" : "COUNTDOWN";
}

function resolveTemplateSeedDate(template: BuiltInAnniversaryHolidayTemplate, year: number) {
  if (template.calendarType === "LUNAR" && template.lunarMonth && template.lunarDay) {
    return lunarDateToSolarKey(year, template.lunarMonth, template.lunarDay);
  }
  if (template.calendarType === "SOLAR_TERM" && template.solarTerm) {
    return solarTermDateKey(year, template.solarTerm);
  }
  return formatDateKey({
    year,
    month: template.month ?? 1,
    day: Math.min(template.day ?? 1, daysInMonth(year, template.month ?? 1))
  });
}

function nextOccurrenceOnOrAfter(event: AnniversaryTimingInput, todayKey: string): string {
  const base = parseDateKey(event.date);
  const today = parseDateKey(todayKey);
  if (compareDateKeys(todayKey, event.date) <= 0 || event.repeat === "NONE") {
    return event.date;
  }

  if (event.repeat === "WEEKLY") {
    const baseDay = dayOfWeek(base);
    const todayDay = dayOfWeek(today);
    const offset = (baseDay - todayDay + 7) % 7;
    return formatDateKey(addDays(today, offset));
  }

  if (event.repeat === "MONTHLY") {
    let candidate = monthlyOccurrence(today.year, today.month, base.day);
    if (compareDateKeys(formatDateKey(candidate), todayKey) < 0) {
      candidate = addMonthsClamped(candidate, 1, base.day);
    }
    return formatDateKey(candidate);
  }

  for (let year = today.year; year <= today.year + 3; year += 1) {
    const candidate = yearlyOccurrence(event, year);
    if (compareDateKeys(candidate, todayKey) >= 0 && compareDateKeys(candidate, event.date) >= 0) {
      return candidate;
    }
  }

  return event.date;
}

function previousOccurrenceOnOrBefore(event: AnniversaryTimingInput, todayKey: string): string {
  const base = parseDateKey(event.date);
  const today = parseDateKey(todayKey);
  if (compareDateKeys(todayKey, event.date) <= 0 || event.repeat === "NONE") {
    return event.date;
  }

  if (event.repeat === "WEEKLY") {
    const baseDay = dayOfWeek(base);
    const todayDay = dayOfWeek(today);
    const offset = (todayDay - baseDay + 7) % 7;
    return formatDateKey(addDays(today, -offset));
  }

  if (event.repeat === "MONTHLY") {
    let candidate = monthlyOccurrence(today.year, today.month, base.day);
    if (compareDateKeys(formatDateKey(candidate), todayKey) > 0) {
      candidate = addMonthsClamped(candidate, -1, base.day);
    }
    return compareDateKeys(formatDateKey(candidate), event.date) >= 0 ? formatDateKey(candidate) : event.date;
  }

  for (let year = today.year; year >= base.year - 1; year -= 1) {
    const candidate = yearlyOccurrence(event, year);
    if (compareDateKeys(candidate, todayKey) <= 0 && compareDateKeys(candidate, event.date) >= 0) {
      return candidate;
    }
  }

  return event.date;
}

function yearlyOccurrence(event: AnniversaryTimingInput, year: number) {
  if (event.calendarType === "LUNAR" && event.lunarMonth && event.lunarDay) {
    return lunarDateToSolarKey(year, event.lunarMonth, event.lunarDay);
  }
  if (event.calendarType === "SOLAR_TERM" && event.solarTerm) {
    return solarTermDateKey(year, event.solarTerm);
  }

  const base = parseDateKey(event.date);
  return formatDateKey({
    year,
    month: base.month,
    day: Math.min(base.day, daysInMonth(year, base.month))
  });
}

function lunarDateToSolarKey(year: number, month: number, day: number) {
  return Lunar.fromYmd(year, month, day).getSolar().toString();
}

function solarTermDateKey(year: number, term: AnniversarySolarTerm) {
  const solar = Lunar.fromYmd(year, 1, 1).getJieQiTable()[anniversarySolarTermLabels[term]];
  return solar?.toString() ?? formatDateKey({ year, month: 4, day: 4 });
}

function monthlyOccurrence(year: number, month: number, day: number) {
  return {
    year,
    month,
    day: Math.min(day, daysInMonth(year, month))
  };
}

function addMonthsClamped(parts: AnniversaryDateParts, offset: number, preferredDay = parts.day): AnniversaryDateParts {
  const monthIndex = parts.year * 12 + (parts.month - 1) + offset;
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12 + 12) % 12 + 1;
  return {
    year,
    month,
    day: Math.min(preferredDay, daysInMonth(year, month))
  };
}

function addYearsClamped(parts: AnniversaryDateParts, years: number) {
  return {
    year: parts.year + years,
    month: parts.month,
    day: Math.min(parts.day, daysInMonth(parts.year + years, parts.month))
  };
}

function addDays(parts: AnniversaryDateParts, days: number) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dayOfWeek(parts: AnniversaryDateParts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

function toDayNumber(parts: AnniversaryDateParts) {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / msPerDay);
}

function diffDays(fromKey: string, toKey: string) {
  return toDayNumber(parseDateKey(toKey)) - toDayNumber(parseDateKey(fromKey));
}

function diffCalendarParts(fromKey: string, toKey: string) {
  const from = parseDateKey(fromKey);
  const to = parseDateKey(toKey);
  let years = to.year - from.year;
  let anchor = addYearsClamped(from, years);
  if (compareDateKeys(formatDateKey(anchor), toKey) > 0) {
    years -= 1;
    anchor = addYearsClamped(from, years);
  }

  let months = 0;
  while (compareDateKeys(formatDateKey(addMonthsClamped(anchor, months + 1)), toKey) <= 0) {
    months += 1;
  }
  anchor = addMonthsClamped(anchor, months);

  return {
    years,
    months,
    days: diffDays(formatDateKey(anchor), toKey),
    totalDays: diffDays(fromKey, toKey)
  };
}

function formatAnniversaryDuration(duration: { years: number; months: number; days: number; totalDays: number }) {
  if (duration.years <= 0 && duration.months <= 0) {
    return `${duration.totalDays}天`;
  }

  return [
    duration.years > 0 ? `${duration.years}年` : "",
    duration.months > 0 ? `${duration.months}月` : "",
    duration.days > 0 ? `${duration.days}天` : ""
  ].filter(Boolean).join("");
}

function formatHumanDate(dateKey: string) {
  const { year, month, day } = parseDateKey(dateKey);
  return `${year}/${month}/${day}`;
}
