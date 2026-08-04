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
        <div key={i} className={`turn turn-${turn.role}`}>
          {turn.text}
        </div>
      ))}
    </div>
  );
}
