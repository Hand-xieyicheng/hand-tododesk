import type { HabitIcon } from "@todo/shared";
import { Smile, icons, type LucideIcon } from "lucide-react";

const lucideIconMap = icons as unknown as Record<string, LucideIcon>;

const preferredIconOrder = [
  "Smile",
  "BookOpen",
  "Footprints",
  "Droplets",
  "Dumbbell",
  "Moon",
  "Book",
  "Coffee",
  "Music",
  "PenLine",
  "Heart",
  "Apple",
  "Bike",
  "Sparkles",
  "Code"
];

export const allHabitIconNames = Object.keys(lucideIconMap).sort((left, right) => left.localeCompare(right));
export const presetHabitIconOptions = preferredIconOrder.filter((icon) => icon in lucideIconMap);
export const habitIconOptions = [
  ...presetHabitIconOptions,
  ...allHabitIconNames.filter((icon) => !preferredIconOrder.includes(icon))
];

function kebabToPascal(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function iconSearchText(icon: string) {
  return icon.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
}

export function normalizeHabitIconName(icon: string): HabitIcon {
  if (icon in lucideIconMap) {
    return icon;
  }

  const pascalIcon = kebabToPascal(icon);
  return pascalIcon in lucideIconMap ? pascalIcon : "Smile";
}

export function getHabitIcon(icon: string) {
  return lucideIconMap[normalizeHabitIconName(icon)] ?? Smile;
}
