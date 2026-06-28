import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("persistent upload storage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("stores avatars under UPLOAD_STORAGE_DIR instead of the API public directory", async () => {
    const uploadRoot = path.resolve(process.cwd(), ".tmp-upload-storage-test");
    vi.stubEnv("UPLOAD_STORAGE_DIR", uploadRoot);
    vi.resetModules();

    const { avatarDirectory } = await import("./avatar.js");

    expect(avatarDirectory).toBe(path.join(uploadRoot, "avatar"));
    expect(avatarDirectory).not.toContain(`${path.sep}public${path.sep}avatar`);
  });

  it("stores memo assets under UPLOAD_STORAGE_DIR instead of the API public directory", async () => {
    const uploadRoot = path.resolve(process.cwd(), ".tmp-upload-storage-test");
    vi.stubEnv("UPLOAD_STORAGE_DIR", uploadRoot);
    vi.resetModules();

    const { memoAssetDirectory } = await import("./memo-assets.js");

    expect(memoAssetDirectory).toBe(path.join(uploadRoot, "memo-assets"));
    expect(memoAssetDirectory).not.toContain(`${path.sep}public${path.sep}memo-assets`);
  });

  it("copies legacy public avatar files into the persistent storage directory", async () => {
    const uploadRoot = path.resolve(process.cwd(), ".tmp-upload-storage-test");
    const legacyDirectory = path.resolve(process.cwd(), "public/avatar");
    const filename = "user_1-123-550e8400-e29b-41d4-a716-446655440000.png";
    await fs.mkdir(legacyDirectory, { recursive: true });
    await fs.writeFile(path.join(legacyDirectory, filename), "legacy-avatar");
    vi.stubEnv("UPLOAD_STORAGE_DIR", uploadRoot);
    vi.resetModules();

    try {
      const { avatarDirectory, ensureAvatarDirectory } = await import("./avatar.js");
      await ensureAvatarDirectory();

      await expect(fs.readFile(path.join(avatarDirectory, filename), "utf8")).resolves.toBe("legacy-avatar");
    } finally {
      await fs.rm(uploadRoot, { force: true, recursive: true });
      await fs.rm(path.join(legacyDirectory, filename), { force: true });
    }
  });

  it("copies legacy public memo asset files into the persistent storage directory", async () => {
    const uploadRoot = path.resolve(process.cwd(), ".tmp-upload-storage-test");
    const legacyDirectory = path.resolve(process.cwd(), "public/memo-assets");
    const filename = "user_1-memo_1-123-550e8400-e29b-41d4-a716-446655440000.png";
    await fs.mkdir(legacyDirectory, { recursive: true });
    await fs.writeFile(path.join(legacyDirectory, filename), "legacy-memo-asset");
    vi.stubEnv("UPLOAD_STORAGE_DIR", uploadRoot);
    vi.resetModules();

    try {
      const { memoAssetDirectory, ensureMemoAssetDirectory } = await import("./memo-assets.js");
      await ensureMemoAssetDirectory();

      await expect(fs.readFile(path.join(memoAssetDirectory, filename), "utf8")).resolves.toBe("legacy-memo-asset");
    } finally {
      await fs.rm(uploadRoot, { force: true, recursive: true });
      await fs.rm(path.join(legacyDirectory, filename), { force: true });
    }
  });
});
