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
  ["src/assets/tododesk-logo.png", "a8608437e3baacf51f652acf5ed9e4e2cdc5dc7acae0c7152ea8239b1e7997c8"],
  ["public/favicon.png", "ccfc67519db6dd70a886ebe6415caf3dcb5c10333709993b3df053b81bf1f3b9"],
  ["public/favicon.ico", "24d5da944f2d0cd0f2d206092e258d3fa34300391c9795ed02e2579a5d0c4ae9"],
  ["src-tauri/icons/app-icon-source.png", "83e2d196f120e23bcf5cedf375447fb25713fad912bc542e0f06c571864e53fb"],
  ["src-tauri/icons/icon.png", "ccfc67519db6dd70a886ebe6415caf3dcb5c10333709993b3df053b81bf1f3b9"],
  ["src-tauri/icons/32x32.png", "a258912f4ef240a0b118a1e3995b893a6964ac7390f25ade445a07a56398629c"],
  ["src-tauri/icons/128x128.png", "a4d45833d6ba3a6da1b12ac26b2d78c526c790189aeb6fae2da2b214f46694c1"],
  ["src-tauri/icons/128x128@2x.png", "3c4217234a9495e6a12bfa35dd4ab9e5676a3d2fab2aba7b730abf0c73e8f854"],
  ["src-tauri/icons/icon.ico", "24d5da944f2d0cd0f2d206092e258d3fa34300391c9795ed02e2579a5d0c4ae9"]
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

function readPngRgba(relativePath: string) {
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

  return { width, height, pixels };
}

function pngAlphaAt(relativePath: string, x: number, y: number) {
  const { width, pixels } = readPngRgba(relativePath);

  return pixels.readUInt8((y * width + x) * 4 + 3);
}

function pngAlphaBounds(relativePath: string) {
  const { width, height, pixels } = readPngRgba(relativePath);
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels.readUInt8((y * width + x) * 4 + 3);
      if (alpha === 0) {
        continue;
      }

      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }

  expect(right).toBeGreaterThanOrEqual(0);

  return {
    width,
    height,
    contentWidth: right - left,
    contentHeight: bottom - top
  };
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

  it("scales the brand artwork to roughly 90% of its transparent canvas", () => {
    const scaledAssetPaths = [
      "src/assets/tododesk-logo.png",
      "src-tauri/icons/app-icon-source.png",
      "src-tauri/icons/icon.png"
    ];

    for (const relativePath of scaledAssetPaths) {
      const bounds = pngAlphaBounds(relativePath);
      const widthCoverage = bounds.contentWidth / bounds.width;
      const heightCoverage = bounds.contentHeight / bounds.height;

      expect(widthCoverage).toBeGreaterThanOrEqual(0.78);
      expect(heightCoverage).toBeGreaterThanOrEqual(0.89);
      expect(heightCoverage).toBeLessThanOrEqual(0.93);
    }
  });

  it("keeps the macOS app icon as a generated ICNS bundle", () => {
    const iconPath = resolve(appRoot, "src-tauri/icons/icon.icns");

    expect(readFileSync(iconPath).subarray(0, 4).toString("ascii")).toBe("icns");
    expect(statSync(iconPath).size).toBeGreaterThan(100_000);
  });
});
