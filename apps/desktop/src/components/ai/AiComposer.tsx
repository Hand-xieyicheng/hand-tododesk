import { useState, type KeyboardEvent } from "react";
import { Send } from "lucide-react";

const suggestions = [
  "我今天有哪些待办？",
  "我今天喝咖啡了",
  "3月12号是我生日"
];

export interface AiComposerProps {
  disabled: boolean;
  sendDisabled?: boolean;
  showSuggestions?: boolean;
  onSend(content: string): Promise<void> | void;
}

export function AiComposer({
  disabled,
  sendDisabled = false,
  showSuggestions = false,
  onSend
}: AiComposerProps) {
  const [draft, setDraft] = useState("");

  function submit() {
    const content = draft.trim();
    if (!content || disabled || sendDisabled) {
      return;
    }
    setDraft("");
    void onSend(content);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    submit();
  }

  return (
    <div className="ai-composer">
      {showSuggestions ? (
        <div aria-label="AI 助手快捷建议" className="ai-composer-suggestions">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setDraft(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
      <div className="ai-composer-input-row">
        <textarea
          aria-label="给 AI 助手发送消息"
          disabled={disabled}
          maxLength={4000}
          placeholder={"输入待办、纪念日或打卡记录…\nEnter 发送 · Shift+Enter 换行"}
          rows={3}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          aria-label="发送消息"
          disabled={disabled || sendDisabled || !draft.trim()}
          type="button"
          onClick={submit}
        >
          <Send aria-hidden="true" size={17} />
        </button>
      </div>
    </div>
  );
}
