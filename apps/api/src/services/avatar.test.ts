import { describe, expect, it } from "vitest";
import { assertSquareAvatar, avatarExtensionForMime, isSafeAvatarFilename } from "./avatar.js";

function pngHeader(width: number, height: number) {
  const buffer = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = 6;
  return buffer;
}

describe("avatar helpers", () => {
  it("maps supported mime types to file extensions", () => {
    expect(avatarExtensionForMime("image/png")).toBe("png");
    expect(avatarExtensionForMime("image/jpeg")).toBe("jpg");
    expect(avatarExtensionForMime("image/webp")).toBe("webp");
    expect(avatarExtensionForMime("image/gif")).toBeNull();
  });

  it("accepts only generated avatar filenames", () => {
    expect(isSafeAvatarFilename("user_1-123-550e8400-e29b-41d4-a716-446655440000.png")).toBe(true);
    expect(isSafeAvatarFilename("../avatar.png")).toBe(false);
  });

  it("rejects non-square images", () => {
    expect(assertSquareAvatar(pngHeader(4, 4))).toEqual({ width: 4, height: 4 });
    expect(() => assertSquareAvatar(pngHeader(4, 3))).toThrow("Avatar must be square");
  });
});
