import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const legacyPublicDirectory = path.resolve(dirname, "../../public");

export function uploadDirectory(name: string) {
  return path.join(config.UPLOAD_STORAGE_DIR, name);
}

export function legacyPublicUploadDirectory(name: string) {
  return path.join(legacyPublicDirectory, name);
}

export async function ensureUploadDirectory(directory: string, legacyDirectory: string) {
  await fs.mkdir(directory, { recursive: true });

  if (path.resolve(directory) === path.resolve(legacyDirectory)) {
    return;
  }

  const entries = await fs.readdir(legacyDirectory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  });

  await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
    const source = path.join(legacyDirectory, entry.name);
    const target = path.join(directory, entry.name);

    await fs.copyFile(source, target, constants.COPYFILE_EXCL).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") {
        throw error;
      }
    });
  }));
}
