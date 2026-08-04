interface Turn {
  role: "user" | "assistant";
  text: string;
}

export function ConversationView({ turns }: { turns: Turn[] }) {
  if (turns.length === 0) {
    return (
      <div className="conversation-empty">
        Try: "Open Chrome and search best pizza in Ahmedabad"
      </div>
    );
  }

  return (
    <div className="conversation-view">
      {turns.map((turn, i) => (
        <div key={i} className={`turn-row turn-row-${turn.role}`}>
          {turn.role === "assistant" && <span className="turn-avatar turn-avatar-assistant">A</span>}
          <div className={`turn turn-${turn.role}`}>{turn.text}</div>
          {turn.role === "user" && <span className="turn-avatar turn-avatar-user">Y</span>}
        </div>
      ))}
    </div>
  );
}
