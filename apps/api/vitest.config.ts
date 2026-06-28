import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      API_PUBLIC_URL: "http://localhost:4020",
      APP_ORIGIN: "http://localhost:8090",
      DATABASE_URL: "mysql://test:test@127.0.0.1:3306/tododesk_test",
      JWT_SECRET: "tododesk-test-jwt-secret",
      NODE_ENV: "test"
    },
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});
