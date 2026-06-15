import type { FastifyInstance } from "fastify";
import { taskViewModeValues, updateThemePreferenceRequestSchema, type TaskViewMode } from "@todo/shared";
import { execute, queryOne, type DbRow } from "../db.js";

type ThemePreferenceRow = DbRow & {
  themeId: string;
  titleColor: string;
  footerVisible: boolean | number;
  footerType: string;
  showCompletedTasks: boolean | number;
  taskViewMode: string;
};

const defaultThemeId = "default";
const defaultTitleColor = "app-teal";
const defaultFooterVisible = true;
const defaultFooterType = "sea";
const defaultShowCompletedTasks = true;
const defaultTaskViewMode: TaskViewMode = "list";

function booleanFromDb(value: boolean | number | null | undefined, fallback: boolean) {
  if (value === undefined || value === null) {
    return fallback;
  }
  return typeof value === "boolean" ? value : value !== 0;
}

function taskViewModeFromDb(value: string | null | undefined) {
  return taskViewModeValues.includes(value as TaskViewMode) ? value as TaskViewMode : defaultTaskViewMode;
}

async function ensureThemePreference(userId: string) {
  await execute(
    "INSERT IGNORE INTO `UserThemePreference` (`userId`, `themeId`, `titleColor`, `footerVisible`, `footerType`, `showCompletedTasks`, `taskViewMode`, `updatedAt`) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3))",
    [userId, defaultThemeId, defaultTitleColor, defaultFooterVisible, defaultFooterType, defaultShowCompletedTasks, defaultTaskViewMode]
  );
}

export async function preferenceRoutes(app: FastifyInstance) {
  app.get("/preferences/theme", { preHandler: app.authenticate }, async (request) => {
    await ensureThemePreference(request.user.id);
    const preference = await queryOne<ThemePreferenceRow>(
      "SELECT `themeId`, `titleColor`, `footerVisible`, `footerType`, `showCompletedTasks`, `taskViewMode` FROM `UserThemePreference` WHERE `userId` = ?",
      [request.user.id]
    );
    return {
      themeId: preference?.themeId ?? defaultThemeId,
      titleColor: preference?.titleColor ?? defaultTitleColor,
      footerVisible: booleanFromDb(preference?.footerVisible, defaultFooterVisible),
      footerType: preference?.footerType ?? defaultFooterType,
      showCompletedTasks: booleanFromDb(preference?.showCompletedTasks, defaultShowCompletedTasks),
      taskViewMode: taskViewModeFromDb(preference?.taskViewMode)
    };
  });

  app.put("/preferences/theme", { preHandler: app.authenticate }, async (request) => {
    const body = updateThemePreferenceRequestSchema.parse(request.body);
    await ensureThemePreference(request.user.id);
    const current = await queryOne<ThemePreferenceRow>(
      "SELECT `themeId`, `titleColor`, `footerVisible`, `footerType`, `showCompletedTasks`, `taskViewMode` FROM `UserThemePreference` WHERE `userId` = ?",
      [request.user.id]
    );
    const themeId = body.themeId ?? current?.themeId ?? defaultThemeId;
    const titleColor = body.titleColor ?? current?.titleColor ?? defaultTitleColor;
    const footerVisible = body.footerVisible ?? booleanFromDb(current?.footerVisible, defaultFooterVisible);
    const footerType = body.footerType ?? current?.footerType ?? defaultFooterType;
    const showCompletedTasks = body.showCompletedTasks ?? booleanFromDb(current?.showCompletedTasks, defaultShowCompletedTasks);
    const taskViewMode = body.taskViewMode ?? taskViewModeFromDb(current?.taskViewMode);

    await execute(
      `INSERT INTO \`UserThemePreference\` (\`userId\`, \`themeId\`, \`titleColor\`, \`footerVisible\`, \`footerType\`, \`showCompletedTasks\`, \`taskViewMode\`, \`updatedAt\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3))
       ON DUPLICATE KEY UPDATE
        \`themeId\` = VALUES(\`themeId\`),
        \`titleColor\` = VALUES(\`titleColor\`),
        \`footerVisible\` = VALUES(\`footerVisible\`),
        \`footerType\` = VALUES(\`footerType\`),
        \`showCompletedTasks\` = VALUES(\`showCompletedTasks\`),
        \`taskViewMode\` = VALUES(\`taskViewMode\`),
        \`updatedAt\` = NOW(3)`,
      [request.user.id, themeId, titleColor, footerVisible, footerType, showCompletedTasks, taskViewMode]
    );
    return { themeId, titleColor, footerVisible, footerType, showCompletedTasks, taskViewMode };
  });
}
