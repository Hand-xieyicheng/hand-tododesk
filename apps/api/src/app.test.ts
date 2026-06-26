import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("app CORS preflight", () => {
  it("allows private network preflight requests from the desktop app origin", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "OPTIONS",
      url: "/tasks/task-1",
      headers: {
        origin: "http://localhost:8090",
        "access-control-request-method": "PATCH",
        "access-control-request-headers": "content-type,authorization",
        "access-control-request-private-network": "true"
      }
    });
    await app.close();

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:8090");
    expect(response.headers["access-control-allow-private-network"]).toBe("true");
  });
});
