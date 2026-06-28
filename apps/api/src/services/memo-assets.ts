import fs from "node:fs/promises";
import path from "node:path";
import { imageSize } from "image-size";
import { config } from "../config.js";
import { ensureUploadDirectory, legacyPublicUploadDirectory, uploadDirectory } from "./upload-storage.js";

export const MEMO_ASSET_MAX_BYTES = 10 * 1024 * 1024;
export const memoAssetDirectory = uploadDirectory("memo-assets");
const legacyMemoAssetDirectory = legacyPublicUploadDirectory("memo-assets");

const memoAssetExtensions = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif"
} as const;

export function memoAssetExtensionForMime(mimetype: string) {
  return memoAssetExtensions[mimetype as keyof typeof memoAssetExtensions] ?? null;
}

export function createMemoAssetFilename(userId: string, memoId: string, extension: string) {
  return `${userId}-${memoId}-${Date.now()}-${crypto.randomUUID()}.${extension}`;
}

export function isSafeMemoAssetFilename(filename: string) {
  return /^[A-Za-z0-9_-]+-[A-Za-z0-9_-]+-\d+-[A-Fa-f0-9-]+\.(png|jpg|webp|gif)$/.test(filename);
}

export function memoAssetUrl(filename: string) {
  return `${config.API_PUBLIC_URL.replace(/\/$/, "")}/memo-assets/${encodeURIComponent(filename)}`;
}

export function readMemoImageDimensions(buffer: Buffer, mimetype: string) {
  if (mimetype === "image/gif") {
    return { width: null, height: null };
  }

  const dimensions = imageSize(buffer);
  if (!dimensions.width || !dimensions.height) {
    throw new Error("Invalid image");
  }

  return {
    width: dimensions.width,
    height: dimensions.height
  };
}

export async function ensureMemoAssetDirectory() {
  await ensureUploadDirectory(memoAssetDirectory, legacyMemoAssetDirectory);
}

export async function removeMemoAssetFile(filename: string | null | undefined) {
  if (!filename || !isSafeMemoAssetFilename(filename)) {
    return;
  }

  await fs.unlink(path.join(memoAssetDirectory, filename)).catch(() => undefined);
}
