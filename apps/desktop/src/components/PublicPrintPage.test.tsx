import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicPrintPage } from "./PublicPrintPage";

describe("PublicPrintPage", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.spyOn(document, "open").mockImplementation(() => window);
    vi.spyOn(document, "write").mockImplementation(() => undefined);
    vi.spyOn(document, "close").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it("loads public print html through the frontend API proxy and writes it into the current page", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "<!doctype html><html><body>打印内容</body></html>"
    } as Response);

    render(<PublicPrintPage token="abc_123-token" />);

    expect(screen.getByRole("status")).toHaveTextContent("正在加载打印页面");

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/print/abc_123-token", expect.objectContaining({
        credentials: "omit"
      }));
      expect(document.write).toHaveBeenCalledWith("<!doctype html><html><body>打印内容</body></html>");
      expect(document.close).toHaveBeenCalled();
    });
  });

  it("shows a plain failure state when the public print page cannot be loaded", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 410,
      text: async () => "gone"
    } as Response);

    render(<PublicPrintPage token="expired-token" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("打印链接不可用");
    expect(document.write).not.toHaveBeenCalled();
  });
});
