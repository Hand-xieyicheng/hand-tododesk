export const AVATAR_CROP_SIZE = 240;
export const AVATAR_OUTPUT_SIZE = 512;

export interface AvatarCrop {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export interface AvatarImageSize {
  width: number;
  height: number;
}

export function clampAvatarOffset(image: AvatarImageSize, crop: AvatarCrop, cropSize = AVATAR_CROP_SIZE) {
  const zoom = Math.max(1, crop.zoom);
  const baseScale = Math.max(cropSize / image.width, cropSize / image.height);
  const displayWidth = image.width * baseScale * zoom;
  const displayHeight = image.height * baseScale * zoom;
  const maxOffsetX = Math.max(0, (displayWidth - cropSize) / 2);
  const maxOffsetY = Math.max(0, (displayHeight - cropSize) / 2);

  return {
    offsetX: Math.min(maxOffsetX, Math.max(-maxOffsetX, crop.offsetX)),
    offsetY: Math.min(maxOffsetY, Math.max(-maxOffsetY, crop.offsetY))
  };
}

export function getAvatarLayout(image: AvatarImageSize, crop: AvatarCrop, cropSize = AVATAR_CROP_SIZE) {
  const zoom = Math.max(1, crop.zoom);
  const baseScale = Math.max(cropSize / image.width, cropSize / image.height);
  const displayWidth = image.width * baseScale * zoom;
  const displayHeight = image.height * baseScale * zoom;
  const clamped = clampAvatarOffset(image, crop, cropSize);

  return {
    scale: baseScale * zoom,
    displayWidth,
    displayHeight,
    left: cropSize / 2 + clamped.offsetX - displayWidth / 2,
    top: cropSize / 2 + clamped.offsetY - displayHeight / 2,
    offsetX: clamped.offsetX,
    offsetY: clamped.offsetY
  };
}

export function getAvatarSourceRect(image: AvatarImageSize, crop: AvatarCrop, cropSize = AVATAR_CROP_SIZE) {
  const layout = getAvatarLayout(image, crop, cropSize);
  const sourceSize = cropSize / layout.scale;

  return {
    x: Math.max(0, -layout.left / layout.scale),
    y: Math.max(0, -layout.top / layout.scale),
    size: sourceSize
  };
}

export async function createCroppedAvatarBlob(
  image: HTMLImageElement,
  crop: AvatarCrop,
  outputSize = AVATAR_OUTPUT_SIZE,
  cropSize = AVATAR_CROP_SIZE
) {
  const source = getAvatarSourceRect({ width: image.naturalWidth, height: image.naturalHeight }, crop, cropSize);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is not available");
  }

  context.drawImage(image, source.x, source.y, source.size, source.size, 0, 0, outputSize, outputSize);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Avatar crop failed"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}
