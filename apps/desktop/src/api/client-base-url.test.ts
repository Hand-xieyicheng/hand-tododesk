import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => {
    throw new Error("Tauri is unavailable in this test");
  })
}));

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

describe("api client base URL", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses the configured production API URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { tasks: [] }));
    vi.stubEnv("VITE_API_BASE_URL", "http://101.132.96.141/api/");
    vi.stubGlobal("fetch", fetchMock);

    const { api } = await import("./client");
    await expect(api.tasks()).resolves.toEqual({ tasks: [] });

    expect(fetchMock).toHaveBeenCalledWith("http://101.132.96.141/api/tasks", expect.objectContaining({
      headers: expect.any(Headers)
    }));
  });

  it("uses the Vite same-origin proxy in desktop dev mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { tasks: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const { api } = await import("./client");
    await expect(api.tasks()).resolves.toEqual({ tasks: [] });

    expect(fetchMock).toHaveBeenCalledWith("/api/tasks", expect.objectContaining({
      headers: expect.any(Headers)
    }));
  });
});
