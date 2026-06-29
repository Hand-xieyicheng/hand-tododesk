import type { ApiMemo, ApiMemoListItem } from "@todo/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoStore } from "./memoStore";

const memoListItem: ApiMemoListItem = {
  id: "memo-1",
  title: "测试备忘录",
  excerpt: "富文本摘要",
  isPinned: false,
  archivedAt: null,
  createdAt: "2026-06-17T08:00:00.000Z",
  updatedAt: "2026-06-17T08:00:00.000Z"
};

const memoDetail: ApiMemo = {
  ...memoListItem,
  contentHtml: "<p>正文</p>",
  assets: []
};

function memoWith(patch: Partial<ApiMemo>): ApiMemo {
  return {
    ...memoDetail,
    ...patch,
    assets: patch.assets ?? memoDetail.assets
  };
}

const apiMock = {
  createMemo: vi.fn(),
  deleteMemo: vi.fn(),
  memo: vi.fn(),
  memos: vi.fn(),
  updateMemo: vi.fn()
};

describe("MemoStore", () => {
  let store: MemoStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new MemoStore(apiMock);
    apiMock.memos.mockResolvedValue({ memos: [memoListItem] });
    apiMock.memo.mockResolvedValue({ memo: memoDetail });
  });

  it("hydrates the list and selects the first memo detail", async () => {
    await store.refreshList();

    expect(apiMock.memos).toHaveBeenCalledWith("", false);
    expect(apiMock.memo).toHaveBeenCalledWith("memo-1");
    expect(store.memos).toEqual([memoListItem]);
    expect(store.selectedMemoId).toBe("memo-1");
    expect(store.selectedMemo).toEqual(memoDetail);
  });

  it("loads and selects a memo detail by id", async () => {
    const secondMemo = memoWith({ id: "memo-2", title: "第二备忘录" });
    apiMock.memo.mockResolvedValueOnce({ memo: secondMemo });

    await store.loadMemo("memo-2");

    expect(store.selectedMemoId).toBe("memo-2");
    expect(store.selectedMemo).toEqual(secondMemo);
    expect(store.memoById.get("memo-2")).toEqual(secondMemo);
  });

  it("upserts synced memos and keeps pinned then updated ordering", () => {
    store.applySyncedMemo(memoWith({
      id: "memo-older",
      title: "旧备忘录",
      updatedAt: "2026-06-17T08:00:00.000Z"
    }));
    store.applySyncedMemo(memoWith({
      id: "memo-newer",
      title: "新备忘录",
      updatedAt: "2026-06-17T09:00:00.000Z"
    }));
    store.applySyncedMemo(memoWith({
      id: "memo-pinned",
      title: "置顶备忘录",
      isPinned: true,
      updatedAt: "2026-06-17T07:00:00.000Z"
    }));

    expect(store.memos.map((memo) => memo.id)).toEqual(["memo-pinned", "memo-newer", "memo-older"]);
  });

  it("keeps synced archived memos only when the archived filter is active", () => {
    const archivedMemo = memoWith({
      id: "memo-archived",
      archivedAt: "2026-06-17T10:00:00.000Z"
    });

    store.applySyncedMemo(archivedMemo);
    expect(store.memos.some((memo) => memo.id === "memo-archived")).toBe(false);

    store.setShowArchived(true);
    store.applySyncedMemo(archivedMemo);
    expect(store.memos.map((memo) => memo.id)).toEqual(["memo-archived"]);
  });

  it("removes deleted memos from list, detail cache, and selection", () => {
    store.applySyncedMemo(memoDetail);
    store.setSelectedMemoId("memo-1");

    store.removeSyncedMemo("memo-1");

    expect(store.memos).toEqual([]);
    expect(store.memoById.has("memo-1")).toBe(false);
    expect(store.selectedMemoId).toBeNull();
    expect(store.selectedMemo).toBeNull();
  });
});
