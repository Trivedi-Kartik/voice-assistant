import { BotAvatar } from "./BotAvatar";
import { useDictionary } from "../i18n";

// Small line icons, one per group — same stroke weight/rounding as the bot
// avatar and the orb's own SVG details, so this screen reads as the same
// drawn system rather than a separate style bolted on. Index-matched to
// t.help.groups (Apps, Media & reminders, Web, Privacy-sensitive, Memory, in
// that order) — icons are positional, not part of the translated content.
const ICONS = [
  <svg key="apps" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
    <line x1="3.5" y1="9.2" x2="20.5" y2="9.2" />
  </svg>,
  <svg key="media" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3.5a5 5 0 0 0-5 5v3.3L5.3 15h13.4L17 11.8V8.5a5 5 0 0 0-5-5z" />
    <path d="M9.6 18a2.4 2.4 0 0 0 4.8 0" />
  </svg>,
  <svg key="web" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17" />
    <path d="M12 3.5c2.6 2.4 2.6 14.6 0 17M12 3.5c-2.6 2.4-2.6 14.6 0 17" />
  </svg>,
  <svg key="privacy" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3.2 19 6v5.5c0 4.6-3 7.6-7 8.8-4-1.2-7-4.2-7-8.8V6z" />
  </svg>,
  <svg key="memory" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={0.9}>
    <line x1="6" y1="7" x2="12" y2="14" />
    <line x1="18" y1="9" x2="12" y2="14" />
    <line x1="12" y1="14" x2="9" y2="19" />
    <circle cx="6" cy="7" r={1.7} fill="currentColor" stroke="none" />
    <circle cx="18" cy="9" r={1.7} fill="currentColor" stroke="none" />
    <circle cx="9" cy="19" r={1.7} fill="currentColor" stroke="none" />
  </svg>,
];

export function HelpPanel({ onClose }: { onClose: () => void }) {
  const t = useDictionary();
  return (
    <div className="help-panel">
      <div className="help-hero">
        <BotAvatar size="lg" />
        <h2 className="wordmark">{t.help.heading}</h2>
        <p className="hint help-intro">
          {t.help.introBeforeHotkey}
          <strong>Ctrl+Shift+Space</strong>
          {t.help.introAfterHotkey}
        </p>
      </div>

      <div className="help-groups">
        {t.help.groups.map((group, i) => (
          <section key={group.title} className="help-group">
            <div className="help-group-head">
              <span className="help-group-icon">{ICONS[i]}</span>
              <span className="help-group-title">{group.title}</span>
            </div>
            {group.items.map((item) => (
              <div key={item.examples[0]} className="help-card">
                <div className="help-card-top">
                  <span className="help-examples">{item.examples.join(" · ")}</span>
                  {item.confirms && <span className="confirm-pill">{t.help.confirmsFirst}</span>}
                </div>
                <p className="help-desc">{item.description}</p>
              </div>
            ))}
          </section>
        ))}
      </div>

      <p className="hint">{t.help.footerHint}</p>
      <button className="link-button" onClick={onClose}>
        {t.help.close}
      </button>
    </div>
  );
}
