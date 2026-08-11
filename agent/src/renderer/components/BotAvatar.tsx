// The assistant's avatar in the conversation — a small drawn bot (blinking
// eyes, a glowing antenna tip) instead of a generic letter, so the "AI"
// feels like a specific character rather than a template initial.
export function BotAvatar() {
  return (
    <div className="bot-avatar">
      <svg className="bot-icon" viewBox="0 0 24 24">
        <line x1="12" y1="2" x2="12" y2="5" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
        <circle className="bot-antenna-tip" cx="12" cy="2" />
        <rect className="bot-head" x="4" y="5" width="16" height="13" rx="5" />
        <circle className="bot-eye" cx="9" cy="11.5" />
        <circle className="bot-eye r" cx="15" cy="11.5" />
        <path d="M9 15 q3 1.6 6 0" stroke="currentColor" strokeWidth={1.2} fill="none" strokeLinecap="round" />
        <line x1="2" y1="12" x2="4" y2="12" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
        <line x1="20" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
      </svg>
    </div>
  );
}
