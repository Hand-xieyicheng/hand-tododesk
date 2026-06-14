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
    return;
  }

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
