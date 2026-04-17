import { useRef, useState, useCallback } from "react";
import { createTypingIndicator, type TypingIndicatorHandle } from "@zazigv2/shared/src/typing-indicator";

interface JobChatProps {
  jobId: string;
  onSendMessage?: (message: string) => void;
  onTypingChange?: (isTyping: boolean) => void;
}

/**
 * JobChat — chat input for a job conversation.
 * Emits typing indicators while the user types, and clears on submit.
 */
export function JobChat({ jobId, onSendMessage, onTypingChange }: JobChatProps) {
  const [value, setValue] = useState("");
  const indicatorRef = useRef<TypingIndicatorHandle | null>(null);

  const getIndicator = useCallback(() => {
    if (!indicatorRef.current) {
      indicatorRef.current = createTypingIndicator({
        timeoutMs: 5000,
        onExpire: () => {
          onTypingChange?.(false);
        },
      });
    }
    return indicatorRef.current;
  }, [onTypingChange]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    onTypingChange?.(true);
    getIndicator().setTyping();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const message = value.trim();
    if (!message) return;
    // Clear typing indicator immediately on send
    clearTyping();
    setValue("");
    onSendMessage?.(message);
  }

  function clearTyping() {
    indicatorRef.current?.clearTyping();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  }

  return (
    <form onSubmit={handleSubmit} data-job-id={jobId}>
      <textarea
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Message…"
        rows={3}
      />
      <button type="submit" disabled={!value.trim()}>
        Send
      </button>
    </form>
  );
}

export default JobChat;
