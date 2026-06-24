import type { FastifyInstance } from "fastify";
import {
  appCloseBehaviorValues,
  defaultVisibleSidebarModules,
  displaySizeValues,
  floatingCardThemeIdValues,
  fontFamilyValues,
  sidebarModuleValues,
  taskCardDisplayModeValues,
  taskViewModeValues,
  updateThemePreferenceRequestSchema,
  type AppCloseBehavior,
  type DisplaySize,
  type FloatingCardThemeId,
  type FontFamily,
  type SidebarModule,
  type TaskCardDisplayMode,
  type TaskViewMode
} from "@todo/shared";
import { execute, queryOne, type DbRow } from "../db.js";

type ThemePreferenceRow = DbRow & {
  themeId: string;
  titleColor: string;
  footerVisible: boolean | number;
  footerType: string;
  showCompletedTasks: boolean | number;
  taskViewMode: string;
  taskCardDisplayMode: string;
  floatingCardThemeId: string;
  appCloseBehavior: string;
  displaySize: string;
  visibleSidebarModules: string | null;
  sidebarCollapsed: boolean | number;
  fontFamily: string;
};

const defaultThemeId = "default";
const defaultTitleColor = "app-teal";
const defaultFooterVisible = true;
const defaultFooterType = "sea";
const defaultShowCompletedTasks = true;
const defaultTaskViewMode: TaskViewMode = "list";
const defaultTaskCardDisplayMode: TaskCardDisplayMode = "full";
const defaultFloatingCardThemeId: FloatingCardThemeId = "warm-paper";
const defaultAppCloseBehavior: AppCloseBehavior = "hide";
const defaultDisplaySize: DisplaySize = "default";
const defaultFontFamily: FontFamily = "system";
const defaultSidebarCollapsed = false;
const defaultVisibleSidebarModuleValue = defaultVisibleSidebarModules.join(",");

function booleanFromDb(value: boolean | number | null | undefined, fallback: boolean) {
  if (value === undefined || value === null) {
    return fallback;
  }
  return typeof value === "boolean" ? value : value !== 0;
}

function taskViewModeFromDb(value: string | null | undefined) {
  return taskViewModeValues.includes(value as TaskViewMode) ? value as TaskViewMode : defaultTaskViewMode;
}

function displaySizeFromDb(value: string | null | undefined) {
  return displaySizeValues.includes(value as DisplaySize) ? value as DisplaySize : defaultDisplaySize;
}

function fontFamilyFromDb(value: string | null | undefined) {
  return fontFamilyValues.includes(value as FontFamily) ? value as FontFamily : defaultFontFamily;
}

function taskCardDisplayModeFromDb(value: string | null | undefined) {
  return taskCardDisplayModeValues.includes(value as TaskCardDisplayMode) ? value as TaskCardDisplayMode : defaultTaskCardDisplayMode;
}

function floatingCardThemeIdFromDb(value: string | null | undefined) {
  return floatingCardThemeIdValues.includes(value as FloatingCardThemeId) ? value as FloatingCardThemeId : defaultFloatingCardThemeId;
}

function appCloseBehaviorFromDb(value: string | null | undefined) {
  return appCloseBehaviorValues.includes(value as AppCloseBehavior) ? value as AppCloseBehavior : defaultAppCloseBehavior;
}

function normalizeSidebarModules(values: readonly string[]) {
  const modules: SidebarModule[] = [];
  for (const value of values) {
    if (sidebarModuleValues.includes(value as SidebarModule) && !modules.includes(value as SidebarModule)) {
      modules.push(value as SidebarModule);
    }
  }
  return modules;
}

function sidebarModulesFromDb(value: string | null | undefined) {
  if (value === undefined || value === null) {
    return defaultVisibleSidebarModules;
  }

  const tokens = value.split(",").map((module) => module.trim()).filter(Boolean);
  if (tokens.length === 0) {
    return [];
  }

  const modules = normalizeSidebarModules(tokens);
  return modules.length > 0 ? modules : defaultVisibleSidebarModules;
}

async function ensureThemePreference(userId: string) {
  await execute(
    "INSERT IGNORE INTO `UserThemePreference` (`userId`, `themeId`, `titleColor`, `footerVisible`, `footerType`, `showCompletedTasks`, `taskViewMode`, `taskCardDisplayMode`, `floatingCardThemeId`, `appCloseBehavior`, `displaySize`, `visibleSidebarModules`, `sidebarCollapsed`, `fontFamily`, `updatedAt`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))",
    [userId, defaultThemeId, defaultTitleColor, defaultFooterVisible, defaultFooterType, defaultShowCompletedTasks, defaultTaskViewMode, defaultTaskCardDisplayMode, defaultFloatingCardThemeId, defaultAppCloseBehavior, defaultDisplaySize, defaultVisibleSidebarModuleValue, defaultSidebarCollapsed, defaultFontFamily]
  );
}

export async function preferenceRoutes(app: FastifyInstance) {
  app.get("/preferences/theme", { preHandler: app.authenticate }, async (request) => {
    await ensureThemePreference(request.user.id);
    const preference = await queryOne<ThemePreferenceRow>(
      "SELECT `themeId`, `titleColor`, `footerVisible`, `footerType`, `showCompletedTasks`, `taskViewMode`, `taskCardDisplayMode`, `floatingCardThemeId`, `appCloseBehavior`, `displaySize`, `visibleSidebarModules`, `sidebarCollapsed`, `fontFamily` FROM `UserThemePreference` WHERE `userId` = ?",
      [request.user.id]
    );
    return {
      themeId: preference?.themeId ?? defaultThemeId,
      titleColor: preference?.titleColor ?? defaultTitleColor,
      footerVisible: booleanFromDb(preference?.footerVisible, defaultFooterVisible),
      footerType: preference?.footerType ?? defaultFooterType,
      showCompletedTasks: booleanFromDb(preference?.showCompletedTasks, defaultShowCompletedTasks),
      taskViewMode: taskViewModeFromDb(preference?.taskViewMode),
      taskCardDisplayMode: taskCardDisplayModeFromDb(preference?.taskCardDisplayMode),
      floatingCardThemeId: floatingCardThemeIdFromDb(preference?.floatingCardThemeId),
      appCloseBehavior: appCloseBehaviorFromDb(preference?.appCloseBehavior),
      displaySize: displaySizeFromDb(preference?.displaySize),
      visibleSidebarModules: sidebarModulesFromDb(preference?.visibleSidebarModules),
      sidebarCollapsed: booleanFromDb(preference?.sidebarCollapsed, defaultSidebarCollapsed),
      fontFamily: fontFamilyFromDb(preference?.fontFamily)
    };
  });

  app.put("/preferences/theme", { preHandler: app.authenticate }, async (request) => {
    const body = updateThemePreferenceRequestSchema.parse(request.body);
    await ensureThemePreference(request.user.id);
    const current = await queryOne<ThemePreferenceRow>(
      "SELECT `themeId`, `titleColor`, `footerVisible`, `footerType`, `showCompletedTasks`, `taskViewMode`, `taskCardDisplayMode`, `floatingCardThemeId`, `appCloseBehavior`, `displaySize`, `visibleSidebarModules`, `sidebarCollapsed`, `fontFamily` FROM `UserThemePreference` WHERE `userId` = ?",
      [request.user.id]
    );
    const themeId = body.themeId ?? current?.themeId ?? defaultThemeId;
    const titleColor = body.titleColor ?? current?.titleColor ?? defaultTitleColor;
    const footerVisible = body.footerVisible ?? booleanFromDb(current?.footerVisible, defaultFooterVisible);
    const footerType = body.footerType ?? current?.footerType ?? defaultFooterType;
    const showCompletedTasks = body.showCompletedTasks ?? booleanFromDb(current?.showCompletedTasks, defaultShowCompletedTasks);
    const taskViewMode = body.taskViewMode ?? taskViewModeFromDb(current?.taskViewMode);
    const taskCardDisplayMode = body.taskCardDisplayMode ?? taskCardDisplayModeFromDb(current?.taskCardDisplayMode);
    const floatingCardThemeId = body.floatingCardThemeId ?? floatingCardThemeIdFromDb(current?.floatingCardThemeId);
    const appCloseBehavior = body.appCloseBehavior ?? appCloseBehaviorFromDb(current?.appCloseBehavior);
    const displaySize = body.displaySize ?? displaySizeFromDb(current?.displaySize);
    const visibleSidebarModules = body.visibleSidebarModules !== undefined
      ? normalizeSidebarModules(body.visibleSidebarModules)
      : sidebarModulesFromDb(current?.visibleSidebarModules);
    const visibleSidebarModuleValue = visibleSidebarModules.join(",");
    const sidebarCollapsed = body.sidebarCollapsed ?? booleanFromDb(current?.sidebarCollapsed, defaultSidebarCollapsed);
    const fontFamily = body.fontFamily ?? fontFamilyFromDb(current?.fontFamily);

    await execute(
      `INSERT INTO \`UserThemePreference\` (\`userId\`, \`themeId\`, \`titleColor\`, \`footerVisible\`, \`footerType\`, \`showCompletedTasks\`, \`taskViewMode\`, \`taskCardDisplayMode\`, \`floatingCardThemeId\`, \`appCloseBehavior\`, \`displaySize\`, \`visibleSidebarModules\`, \`sidebarCollapsed\`, \`fontFamily\`, \`updatedAt\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))
       ON DUPLICATE KEY UPDATE
        \`themeId\` = VALUES(\`themeId\`),
        \`titleColor\` = VALUES(\`titleColor\`),
        \`footerVisible\` = VALUES(\`footerVisible\`),
        \`footerType\` = VALUES(\`footerType\`),
        \`showCompletedTasks\` = VALUES(\`showCompletedTasks\`),
        \`taskViewMode\` = VALUES(\`taskViewMode\`),
        \`taskCardDisplayMode\` = VALUES(\`taskCardDisplayMode\`),
        \`floatingCardThemeId\` = VALUES(\`floatingCardThemeId\`),
        \`appCloseBehavior\` = VALUES(\`appCloseBehavior\`),
        \`displaySize\` = VALUES(\`displaySize\`),
        \`visibleSidebarModules\` = VALUES(\`visibleSidebarModules\`),
        \`sidebarCollapsed\` = VALUES(\`sidebarCollapsed\`),
        \`fontFamily\` = VALUES(\`fontFamily\`),
        \`updatedAt\` = NOW(3)`,
      [request.user.id, themeId, titleColor, footerVisible, footerType, showCompletedTasks, taskViewMode, taskCardDisplayMode, floatingCardThemeId, appCloseBehavior, displaySize, visibleSidebarModuleValue, sidebarCollapsed, fontFamily]
    );
    return { themeId, titleColor, footerVisible, footerType, showCompletedTasks, taskViewMode, taskCardDisplayMode, floatingCardThemeId, appCloseBehavior, displaySize, visibleSidebarModules, sidebarCollapsed, fontFamily };
  });
}
