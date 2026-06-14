import type { UserGender } from "@todo/shared";
import { config } from "../config.js";
import { asDate, type DbRow } from "../db.js";

export type UserRow = DbRow & {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  gender: UserGender | null;
  avatarPath: string | null;
  emailVerifiedAt: Date | string | null;
};

export function avatarUrl(avatarPath: string | null | undefined) {
  if (!avatarPath) {
    return null;
  }
  return `${config.API_PUBLIC_URL.replace(/\/$/, "")}/avatar/${encodeURIComponent(avatarPath)}`;
}

export function publicUser(user: {
  id: string;
  email: string;
  name: string | null;
  gender?: UserGender | string | null;
  avatarPath?: string | null;
  emailVerifiedAt: Date | string | null;
}) {
  const verifiedAt = asDate(user.emailVerifiedAt);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    gender: (user.gender ?? "PRIVATE") as UserGender,
    avatarUrl: avatarUrl(user.avatarPath),
    emailVerifiedAt: verifiedAt?.toISOString() ?? null
  };
}
