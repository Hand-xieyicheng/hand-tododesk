import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

export function createOpaqueToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function signAccessToken(payload: AccessTokenPayload) {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.ACCESS_TOKEN_TTL_SECONDS,
    audience: "tododesk",
    issuer: "tododesk-api"
  });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, config.JWT_SECRET, {
    audience: "tododesk",
    issuer: "tododesk-api"
  }) as AccessTokenPayload;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addHours(date: Date, hours: number) {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);
  return next;
}

