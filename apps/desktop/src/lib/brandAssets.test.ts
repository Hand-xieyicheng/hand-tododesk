import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function sha256(relativePath: string) {
  return createHash("sha256").update(readFileSync(resolve(appRoot, relativePath))).digest("hex");
}

const expectedBrandAssetHashes = [
  ["src/assets/tododesk-logo.png", "2053053debb424360f9df1aaeb4081298f1e10da566c6643f6d28cc79ba46a8f"],
  ["public/favicon.png", "2d625e5e571a8aa7eec38f378bc5923d97f2dbb2afae03f39cf4675740777228"],
  ["public/favicon.ico", "10206d2ffda085503061a8fbc5206ff937b476590bccc52985534d9243b99172"],
  ["src-tauri/icons/app-icon-source.png", "0950afd5dd2736967c024446f43dfee852b684dc616e128473b62281e93802b0"],
  ["src-tauri/icons/icon.png", "2d625e5e571a8aa7eec38f378bc5923d97f2dbb2afae03f39cf4675740777228"],
  ["src-tauri/icons/32x32.png", "4a8c3753d64759cfc1ccb0cfc72a70cc3c3facb877f7a0661405821d78e4fce9"],
  ["src-tauri/icons/128x128.png", "ef27c8f98c7702909be5ae7839ece5c5977ccad361afb390bd8dacce762ee4d7"],
  ["src-tauri/icons/128x128@2x.png", "9a28476014cc63c92e62f4d391dbbf816586655e8c53f62b1a89e723778c78c6"],
  ["src-tauri/icons/icon.ico", "10206d2ffda085503061a8fbc5206ff937b476590bccc52985534d9243b99172"]
] as const;

function paethPredictor(left: number, above: number, upperLeft: number) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);

  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left;
  }

  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function pngAlphaAt(relativePath: string, x: number, y: number) {
  const file = readFileSync(resolve(appRoot, relativePath));
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.subarray(offset + 4, offset + 8).toString("ascii");
    const data = file.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect(data.readUInt8(8)).toBe(8);
      colorType = data.readUInt8(9);
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }

    offset += length + 12;
  }

  expect(colorType).toBe(6);
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const pixels = Buffer.alloc(stride * height);

  let inputOffset = 0;
  for (let row = 0; row < height; row += 1) {
    const filterType = inflated.readUInt8(inputOffset);
    inputOffset += 1;
    const outputRow = row * stride;
    const previousRow = outputRow - stride;

    for (let column = 0; column < stride; column += 1) {
      const raw = inflated.readUInt8(inputOffset + column);
      const left = column >= bytesPerPixel ? pixels.readUInt8(outputRow + column - bytesPerPixel) : 0;
      const above = row > 0 ? pixels.readUInt8(previousRow + column) : 0;
      const upperLeft = row > 0 && column >= bytesPerPixel ? pixels.readUInt8(previousRow + column - bytesPerPixel) : 0;

      const value =
        filterType === 0 ? raw :
        filterType === 1 ? (raw + left) & 0xff :
        filterType === 2 ? (raw + above) & 0xff :
        filterType === 3 ? (raw + Math.floor((left + above) / 2)) & 0xff :
        filterType === 4 ? (raw + paethPredictor(left, above, upperLeft)) & 0xff :
        raw;
      pixels.writeUInt8(value, outputRow + column);
    }

    inputOffset += stride;
  }

  return pixels.readUInt8((y * width + x) * bytesPerPixel + 3);
}

describe("brand assets", () => {
  it.each(expectedBrandAssetHashes)("%s matches the approved transparent mascot artwork", (relativePath, expectedHash) => {
    expect(sha256(relativePath)).toBe(expectedHash);
  });

  it("keeps the main brand logo transparent outside the mascot", () => {
    expect(pngAlphaAt("src/assets/tododesk-logo.png", 0, 0)).toBe(0);
    expect(pngAlphaAt("src/assets/tododesk-logo.png", 1253, 0)).toBe(0);
    expect(pngAlphaAt("src/assets/tododesk-logo.png", 0, 1253)).toBe(0);
    expect(pngAlphaAt("src/assets/tododesk-logo.png", 1253, 1253)).toBe(0);
    expect(pngAlphaAt("src/assets/tododesk-logo.png", 627, 627)).toBeGreaterThan(240);
  });

  it("keeps the macOS app icon as a generated ICNS bundle", () => {
    const iconPath = resolve(appRoot, "src-tauri/icons/icon.icns");

    expect(readFileSync(iconPath).subarray(0, 4).toString("ascii")).toBe("icns");
    expect(statSync(iconPath).size).toBeGreaterThan(100_000);
  });
});
