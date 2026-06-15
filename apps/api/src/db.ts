import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql, { type PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { escapeId } from "mysql2";
import { config } from "./config.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

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

export function toMysqlDate(date: Date | null | undefined) {
  if (!date) {
    return null;
  }
  return date.toISOString().slice(0, 19).replace("T", " ");
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

async function ensureIncrementalSchema() {
  await ensureTaskPrioritySchema();
  await ensureColumn("User", "gender", "ALTER TABLE `User` ADD COLUMN `gender` ENUM('PRIVATE', 'MALE', 'FEMALE', 'OTHER') NOT NULL DEFAULT 'PRIVATE'");
  await ensureColumn("User", "avatarPath", "ALTER TABLE `User` ADD COLUMN `avatarPath` VARCHAR(191) NULL");
  await ensureColumn("UserThemePreference", "titleColor", "ALTER TABLE `UserThemePreference` ADD COLUMN `titleColor` VARCHAR(191) NOT NULL DEFAULT 'app-teal'");
  await ensureColumn("UserThemePreference", "footerVisible", "ALTER TABLE `UserThemePreference` ADD COLUMN `footerVisible` BOOLEAN NOT NULL DEFAULT TRUE");
  await ensureColumn("UserThemePreference", "footerType", "ALTER TABLE `UserThemePreference` ADD COLUMN `footerType` VARCHAR(191) NOT NULL DEFAULT 'sea'");
  await ensureColumn("UserThemePreference", "showCompletedTasks", "ALTER TABLE `UserThemePreference` ADD COLUMN `showCompletedTasks` BOOLEAN NOT NULL DEFAULT TRUE");
  await ensureColumn("UserThemePreference", "taskViewMode", "ALTER TABLE `UserThemePreference` ADD COLUMN `taskViewMode` VARCHAR(191) NOT NULL DEFAULT 'list'");
  await ensureColumn("UserThemePreference", "taskCardDisplayMode", "ALTER TABLE `UserThemePreference` ADD COLUMN `taskCardDisplayMode` VARCHAR(191) NOT NULL DEFAULT 'full'");
  await ensureColumn("UserThemePreference", "displaySize", "ALTER TABLE `UserThemePreference` ADD COLUMN `displaySize` VARCHAR(191) NOT NULL DEFAULT 'default'");
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
