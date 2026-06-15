import { describe, expect, it } from "vitest";
import { clampAvatarOffset, getAvatarSourceRect } from "./avatarCrop";

describe("avatar crop geometry", () => {
  it("keeps a wide image centered at default zoom", () => {
    expect(getAvatarSourceRect({ width: 800, height: 400 }, { zoom: 1, offsetX: 0, offsetY: 0 })).toEqual({
      x: 200,
      y: 0,
      size: 400
    });
  });

  it("clamps offsets so the crop area remains covered", () => {
    expect(clampAvatarOffset({ width: 800, height: 400 }, { zoom: 1, offsetX: 999, offsetY: 999 })).toEqual({
      offsetX: 120,
      offsetY: 0
    });
  });

  it("shrinks the source rect when zoomed in", () => {
    expect(getAvatarSourceRect({ width: 512, height: 512 }, { zoom: 2, offsetX: 0, offsetY: 0 })).toEqual({
      x: 128,
      y: 128,
      size: 256
    });
  });
});
