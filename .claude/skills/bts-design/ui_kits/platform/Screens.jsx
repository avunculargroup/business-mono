const { useState: useStateScreens } = React;

function Dashboard({ activities, onApprove, onReject, onNav }) {
  const pending = activities.filter(a => a.status === 'pending').slice(0, 2);
  const tasks = [
    { title: 'Send treasury primer to Marcus Chen', contact: 'Dorian Trust Pty Ltd', due: '22 Mar' },
    { title: 'Finalise Q2 board pack', contact: 'BTS internal', due: '24 Mar' },
    { title: 'Review custody vendor shortlist', contact: 'Aspen Super', due: '26 Mar' },
  ];
  return (
    <div style={{padding:24, maxWidth:1200, display:'grid', gridTemplateColumns:'60fr 40fr', gap:24}}>
      <div style={{display:'flex', flexDirection:'column', gap:20}}>
        <div>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12}}>
            <h2 style={{fontFamily:'var(--font-display)', fontSize:20, fontWeight:600}}>Pending approvals</h2>
            <a href="#" onClick={(e)=>{e.preventDefault(); onNav('activity');}} style={{fontSize:13, color:'var(--color-accent)', fontWeight:500}}>View all →</a>
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:12}}>
            {pending.length === 0
              ? <EmptyState icon="check" heading="All clear" sub="No proposals waiting on you."/>
              : pending.map(a => <AgentActivityCard key={a.id} activity={a} onApprove={()=>onApprove(a.id)} onReject={()=>onReject(a.id)}/>)}
          </div>
        </div>
      </div>
      <div style={{display:'flex', flexDirection:'column', gap:20}}>
        <Card>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12}}>
            <h2 style={{fontFamily:'var(--font-display)', fontSize:20, fontWeight:600}}>Open tasks</h2>
            <a href="#" onClick={(e)=>{e.preventDefault(); onNav('tasks');}} style={{fontSize:13, color:'var(--color-accent)', fontWeight:500}}>View all →</a>
          </div>
          {tasks.map((t, i) => (
            <div key={i} style={{display:'flex', alignItems:'center', gap:12, padding:'8px 0',
              borderBottom: i === tasks.length-1 ? 'none' : '1px solid var(--color-border)'}}>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontSize:14, fontWeight:500, color:'var(--color-text-primary)',
                  whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{t.title}</div>
                <div style={{fontSize:11, color:'var(--color-text-tertiary)'}}>{t.contact}</div>
              </div>
              <div style={{fontFamily:'var(--font-mono)', fontSize:13, color:'var(--color-text-tertiary)'}}>{t.due}</div>
            </div>
          ))}
        </Card>
        <Card>
          <div style={{fontFamily:'var(--font-display)', fontSize:20, fontWeight:600, marginBottom:8}}>Content pipeline</div>
          <div style={{display:'flex', gap:16, marginTop:8}}>
            {[['Idea', 3],['Draft', 2],['Review', 1],['Published', 8]].map(([label, n]) => (
              <div key={label} style={{display:'flex', flexDirection:'column', alignItems:'center'}}>
                <span style={{fontFamily:'var(--font-mono)', fontSize:20, fontWeight:600, color:'var(--color-text-primary)'}}>{n}</span>
                <span style={{fontSize:11, color:'var(--color-text-tertiary)', textTransform:'capitalize'}}>{label}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function AgentActivity({ activities, onApprove, onReject }) {
  return (
    <div style={{padding:24, maxWidth:800}}>
      <div style={{display:'flex', flexDirection:'column', gap:12}}>
        {activities.map(a => (
          <AgentActivityCard key={a.id} activity={a}
            onApprove={()=>onApprove(a.id)} onReject={()=>onReject(a.id)}/>
        ))}
      </div>
    </div>
  );
}

function ContactsList({ onOpen }) {
  const rows = [
    { id:1, name:'Marcus Chen',     company:'Dorian Trust Pty Ltd',  stage:'active',  last:'22 Mar' },
    { id:2, name:'Priya Raman',     company:'Aspen Super',           stage:'warm',    last:'20 Mar' },
    { id:3, name:'James Whitaker',  company:'Kingsford Partners',    stage:'client',  last:'14 Mar' },
    { id:4, name:'Elena Vostok',    company:'Meridian Accounting',   stage:'lead',    last:'08 Mar' },
    { id:5, name:'Sam Orenstein',   company:'Locate Technologies',   stage:'client',  last:'04 Mar' },
    { id:6, name:'Theresa Morrison',company:'Independent advisor',   stage:'dormant', last:'12 Feb' },
  ];
  return (
    <div style={{padding:24, maxWidth:1200}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
        <div style={{fontSize:13, color:'var(--color-text-secondary)'}}>{rows.length} contacts</div>
        <Button variant="primary"><Icon name="plus" size={16}/>Add contact</Button>
      </div>
      <DataTable
        onRowClick={(r)=>onOpen(r)}
        columns={[
          { key:'name', label:'Name' },
          { key:'company', label:'Company' },
          { key:'stage', label:'Stage', render: r => <StageChip stage={r.stage}/> },
          { key:'last', label:'Last contact', align:'right', mono:true },
        ]}
        rows={rows}/>
    </div>
  );
}

function ContactDetail({ contact, onBack }) {
  const timeline = [
    { type:'call',     title:'Phone call · 32 min',    when:'22 Mar · 14:32', icon:'phone',    body:'Q1 allocation review. Comfortable with 5–8% of excess cash. Wants follow-up with custody vendor comparison.' },
    { type:'email',    title:'Email · treasury primer',when:'20 Mar · 09:15', icon:'mail',     body:'Sent the BTS treasury primer PDF and the 2025 regulatory snapshot.' },
    { type:'meeting',  title:'Video call · 45 min',   when:'14 Mar · 10:00', icon:'calendar', body:'Intro with co-founder. Discussed current treasury setup, cash buffer, and risk tolerance.' },
  ];
  return (
    <div style={{padding:24, maxWidth:960}}>
      <a href="#" onClick={(e)=>{e.preventDefault(); onBack();}} style={{fontSize:13, color:'var(--color-text-secondary)', marginBottom:16, display:'inline-block'}}>← Contacts</a>
      <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:24}}>
        <div>
          <h2 style={{fontFamily:'var(--font-display)', fontSize:20, fontWeight:600, marginBottom:4}}>Interaction timeline</h2>
          <div style={{fontSize:13, color:'var(--color-text-secondary)', marginBottom:16}}>Recorded by agents from calls, emails, and meetings.</div>
          <div style={{display:'flex', flexDirection:'column', gap:12}}>
            {timeline.map((t, i) => (
              <Card key={i}>
                <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:6}}>
                  <div style={{width:32, height:32, borderRadius:8, background:'var(--color-surface-subtle)',
                    display:'flex', alignItems:'center', justifyContent:'center', color:'var(--color-accent-dark)'}}>
                    <Icon name={t.icon} size={16}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14, fontWeight:600}}>{t.title}</div>
                    <div style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--color-text-tertiary)'}}>{t.when}</div>
                  </div>
                </div>
                <div style={{fontSize:13, color:'var(--color-text-secondary)', lineHeight:1.6}}>{t.body}</div>
              </Card>
            ))}
          </div>
        </div>
        <div>
          <Card>
            <div style={{fontSize:16, fontWeight:600, marginBottom:4}}>{contact.name}</div>
            <div style={{fontSize:13, color:'var(--color-text-secondary)', marginBottom:12}}>{contact.company}</div>
            <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:12}}>
              <StageChip stage={contact.stage}/>
              <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--color-text-tertiary)'}}>Last {contact.last}</span>
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:8}}>
              <div style={{fontSize:11, fontWeight:500, textTransform:'uppercase', letterSpacing:'0.04em', color:'var(--color-text-tertiary)'}}>Attributes</div>
              <div style={{fontSize:13}}><span style={{color:'var(--color-text-secondary)'}}>Role:</span> CFO</div>
              <div style={{fontSize:13}}><span style={{color:'var(--color-text-secondary)'}}>Allocation:</span> <span style={{fontFamily:'var(--font-mono)'}}>5–8%</span></div>
              <div style={{fontSize:13}}><span style={{color:'var(--color-text-secondary)'}}>Source:</span> Referral — Kingsford</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard, AgentActivity, ContactsList, ContactDetail });
