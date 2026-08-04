import { useEffect, useRef } from "react";

interface Turn {
  role: "user" | "assistant" | "tool";
  text: string;
}

export function ConversationView({ turns }: { turns: Turn[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Without this, the view stays scrolled wherever it was as new turns arrive —
  // in a growing conversation the latest message (and the orb's current state)
  // can end up below the fold with no indication anything new happened.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  if (turns.length === 0) {
    return (
      <div className="conversation-empty">
        Try: "Open Chrome and search best pizza in Ahmedabad"
      </div>
    );
  }

  return (
    <div className="conversation-view" ref={scrollRef}>
      {turns.map((turn, i) => {
        if (turn.role === "tool") {
          return (
            <div key={i} className="turn-row turn-row-tool">
              <span className="turn-tool">{turn.text}</span>
            </div>
          );
        }
        return (
          <div key={i} className={`turn-row turn-row-${turn.role}`}>
            {turn.role === "assistant" && <span className="turn-avatar turn-avatar-assistant">A</span>}
            <div className={`turn turn-${turn.role}`}>{turn.text}</div>
            {turn.role === "user" && <span className="turn-avatar turn-avatar-user">Y</span>}
          </div>
        );
      })}
    </div>
  );
}
