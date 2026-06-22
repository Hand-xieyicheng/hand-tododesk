import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql, { type PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { escapeId } from "mysql2";
import { config } from "./config.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const taskSingleTagMarkerKey = "task_single_tag_management_v1";

export const pool = mysql.createPool({
  host: config.DB_HOST ?? "localhost",
  port: config.DB_PORT ?? 3306,
  user: config.DB_USER ?? "root",
  password: config.DB_PASSWORD ?? "",
  database: config.DB_NAME ?? "todoDesk",
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true
});

export type DbRow = RowDataPacket & Record<string, unknown>;

export async function queryRows<T extends DbRow = DbRow>(sql: string, values: unknown[] | Record<string, unknown> = []) {
  const [rows] = await pool.query<T[]>(sql, values);
  return rows;
}

export async function queryOne<T extends DbRow = DbRow>(sql: string, values: unknown[] | Record<string, unknown> = []) {
  const rows = await queryRows<T>(sql, values);
  return rows[0] ?? null;
}

export async function execute(sql: string, values: unknown[] | Record<string, unknown> = []) {
  const [result] = await pool.execute<ResultSetHeader>(sql, values);
  return result;
}

export async function transaction<T>(callback: (connection: PoolConnection) => Promise<T>) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export function id() {
  return crypto.randomUUID();
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function toMysqlDate(date: Date | null | undefined) {
  if (!date) {
    return null;
  }
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate())
  ].join("-") + " " + [
    padDatePart(date.getHours()),
    padDatePart(date.getMinutes()),
    padDatePart(date.getSeconds())
  ].join(":");
}

export function asDate(value: unknown) {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value : new Date(String(value));
}

async function columnExists(tableName: string, columnName: string) {
  return queryOne<DbRow & { COLUMN_TYPE: string }>(
    `SELECT COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
}

async function ensureColumn(tableName: string, columnName: string, addColumnSql: string) {
  const column = await columnExists(tableName, columnName);
  if (!column) {
    await execute(addColumnSql);
  }
}

async function ensureTaskPrioritySchema() {
  const priorityColumn = await columnExists("Task", "priority");
  const columnType = String(priorityColumn?.COLUMN_TYPE ?? "");
  if (!columnType) {
    return;
  }

  const hasQuadrantValues = [
    "IMPORTANT_URGENT",
    "IMPORTANT_NOT_URGENT",
    "NOT_IMPORTANT_URGENT",
    "NOT_IMPORTANT_NOT_URGENT"
  ].every((value) => columnType.includes(`'${value}'`));
  const hasLegacyValues = ["LOW", "MEDIUM", "HIGH", "URGENT"].some((value) => columnType.includes(`'${value}'`));

  if (hasQuadrantValues && !hasLegacyValues) {
    return;
  }

  if (hasLegacyValues) {
    await execute(
      `ALTER TABLE \`Task\`
       MODIFY \`priority\` ENUM(
        'LOW',
        'MEDIUM',
        'HIGH',
        'URGENT',
        'IMPORTANT_URGENT',
        'IMPORTANT_NOT_URGENT',
        'NOT_IMPORTANT_URGENT',
        'NOT_IMPORTANT_NOT_URGENT'
       ) NOT NULL DEFAULT 'IMPORTANT_NOT_URGENT'`
    );

    await execute(
      `UPDATE \`Task\`
       SET \`priority\` = CASE \`priority\`
        WHEN 'URGENT' THEN 'IMPORTANT_URGENT'
        WHEN 'HIGH' THEN 'IMPORTANT_NOT_URGENT'
        WHEN 'MEDIUM' THEN 'NOT_IMPORTANT_URGENT'
        WHEN 'LOW' THEN 'NOT_IMPORTANT_NOT_URGENT'
        ELSE \`priority\`
       END`
    );
  }

  await execute(
    `ALTER TABLE \`Task\`
     MODIFY \`priority\` ENUM(
      'IMPORTANT_URGENT',
      'IMPORTANT_NOT_URGENT',
      'NOT_IMPORTANT_URGENT',
      'NOT_IMPORTANT_NOT_URGENT'
     ) NOT NULL DEFAULT 'IMPORTANT_NOT_URGENT'`
  );
}

async function ensureMemoSchema() {
  await execute(
    `CREATE TABLE IF NOT EXISTS \`Memo\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`userId\` VARCHAR(191) NOT NULL,
      \`title\` VARCHAR(191) NOT NULL,
      \`contentHtml\` MEDIUMTEXT NOT NULL,
      \`excerpt\` VARCHAR(500) NULL,
      \`isPinned\` BOOLEAN NOT NULL DEFAULT FALSE,
      \`archivedAt\` DATETIME(3) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`Memo_userId_isPinned_idx\` (\`userId\`, \`isPinned\`),
      INDEX \`Memo_userId_updatedAt_idx\` (\`userId\`, \`updatedAt\`),
      INDEX \`Memo_userId_archivedAt_idx\` (\`userId\`, \`archivedAt\`),
      CONSTRAINT \`Memo_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );

  const contentHtmlColumn = await columnExists("Memo", "contentHtml");
  const contentMarkdownColumn = await columnExists("Memo", "contentMarkdown");
  if (!contentHtmlColumn && contentMarkdownColumn) {
    await execute("ALTER TABLE `Memo` CHANGE COLUMN `contentMarkdown` `contentHtml` MEDIUMTEXT NOT NULL");
  } else if (!contentHtmlColumn) {
    await execute("ALTER TABLE `Memo` ADD COLUMN `contentHtml` MEDIUMTEXT NULL");
    await execute("UPDATE `Memo` SET `contentHtml` = '' WHERE `contentHtml` IS NULL");
    await execute("ALTER TABLE `Memo` MODIFY COLUMN `contentHtml` MEDIUMTEXT NOT NULL");
  }

  await execute(
    `CREATE TABLE IF NOT EXISTS \`MemoAsset\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`memoId\` VARCHAR(191) NOT NULL,
      \`userId\` VARCHAR(191) NOT NULL,
      \`filename\` VARCHAR(191) NOT NULL,
      \`mimeType\` VARCHAR(191) NOT NULL,
      \`sizeBytes\` INTEGER NOT NULL,
      \`width\` INTEGER NULL,
      \`height\` INTEGER NULL,
      \`path\` VARCHAR(255) NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`MemoAsset_memoId_idx\` (\`memoId\`),
      INDEX \`MemoAsset_userId_idx\` (\`userId\`),
      CONSTRAINT \`MemoAsset_memoId_fkey\` FOREIGN KEY (\`memoId\`) REFERENCES \`Memo\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT \`MemoAsset_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
}

async function ensureAnniversarySchema() {
  await execute(
    `CREATE TABLE IF NOT EXISTS \`AnniversaryEvent\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`userId\` VARCHAR(191) NOT NULL,
      \`title\` VARCHAR(191) NOT NULL,
      \`notes\` TEXT NULL,
      \`category\` VARCHAR(191) NOT NULL,
      \`date\` VARCHAR(10) NOT NULL,
      \`repeat\` VARCHAR(191) NOT NULL DEFAULT 'NONE',
      \`direction\` VARCHAR(191) NOT NULL DEFAULT 'AUTO',
      \`cardStyle\` VARCHAR(191) NOT NULL DEFAULT 'lavender',
      \`calendarType\` VARCHAR(191) NOT NULL DEFAULT 'SOLAR',
      \`lunarMonth\` INTEGER NULL,
      \`lunarDay\` INTEGER NULL,
      \`solarTerm\` VARCHAR(191) NULL,
      \`sortOrder\` INTEGER NOT NULL DEFAULT 0,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`AnniversaryEvent_userId_sortOrder_idx\` (\`userId\`, \`sortOrder\`),
      INDEX \`AnniversaryEvent_userId_category_date_idx\` (\`userId\`, \`category\`, \`date\`),
      INDEX \`AnniversaryEvent_userId_date_idx\` (\`userId\`, \`date\`),
      CONSTRAINT \`AnniversaryEvent_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await ensureColumn("AnniversaryEvent", "sortOrder", "ALTER TABLE `AnniversaryEvent` ADD COLUMN `sortOrder` INTEGER NOT NULL DEFAULT 0");
}

async function ensureHabitSchema() {
  await execute(
    `CREATE TABLE IF NOT EXISTS \`Habit\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`userId\` VARCHAR(191) NOT NULL,
      \`title\` VARCHAR(191) NOT NULL,
      \`notes\` TEXT NULL,
      \`icon\` VARCHAR(191) NOT NULL DEFAULT 'Smile',
      \`color\` VARCHAR(191) NOT NULL DEFAULT 'mint',
      \`frequency\` VARCHAR(191) NOT NULL,
      \`interval\` INTEGER NOT NULL DEFAULT 1,
      \`weekDays\` JSON NULL,
      \`monthDays\` JSON NULL,
      \`startDate\` VARCHAR(10) NOT NULL,
      \`endDate\` VARCHAR(10) NULL,
      \`sortOrder\` INTEGER NOT NULL DEFAULT 0,
      \`archivedAt\` DATETIME(3) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`Habit_userId_archivedAt_sortOrder_idx\` (\`userId\`, \`archivedAt\`, \`sortOrder\`),
      INDEX \`Habit_userId_sortOrder_idx\` (\`userId\`, \`sortOrder\`),
      CONSTRAINT \`Habit_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS \`HabitCheckIn\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`habitId\` VARCHAR(191) NOT NULL,
      \`userId\` VARCHAR(191) NOT NULL,
      \`date\` VARCHAR(10) NOT NULL,
      \`note\` TEXT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`HabitCheckIn_habitId_date_key\` (\`habitId\`, \`date\`),
      INDEX \`HabitCheckIn_userId_date_idx\` (\`userId\`, \`date\`),
      INDEX \`HabitCheckIn_habitId_date_idx\` (\`habitId\`, \`date\`),
      CONSTRAINT \`HabitCheckIn_habitId_fkey\` FOREIGN KEY (\`habitId\`) REFERENCES \`Habit\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT \`HabitCheckIn_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
}

async function ensureVisibleSidebarModulesSchema() {
  await execute("ALTER TABLE `UserThemePreference` ALTER COLUMN `visibleSidebarModules` SET DEFAULT 'tasks,memos,anniversaries,habits,calendar,pomodoro'");
  await execute(
    `UPDATE \`UserThemePreference\`
     SET \`visibleSidebarModules\` = 'tasks,memos,anniversaries,habits,calendar,pomodoro'
     WHERE \`visibleSidebarModules\` = 'tasks,memos,calendar,pomodoro'`
  );
  await execute(
    `UPDATE \`UserThemePreference\`
     SET \`visibleSidebarModules\` = REPLACE(\`visibleSidebarModules\`, 'anniversaries,calendar', 'anniversaries,habits,calendar')
     WHERE \`visibleSidebarModules\` LIKE '%anniversaries,calendar%'
       AND \`visibleSidebarModules\` NOT LIKE '%habits%'`
  );
}

async function ensureSchemaMarkerTable() {
  await execute(
    `CREATE TABLE IF NOT EXISTS \`SchemaMarker\` (
      \`key\` VARCHAR(191) NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`key\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
}

async function ensureTaskSingleTagDefaults() {
  await ensureSchemaMarkerTable();
  const marker = await queryOne<DbRow & { key: string }>("SELECT `key` FROM `SchemaMarker` WHERE `key` = ?", [taskSingleTagMarkerKey]);
  if (marker) {
    return;
  }

  await transaction(async (connection) => {
    await connection.execute("DELETE FROM `TaskTag`");
    await connection.execute("DELETE FROM `Tag`");
    await connection.execute(
      `INSERT INTO \`Tag\` (\`id\`, \`userId\`, \`name\`, \`createdAt\`)
       SELECT UUID(), u.\`id\`, defaults.\`name\`, NOW(3)
       FROM \`User\` u
       JOIN (
        SELECT '工作' AS \`name\`
        UNION ALL SELECT '生活'
        UNION ALL SELECT '娱乐'
       ) defaults`
    );
    await connection.execute("INSERT INTO `SchemaMarker` (`key`) VALUES (?)", [taskSingleTagMarkerKey]);
  });
}

async function ensureIncrementalSchema() {
  await ensureTaskPrioritySchema();
  await ensureMemoSchema();
  await ensureAnniversarySchema();
  await ensureHabitSchema();
  await ensureColumn("User", "gender", "ALTER TABLE `User` ADD COLUMN `gender` ENUM('PRIVATE', 'MALE', 'FEMALE', 'OTHER') NOT NULL DEFAULT 'PRIVATE'");
  await ensureColumn("User", "avatarPath", "ALTER TABLE `User` ADD COLUMN `avatarPath` VARCHAR(191) NULL");
  await ensureColumn("UserThemePreference", "titleColor", "ALTER TABLE `UserThemePreference` ADD COLUMN `titleColor` VARCHAR(191) NOT NULL DEFAULT 'app-teal'");
  await ensureColumn("UserThemePreference", "footerVisible", "ALTER TABLE `UserThemePreference` ADD COLUMN `footerVisible` BOOLEAN NOT NULL DEFAULT TRUE");
  await ensureColumn("UserThemePreference", "footerType", "ALTER TABLE `UserThemePreference` ADD COLUMN `footerType` VARCHAR(191) NOT NULL DEFAULT 'sea'");
  await ensureColumn("UserThemePreference", "showCompletedTasks", "ALTER TABLE `UserThemePreference` ADD COLUMN `showCompletedTasks` BOOLEAN NOT NULL DEFAULT TRUE");
  await ensureColumn("UserThemePreference", "taskViewMode", "ALTER TABLE `UserThemePreference` ADD COLUMN `taskViewMode` VARCHAR(191) NOT NULL DEFAULT 'list'");
  await ensureColumn("UserThemePreference", "taskCardDisplayMode", "ALTER TABLE `UserThemePreference` ADD COLUMN `taskCardDisplayMode` VARCHAR(191) NOT NULL DEFAULT 'full'");
  await ensureColumn("UserThemePreference", "appCloseBehavior", "ALTER TABLE `UserThemePreference` ADD COLUMN `appCloseBehavior` VARCHAR(191) NOT NULL DEFAULT 'hide'");
  await ensureColumn("UserThemePreference", "displaySize", "ALTER TABLE `UserThemePreference` ADD COLUMN `displaySize` VARCHAR(191) NOT NULL DEFAULT 'default'");
  await ensureColumn("UserThemePreference", "visibleSidebarModules", "ALTER TABLE `UserThemePreference` ADD COLUMN `visibleSidebarModules` VARCHAR(191) NOT NULL DEFAULT 'tasks,memos,anniversaries,habits,calendar,pomodoro'");
  await ensureColumn("UserThemePreference", "sidebarCollapsed", "ALTER TABLE `UserThemePreference` ADD COLUMN `sidebarCollapsed` BOOLEAN NOT NULL DEFAULT FALSE");
  await ensureColumn("UserThemePreference", "fontFamily", "ALTER TABLE `UserThemePreference` ADD COLUMN `fontFamily` VARCHAR(191) NOT NULL DEFAULT 'system'");
  await ensureVisibleSidebarModulesSchema();
  await ensureTaskSingleTagDefaults();
}

async function runAllMigrations() {
  const migrationsPath = path.resolve(dirname, "../prisma/migrations");
  const migrationDirs = await fs.readdir(migrationsPath, { withFileTypes: true });
  const migrationSql = (
    await Promise.all(
      migrationDirs
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
        .map((migration) => fs.readFile(path.join(migrationsPath, migration, "migration.sql"), "utf8"))
    )
  ).join("\n\n");
  const connection = await mysql.createConnection({
    host: config.DB_HOST ?? "localhost",
    port: config.DB_PORT ?? 3306,
    user: config.DB_USER ?? "root",
    password: config.DB_PASSWORD ?? "",
    database: config.DB_NAME ?? "todoDesk",
    multipleStatements: true
  });

  try {
    await connection.query(migrationSql);
  } finally {
    await connection.end();
  }
}

export async function ensureDatabase() {
  const database = config.DB_NAME ?? "todoDesk";
  const connection = await mysql.createConnection({
    host: config.DB_HOST ?? "localhost",
    port: config.DB_PORT ?? 3306,
    user: config.DB_USER ?? "root",
    password: config.DB_PASSWORD ?? "",
    multipleStatements: true
  });

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${escapeId(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await connection.end();
  }
}

export async function ensureSchema() {
  await ensureDatabase();
  const existing = await queryOne("SHOW TABLES LIKE 'User'");
  if (existing) {
    await ensureIncrementalSchema();
    return;
  }

  await runAllMigrations();
}
