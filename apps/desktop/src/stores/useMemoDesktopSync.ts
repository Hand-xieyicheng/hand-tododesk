import type { ApiMemo } from "@todo/shared";
import { useEffect } from "react";
import { listenDesktopSyncEvents } from "../lib/desktopSync";
import { memoStore } from "./memoStore";

interface MemoDesktopSyncOptions {
  onMemoDeleted?: (memoId: string) => void;
  onMemoUpserted?: (memo: ApiMemo) => void;
}

export function useMemoDesktopSync({ onMemoDeleted, onMemoUpserted }: MemoDesktopSyncOptions = {}) {
  useEffect(() => listenDesktopSyncEvents((event) => {
    if (event.type === "memo:upserted") {
      memoStore.applySyncedMemo(event.memo);
      onMemoUpserted?.(event.memo);
      return;
    }

    if (event.type === "memo:deleted") {
      memoStore.removeSyncedMemo(event.memoId);
      onMemoDeleted?.(event.memoId);
    }
  }), [onMemoDeleted, onMemoUpserted]);
}
