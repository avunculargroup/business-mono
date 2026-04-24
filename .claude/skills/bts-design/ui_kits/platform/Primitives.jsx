// UI primitives for the BTS platform kit.
// All components export to window so they can be shared across <script type="text/babel"> files.

const { useState } = React;

// ── Icon helper (inline Lucide-style SVGs; stroke 1.5 per design brief) ──
function Icon({ name, size = 18, color = 'currentColor' }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>,
    bot: <><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    check: <><polyline points="20 6 9 17 4 12"/></>,
    folder: <><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>,
    activity: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
    bookmark: <><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.36.15.68.37.94.65.26.28.46.62.57 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    chevronRight: <><polyline points="9 18 15 12 9 6"/></>,
    more: <><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></>,
    inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></>,
    mail: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
    phone: <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
      {paths[name] || <circle cx="12" cy="12" r="9"/>}
    </svg>
  );
}

// ── Button ──
function Button({ variant = 'primary', size = 'md', children, onClick, ...rest }) {
  const h = { sm: 28, md: 36, lg: 40 }[size];
  const base = {
    fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: size === 'sm' ? 13 : 14,
    height: h, padding: `0 ${size === 'sm' ? 12 : 18}px`, borderRadius: 8,
    border: '1px solid transparent', cursor: 'pointer', transition: 'background 120ms ease, transform 100ms ease',
    display: 'inline-flex', alignItems: 'center', gap: 8,
  };
  const variants = {
    primary:     { background: 'var(--color-accent)', color: 'var(--color-text-primary)' },
    secondary:   { background: 'var(--color-surface)', color: 'var(--color-text-primary)', borderColor: 'var(--color-border)' },
    ghost:       { background: 'transparent', color: 'var(--color-text-primary)' },
    destructive: { background: 'var(--color-destructive)', color: '#fff' },
  };
  return <button {...rest} onClick={onClick} style={{...base, ...variants[variant]}}>{children}</button>;
}

// ── Card ──
function Card({ children, interactive, style, ...rest }) {
  return (
    <div {...rest} style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 12, padding: 20, boxShadow: 'var(--shadow-sm)',
      transition: interactive ? 'transform 200ms ease, box-shadow 200ms ease' : undefined,
      cursor: interactive ? 'pointer' : undefined,
      ...style,
    }}>{children}</div>
  );
}

// ── Input ──
function Input({ label, help, error, value, onChange, ...rest }) {
  const [focus, setFocus] = useState(false);
  const borderColor = error ? 'var(--color-destructive)' : (focus ? 'var(--color-accent)' : 'var(--color-border)');
  return (
    <label style={{display:'flex', flexDirection:'column', gap:4}}>
      {label && <span style={{fontSize:13, fontWeight:500, color:'var(--color-text-primary)'}}>{label}</span>}
      <input value={value || ''} onChange={onChange} {...rest}
        onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)}
        style={{
          height:36, padding:'0 12px', border:`1px solid ${borderColor}`, borderRadius:6,
          background:'var(--color-surface)', fontFamily:'var(--font-body)', fontSize:15,
          color:'var(--color-text-primary)', outline:'none',
          boxShadow: focus ? '0 0 0 3px rgba(201,168,76,0.12)' : 'none',
        }}/>
      {help && <span style={{fontSize:12, color: error ? 'var(--color-destructive)' : 'var(--color-text-secondary)'}}>{help}</span>}
    </label>
  );
}

// ── Stage chip ──
function StageChip({ stage }) {
  const styles = {
    lead:    { bg: 'var(--color-surface-subtle)', fg: 'var(--color-text-secondary)' },
    warm:    { bg: '#FEF3C7', fg: '#92400E' },
    active:  { bg: 'var(--color-accent-light)', fg: 'var(--color-accent-dark)' },
    client:  { bg: '#E8F4EE', fg: '#1E5C3F' },
    dormant: { bg: 'var(--color-surface-subtle)', fg: 'var(--color-text-tertiary)' },
  }[stage] || { bg: 'var(--color-surface-subtle)', fg: 'var(--color-text-secondary)' };
  return <span style={{
    display:'inline-block', background: styles.bg, color: styles.fg,
    fontFamily:'var(--font-body)', fontSize:12, fontWeight:500,
    padding:'2px 6px', borderRadius:4,
  }}>{stage}</span>;
}

// ── Empty state ──
function EmptyState({ icon = 'inbox', heading, sub, cta }) {
  return (
    <div style={{textAlign:'center', padding:'48px 24px', color:'var(--color-text-secondary)'}}>
      <div style={{display:'inline-flex', color:'var(--color-text-tertiary)', marginBottom:16}}>
        <Icon name={icon} size={48}/>
      </div>
      <h3 style={{fontFamily:'var(--font-display)', fontSize:20, fontWeight:600, color:'var(--color-text-primary)', marginBottom:6}}>{heading}</h3>
      {sub && <p style={{fontSize:14, maxWidth:360, margin:'0 auto 16px'}}>{sub}</p>}
      {cta}
    </div>
  );
}

// ── Stage badge for agents ──
function AgentBadge({ name }) {
  return <span style={{
    display:'inline-block', background:'var(--color-accent-light)', color:'var(--color-accent-dark)',
    fontFamily:'var(--font-body)', fontSize:12, fontWeight:600,
    padding:'2px 10px', borderRadius:10,
  }}>{name}</span>;
}

Object.assign(window, { Icon, Button, Card, Input, StageChip, EmptyState, AgentBadge });
