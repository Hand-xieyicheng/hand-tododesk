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
  APP_ORIGIN: z.string().url().default("http://localhost:5173"),
  EXTRA_APP_ORIGINS: z
    .string()
    .optional()
    .default("http://127.0.0.1:5173,http://tauri.localhost,https://tauri.localhost,tauri://localhost"),
  API_PUBLIC_URL: z.string().url().default("http://localhost:4020"),
  API_VERSION: z.string().min(1).default(process.env.npm_package_version ?? "0.2.0"),
  DESKTOP_MIN_VERSION: z.string().min(1).default("0.1.0"),
  DESKTOP_LATEST_VERSION: z.string().min(1).default("0.2.0"),
  DESKTOP_UPDATE_ENDPOINT: z
    .string()
    .url()
    .default("https://github.com/Hand-xieyicheng/hand-tododesk/releases/latest/download/latest.json"),
  FEATURE_FLAGS_JSON: z.string().optional().default(""),
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  DB_NAME: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  SMTP_FROM: z.string().default("todoDesk <noreply@tododesk.local>")
});

export const config = envSchema.parse(process.env);

export const appOrigins = [
  config.APP_ORIGIN,
  ...config.EXTRA_APP_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
];
