import { describe, expect, it } from "vitest";
import { defaultAppFeatureFlags } from "@todo/shared";
import { buildApp } from "../app.js";
import { buildAppBootstrap, parseFeatureFlags } from "./app-bootstrap.js";

const baseConfig = {
  API_VERSION: "0.2.6",
  DESKTOP_MIN_VERSION: "0.1.0",
  DESKTOP_LATEST_VERSION: "0.2.6",
  DESKTOP_UPDATE_ENDPOINT: "https://github.com/Hand-xieyicheng/hand-tododesk/releases/latest/download/latest.json",
  FEATURE_FLAGS_JSON: ""
};

describe("app bootstrap", () => {
  it("serves public bootstrap metadata without authentication", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/app/bootstrap"
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      releaseChannel: "stable",
      desktop: {
        updateEndpoint: "https://github.com/Hand-xieyicheng/hand-tododesk/releases/latest/download/latest.json"
      },
      featureFlags: defaultAppFeatureFlags
    });
  });

  it("builds bootstrap metadata from version environment values", () => {
    expect(buildAppBootstrap({
      ...baseConfig,
      API_VERSION: "1.4.0",
      DESKTOP_MIN_VERSION: "1.2.0",
      DESKTOP_LATEST_VERSION: "1.5.0"
    })).toMatchObject({
      apiVersion: "1.4.0",
      desktop: {
        minimumVersion: "1.2.0",
        latestVersion: "1.5.0"
      }
    });
  });

  it("merges partial feature flag JSON with defaults", () => {
    expect(parseFeatureFlags(JSON.stringify({
      pomodoro: false,
      floatingCard: false
    }))).toEqual({
      ...defaultAppFeatureFlags,
      pomodoro: false,
      floatingCard: false
    });
  });

  it("falls back to defaults for invalid feature flag JSON", () => {
    expect(parseFeatureFlags("{not-json")).toEqual(defaultAppFeatureFlags);
    expect(parseFeatureFlags(JSON.stringify({ calendar: "yes" }))).toEqual(defaultAppFeatureFlags);
  });
});
