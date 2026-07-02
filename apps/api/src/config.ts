import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

if (!process.env.DATABASE_URL && process.env.DB_HOST && process.env.DB_PORT && process.env.DB_NAME && process.env.DB_USER) {
  const user = encodeURIComponent(process.env.DB_USER);
  const password = encodeURIComponent(process.env.DB_PASSWORD ?? "");
  process.env.DATABASE_URL = `mysql://${user}:${password}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4020),
  HOST: z.string().min(1).default("127.0.0.1"),
  APP_ORIGIN: z.string().url().default("http://localhost:8090"),
  EXTRA_APP_ORIGINS: z
    .string()
    .optional()
    .default("http://127.0.0.1:8090,http://tauri.localhost,https://tauri.localhost,tauri://localhost"),
  API_PUBLIC_URL: z.string().url().default("http://localhost:4020"),
  API_VERSION: z.string().min(1).default(process.env.npm_package_version ?? "0.2.26"),
  DESKTOP_MIN_VERSION: z.string().min(1).default("0.1.0"),
  DESKTOP_LATEST_VERSION: z.string().min(1).default("0.2.26"),
  DESKTOP_UPDATE_ENDPOINT: z
    .string()
    .url()
    .default("https://github.com/Hand-xieyicheng/hand-tododesk/releases/latest/download/latest.json"),
  UPLOAD_STORAGE_DIR: z.string().min(1).default(path.resolve(os.homedir(), ".tododesk", "uploads")),
  FEATURE_FLAGS_JSON: z.string().optional().default(""),
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  DB_NAME: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(3600),
  REFRESH_TOKEN_TTL_HOURS: z.coerce.number().int().min(1).optional(),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).optional(),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  SMTP_FROM: z.string().default("小柴记 <noreply@tododesk.local>")
});

const parsedConfig = envSchema.parse(process.env);

export const config = {
  ...parsedConfig,
  UPLOAD_STORAGE_DIR: path.resolve(parsedConfig.UPLOAD_STORAGE_DIR),
  REFRESH_TOKEN_TTL_HOURS: parsedConfig.REFRESH_TOKEN_TTL_HOURS ?? (parsedConfig.REFRESH_TOKEN_TTL_DAYS ? parsedConfig.REFRESH_TOKEN_TTL_DAYS * 24 : 24)
};

export const appOrigins = [
  config.APP_ORIGIN,
  ...config.EXTRA_APP_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
];
