import { useDictionary } from "../i18n";

// The empty-conversation state of the main screen — what a user sees before
// ever speaking to Karvix. Condensed to 4 cards (vs. HelpPanel's fuller
// per-tool breakdown behind "What can I ask?") so it reads as a quick-glance
// portal rather than documentation; same icon language as HelpPanel/BotAvatar
// so the two don't feel like separate design systems. Icons are positional
// (index-matched to t.portal.cards, not part of the translated content).
const ICONS = [
  <svg key="apps" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
    <line x1="3.5" y1="9.2" x2="20.5" y2="9.2" />
  </svg>,
  <svg key="media" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3.5a5 5 0 0 0-5 5v3.3L5.3 15h13.4L17 11.8V8.5a5 5 0 0 0-5-5z" />
    <path d="M9.6 18a2.4 2.4 0 0 0 4.8 0" />
  </svg>,
  <svg key="context" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3.2 19 6v5.5c0 4.6-3 7.6-7 8.8-4-1.2-7-4.2-7-8.8V6z" />
  </svg>,
  <svg key="search" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17" />
    <path d="M12 3.5c2.6 2.4 2.6 14.6 0 17M12 3.5c-2.6 2.4-2.6 14.6 0 17" />
  </svg>,
];

export function PortalGrid() {
  const t = useDictionary();
  return (
    <div className="portal-grid">
      {t.portal.cards.map((card, i) => (
        <div key={card.title} className="portal-card">
          <div className="portal-card-head">
            <span className="portal-icon">{ICONS[i]}</span>
            <span className="portal-title">{card.title}</span>
          </div>
          <p className="portal-examples">{card.examples}</p>
          <p className="portal-desc">{card.description}</p>
        </div>
      ))}
    </div>
  );
}
