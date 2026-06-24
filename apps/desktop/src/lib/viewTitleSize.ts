import type { DisplaySize } from "@todo/shared";
import type { TitleSize } from "animal-island-ui";

const viewTitleSizes: Record<DisplaySize, TitleSize> = {
  small: "small",
  default: "small",
  large: "middle"
};

export function getViewTitleSize(displaySize: DisplaySize) {
  return viewTitleSizes[displaySize];
}
