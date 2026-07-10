import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiAiMessage, ApiAiProposal, ApiAiSession } from "@todo/shared";
import { api } from "../../api/client";

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "AI 助手请求失败，请稍后重试";
}

export function useAiAssistant(active = true) {
  const [sessions, setSessions] = useState<ApiAiSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ApiAiMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const sessionRequestId = useRef(0);
  const initialized = useRef(false);
  const sendingRef = useRef(false);

  const loadMessages = useCallback(async (sessionId: string) => {
    const currentRequest = sessionRequestId.current + 1;
    sessionRequestId.current = currentRequest;
    setLoading(true);
    setError("");
    try {
      const result = await api.aiMessages(sessionId);
      if (sessionRequestId.current === currentRequest) {
        setMessages(result.messages);
      }
    } catch (caught) {
      if (sessionRequestId.current === currentRequest) {
        setError(errorMessage(caught));
      }
    } finally {
      if (sessionRequestId.current === currentRequest) {
        setLoading(false);
      }
    }
  }, []);

  const selectSession = useCallback(async (sessionId: string) => {
    setActiveSessionId(sessionId);
    await loadMessages(sessionId);
  }, [loadMessages]);

  const createSession = useCallback(async () => {
    setError("");
    try {
      const result = await api.createAiSession();
      setSessions((current) => [
        result.session,
        ...current.filter((item) => item.id !== result.session.id)
      ]);
      setActiveSessionId(result.session.id);
      await loadMessages(result.session.id);
      return result.session;
    } catch (caught) {
      setError(errorMessage(caught));
      return null;
    }
  }, [loadMessages]);

  const reloadSessions = useCallback(async () => {
    const result = await api.aiSessions();
    setSessions(result.sessions);
    return result.sessions;
  }, []);

  const initialize = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const existing = await reloadSessions();
      if (existing.length === 0) {
        await createSession();
        return;
      }
      setActiveSessionId(existing[0]?.id ?? null);
      if (existing[0]) {
        await loadMessages(existing[0].id);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [createSession, loadMessages, reloadSessions]);

  useEffect(() => {
    if (!active || initialized.current) {
      return;
    }
    initialized.current = true;
    void initialize();
  }, [active, initialize]);

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    if (!title.trim()) {
      return;
    }
    setError("");
    try {
      const result = await api.renameAiSession(sessionId, { title: title.trim() });
      setSessions((current) => current.map((item) => (
        item.id === sessionId ? result.session : item
      )));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    setError("");
    try {
      await api.deleteAiSession(sessionId);
      const remaining = sessions.filter((item) => item.id !== sessionId);
      setSessions(remaining);
      if (activeSessionId !== sessionId) {
        return;
      }
      const next = remaining[0];
      if (next) {
        await selectSession(next.id);
      } else {
        await createSession();
      }
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [activeSessionId, createSession, selectSession, sessions]);

  const send = useCallback(async (content: string) => {
    const trimmed = content.trim();
    if (!activeSessionId || sendingRef.current || !trimmed) {
      return;
    }
    const sessionId = activeSessionId;
    const optimisticId = `pending-${crypto.randomUUID()}`;
    const optimisticMessage: ApiAiMessage = {
      id: optimisticId,
      sessionId,
      role: "USER",
      kind: "TEXT",
      content: trimmed,
      metadata: null,
      createdAt: new Date().toISOString()
    };
    sendingRef.current = true;
    setSending(true);
    setError("");
    setMessages((current) => [...current, optimisticMessage]);
    try {
      const result = await api.sendAiMessage(sessionId, {
        content: trimmed
      });
      setMessages((current) => [
        ...current.map((message) => (
          message.id === optimisticId ? result.userMessage : message
        )),
        result.assistantMessage
      ]);
      await reloadSessions();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [activeSessionId, reloadSessions]);

  const replaceProposal = useCallback((messageId: string, proposal: ApiAiProposal) => {
    setMessages((current) => current.map((message) => (
      message.id === messageId
        ? { ...message, metadata: { ...(message.metadata ?? {}), proposal } }
        : message
    )));
  }, []);

  return {
    sessions,
    activeSessionId,
    messages,
    loading,
    sending,
    error,
    send,
    reloadSessions,
    selectSession,
    createSession,
    renameSession,
    deleteSession,
    replaceProposal,
    setMessages
  };
}
