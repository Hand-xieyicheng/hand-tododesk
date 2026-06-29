import type { ApiMemo, ApiMemoListItem, CreateMemoRequest, UpdateMemoRequest } from "@todo/shared";
import { makeAutoObservable, observable, runInAction } from "mobx";
import { api } from "../api/client";

type MemoApiClient = Pick<typeof api, "createMemo" | "deleteMemo" | "memo" | "memos" | "updateMemo">;

function memoToListItem(memo: ApiMemo): ApiMemoListItem {
  return {
    id: memo.id,
    title: memo.title,
    excerpt: memo.excerpt,
    isPinned: memo.isPinned,
    archivedAt: memo.archivedAt,
    createdAt: memo.createdAt,
    updatedAt: memo.updatedAt
  };
}

function sortMemoListItems(items: ApiMemoListItem[]) {
  return [...items].sort((a, b) => (
    Number(b.isPinned) - Number(a.isPinned) ||
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() ||
    a.id.localeCompare(b.id)
  ));
}

export class MemoStore {
  readonly client: MemoApiClient;
  detailLoading = false;
  loading = false;
  memoById = observable.map<string, ApiMemo>();
  memos: ApiMemoListItem[] = [];
  message = "";
  search = "";
  selectedMemoId: string | null = null;
  showArchived = false;

  constructor(client: MemoApiClient = api) {
    this.client = client;
    makeAutoObservable(this, { client: false }, { autoBind: true });
  }

  get selectedMemo() {
    return this.selectedMemoId ? this.memoById.get(this.selectedMemoId) ?? null : null;
  }

  reset() {
    this.detailLoading = false;
    this.loading = false;
    this.memoById.clear();
    this.memos = [];
    this.message = "";
    this.search = "";
    this.selectedMemoId = null;
    this.showArchived = false;
  }

  setSearch(search: string) {
    this.search = search;
  }

  setShowArchived(showArchived: boolean) {
    this.showArchived = showArchived;
  }

  setSelectedMemoId(memoId: string | null) {
    this.selectedMemoId = memoId;
  }

  setMessage(message: string) {
    this.message = message;
  }

  clearSelectedMemo() {
    this.selectedMemoId = null;
  }

  async refreshList(preferredId = this.selectedMemoId) {
    this.loading = true;
    this.message = "";
    try {
      const payload = await this.client.memos(this.search, this.showArchived);
      const nextId = preferredId && payload.memos.some((memo) => memo.id === preferredId)
        ? preferredId
        : payload.memos[0]?.id ?? null;

      runInAction(() => {
        this.memos = sortMemoListItems(payload.memos);
        this.selectedMemoId = nextId;
        if (!nextId) {
          this.clearSelectedMemo();
        }
      });

      if (nextId && !this.memoById.has(nextId)) {
        await this.loadMemo(nextId);
      }
    } catch (error) {
      runInAction(() => {
        this.message = error instanceof Error ? error.message : "备忘录列表加载失败";
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async loadMemo(id: string) {
    this.detailLoading = true;
    this.message = "";
    try {
      const payload = await this.client.memo(id);
      runInAction(() => {
        this.applySyncedMemo(payload.memo);
        this.selectedMemoId = payload.memo.id;
      });
      return payload.memo;
    } catch (error) {
      runInAction(() => {
        this.message = error instanceof Error ? error.message : "备忘录加载失败";
      });
      return null;
    } finally {
      runInAction(() => {
        this.detailLoading = false;
      });
    }
  }

  async createMemo(input: CreateMemoRequest = {}) {
    const payload = await this.client.createMemo(input);
    runInAction(() => {
      this.showArchived = false;
      this.applySyncedMemo(payload.memo);
      this.selectedMemoId = payload.memo.id;
    });
    return payload.memo;
  }

  async updateMemo(id: string, input: UpdateMemoRequest, localPatch: Partial<Pick<ApiMemo, "contentHtml" | "isPinned" | "title">> = {}) {
    const payload = await this.client.updateMemo(id, input);
    const memo = { ...payload.memo, ...localPatch };
    runInAction(() => {
      this.applySyncedMemo(memo);
    });
    return memo;
  }

  async deleteMemo(id: string) {
    await this.client.deleteMemo(id);
    runInAction(() => {
      this.removeSyncedMemo(id);
    });
  }

  applySyncedMemo(memo: ApiMemo) {
    this.memoById.set(memo.id, memo);

    const shouldShow = this.showArchived ? Boolean(memo.archivedAt) : !memo.archivedAt;
    if (!shouldShow) {
      this.memos = this.memos.filter((item) => item.id !== memo.id);
      return;
    }

    const listItem = memoToListItem(memo);
    const exists = this.memos.some((item) => item.id === memo.id);
    const nextMemos = exists
      ? this.memos.map((item) => item.id === memo.id ? listItem : item)
      : [...this.memos, listItem];
    this.memos = sortMemoListItems(nextMemos);
  }

  removeSyncedMemo(memoId: string) {
    this.memos = this.memos.filter((memo) => memo.id !== memoId);
    this.memoById.delete(memoId);
    if (this.selectedMemoId === memoId) {
      this.selectedMemoId = null;
    }
  }
}

export const memoStore = new MemoStore();
