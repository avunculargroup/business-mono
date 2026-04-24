const { useState: useStateShell } = React;

function Sidebar({ current, onNav, pending = 3 }) {
  const work = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'simon',     label: 'Simon', icon: 'bot', badge: pending },
    { id: 'crm',       label: 'CRM', icon: 'users' },
    { id: 'tasks',     label: 'Tasks', icon: 'check' },
    { id: 'projects',  label: 'Projects', icon: 'folder' },
    { id: 'content',   label: 'Content', icon: 'file' },
  ];
  const system = [
    { id: 'activity', label: 'Agent Activity', icon: 'activity' },
    { id: 'brand',    label: 'Brand Hub', icon: 'bookmark' },
  ];

  const NavItem = ({ item }) => {
    const active = current === item.id;
    return (
      <a href="#" onClick={(e)=>{e.preventDefault(); onNav(item.id);}} style={{
        display:'flex', alignItems:'center', gap:12,
        padding: active ? '8px 12px 8px 9px' : '8px 12px',
        borderRadius:6,
        background: active ? 'var(--color-accent-subtle)' : 'transparent',
        color: active ? 'var(--color-accent-hover)' : 'var(--color-text-secondary)',
        borderLeft: active ? '3px solid var(--color-accent)' : 'none',
        fontSize:14, fontWeight:500, textDecoration:'none',
        transition:'background 100ms ease, color 100ms ease',
      }}>
        <Icon name={item.icon} size={18} color={active ? 'var(--color-accent)' : 'currentColor'}/>
        <span style={{flex:1}}>{item.label}</span>
        {item.badge ? <span style={{
          background:'var(--color-accent)', color:'#fff', fontSize:11, fontWeight:600,
          minWidth:18, height:18, borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 5px',
        }}>{item.badge}</span> : null}
      </a>
    );
  };

  const SectionLabel = ({ children }) => (
    <span style={{display:'block', fontSize:11, fontWeight:500, textTransform:'uppercase',
      letterSpacing:'0.04em', color:'var(--color-text-tertiary)', padding:'8px 12px'}}>{children}</span>
  );

  return (
    <aside style={{
      width:240, height:'100vh', background:'var(--color-surface-subtle)',
      borderRight:'1px solid var(--color-border)', display:'flex', flexDirection:'column',
      flexShrink:0, overflowY:'auto',
    }}>
      <div style={{padding:'24px 20px', display:'flex', alignItems:'center', gap:12}}>
        <img src="../../assets/bts-logo.svg" width="28" height="28" alt="BTS"/>
        <div>
          <div style={{fontFamily:'var(--font-display)', fontWeight:700, fontSize:20, color:'var(--color-text-primary)', lineHeight:1}}>BTS</div>
          <div style={{fontSize:11, textTransform:'uppercase', letterSpacing:'0.04em', color:'var(--color-text-tertiary)', fontWeight:500, marginTop:4}}>Internal</div>
        </div>
      </div>
      <nav style={{flex:1, padding:'0 8px'}}>
        <div style={{marginBottom:16}}>
          <SectionLabel>Work</SectionLabel>
          {work.map(i => <NavItem key={i.id} item={i}/>)}
        </div>
        <div>
          <SectionLabel>System</SectionLabel>
          {system.map(i => <NavItem key={i.id} item={i}/>)}
        </div>
      </nav>
      <div style={{padding:8, borderTop:'1px solid var(--color-border)'}}>
        <NavItem item={{id:'settings', label:'Settings', icon:'settings'}}/>
        <div style={{display:'flex', alignItems:'center', gap:8, padding:'8px 12px'}}>
          <div style={{width:28, height:28, borderRadius:'50%', background:'var(--color-accent-subtle)',
            color:'var(--color-accent-hover)', fontSize:11, fontWeight:600,
            display:'flex', alignItems:'center', justifyContent:'center'}}>CC</div>
          <span style={{flex:1, fontSize:13, color:'var(--color-text-secondary)'}}>Carri Crawford</span>
          <Icon name="logout" size={16} color="var(--color-text-tertiary)"/>
        </div>
      </div>
    </aside>
  );
}

function PageHeader({ title, actions }) {
  return (
    <header style={{
      position:'sticky', top:0, height:64, background:'var(--color-surface)',
      borderBottom:'1px solid var(--color-border)', display:'flex', alignItems:'center',
      justifyContent:'space-between', padding:'0 32px', zIndex:100, gap:16, flexShrink:0,
    }}>
      <h1 style={{fontFamily:'var(--font-display)', fontSize:26, fontWeight:600, color:'var(--color-text-primary)', lineHeight:1.1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', minWidth:0, margin:0}}>{title}</h1>
      <div style={{display:'flex', alignItems:'center', gap:12}}>{actions}</div>
    </header>
  );
}

Object.assign(window, { Sidebar, PageHeader });
