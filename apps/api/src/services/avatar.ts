import fs from "node:fs/promises";
import path from "node:path";
import { imageSize } from "image-size";
import { ensureUploadDirectory, legacyPublicUploadDirectory, uploadDirectory } from "./upload-storage.js";

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const avatarDirectory = uploadDirectory("avatar");
const legacyAvatarDirectory = legacyPublicUploadDirectory("avatar");

const avatarExtensions = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp"
} as const;

export function avatarExtensionForMime(mimetype: string) {
  return avatarExtensions[mimetype as keyof typeof avatarExtensions] ?? null;
}

export function createAvatarFilename(userId: string, extension: string) {
  return `${userId}-${Date.now()}-${crypto.randomUUID()}.${extension}`;
}

export function isSafeAvatarFilename(filename: string) {
  return /^[A-Za-z0-9_-]+-\d+-[A-Fa-f0-9-]+\.(png|jpg|webp)$/.test(filename);
}

export function assertSquareAvatar(buffer: Buffer) {
  const dimensions = imageSize(buffer);
  if (!dimensions.width || !dimensions.height) {
    throw new Error("Invalid image");
  }

  if (dimensions.width !== dimensions.height) {
    throw new Error("Avatar must be square");
  }

  return {
    width: dimensions.width,
    height: dimensions.height
  };
}

export async function ensureAvatarDirectory() {
  await ensureUploadDirectory(avatarDirectory, legacyAvatarDirectory);
}

export async function removeAvatarFile(avatarPath: string | null | undefined) {
  if (!avatarPath || !isSafeAvatarFilename(avatarPath)) {
    return;
  }

  await fs.unlink(path.join(avatarDirectory, avatarPath)).catch(() => undefined);
}
