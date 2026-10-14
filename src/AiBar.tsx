import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Session } from "./session";

export function AiBar({ session, onClose }: { session: Session; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<boolean>("has_api_key")
      .then(setHasKey)
      .catch(() => setHasKey(false));
  }, []);

  useEffect(() => {
    input.current?.focus();
  }, [hasKey, busy]);

  async function submit() {
    const value = text.trim();
    if (!value || busy || hasKey === null) return;
    setBusy(true);
    setError(null);
    try {
      if (!hasKey) {
        await invoke("set_api_key", { key: value });
        setHasKey(true);
        setText("");
      } else {
        const command = await invoke<string>("suggest_command", {
          req: { prompt: value, ...session.aiContext() },
        });
        onClose();
        session.insertCommand(command);
        return;
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const askingKey = hasKey === false;
  return (
    <div className="ai-bar" onClick={(e) => e.stopPropagation()}>
      <span className="ai-label">{askingKey ? "chave" : "IA"}</span>
      <input
        ref={input}
        type={askingKey ? "password" : "text"}
        value={text}
        disabled={busy}
        spellCheck={false}
        autoComplete="off"
        placeholder={askingKey ? "cole sua ANTHROPIC_API_KEY (sk-ant-...)" : "descreva o que você quer fazer"}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <span className={`ai-hint${error ? " error" : ""}`}>
        {busy
          ? "pensando…"
          : (error ??
            (askingKey ? "Enter guarda no Credential Manager" : "Enter sugere · Esc fecha"))}
      </span>
    </div>
  );
}
