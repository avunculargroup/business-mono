function AgentActivityCard({ activity, onApprove, onReject }) {
  const borderColor = {
    pending:  'var(--color-warning)',
    approved: 'var(--color-success)',
    rejected: 'var(--color-destructive)',
  }[activity.status] || 'transparent';

  return (
    <div style={{
      background:'var(--color-surface)', border:'1px solid var(--color-border)',
      borderRadius:8, padding:16, borderLeft:`3px solid ${borderColor}`,
    }}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
        <AgentBadge name={activity.agent}/>
        <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--color-text-tertiary)'}}>{activity.timestamp}</span>
      </div>
      <div style={{fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--color-text-tertiary)', marginBottom:4}}>{activity.prefix}</div>
      <div style={{fontSize:14, fontWeight:500, color:'var(--color-text-primary)', marginBottom:8}}>{activity.message}</div>
      {activity.trigger && <p style={{fontSize:13, color:'var(--color-text-secondary)', marginBottom:12}}>Triggered by: {activity.trigger}</p>}
      {activity.actions && activity.actions.length > 0 && (
        <ul style={{listStyle:'none', padding:0, margin:'12px 0', display:'flex', flexDirection:'column', gap:8}}>
          {activity.actions.map((a, i) => (
            <li key={i} style={{fontSize:13, color:'var(--color-text-primary)',
              padding:'8px 12px', background:'var(--color-surface-subtle)', borderRadius:4}}>
              {a.description}
              {a.entity && <span style={{color:'var(--color-text-tertiary)', fontSize:11, marginLeft:6}}>({a.entity})</span>}
            </li>
          ))}
        </ul>
      )}
      {activity.status === 'pending' && (
        <div style={{display:'flex', gap:8, marginTop:12}}>
          <Button size="sm" variant="primary" onClick={onApprove}>Approve all</Button>
          <Button size="sm" variant="secondary">Review individually</Button>
          <Button size="sm" variant="ghost" onClick={onReject}>Reject</Button>
        </div>
      )}
      {activity.status === 'approved' && (
        <div style={{display:'inline-flex', alignItems:'center', gap:6, marginTop:8, fontSize:11, fontWeight:600, color:'var(--color-text-secondary)'}}>
          <span style={{width:6, height:6, borderRadius:'50%', background:'var(--color-success)'}}/>Approved
        </div>
      )}
      {activity.status === 'rejected' && (
        <div style={{display:'inline-flex', alignItems:'center', gap:6, marginTop:8, fontSize:11, fontWeight:600, color:'var(--color-text-secondary)'}}>
          <span style={{width:6, height:6, borderRadius:'50%', background:'var(--color-destructive)'}}/>Rejected
        </div>
      )}
    </div>
  );
}

function DataTable({ columns, rows, onRowClick }) {
  return (
    <div style={{background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:12, overflow:'hidden'}}>
      <table style={{width:'100%', borderCollapse:'collapse'}}>
        <thead>
          <tr style={{background:'var(--color-surface-subtle)'}}>
            {columns.map(c => (
              <th key={c.key} style={{
                textAlign: c.align || 'left', padding:'10px 16px',
                fontFamily:'var(--font-body)', fontSize:11, fontWeight:500,
                textTransform:'uppercase', letterSpacing:'0.04em',
                color:'var(--color-text-secondary)',
                borderBottom:'1px solid var(--color-border)',
              }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} onClick={()=>onRowClick && onRowClick(row)}
              onMouseEnter={e => e.currentTarget.style.background='var(--color-surface-subtle)'}
              onMouseLeave={e => e.currentTarget.style.background='var(--color-surface)'}
              style={{background:'var(--color-surface)', cursor: onRowClick ? 'pointer' : 'default', transition:'background 100ms ease'}}>
              {columns.map(c => (
                <td key={c.key} style={{
                  padding:'12px 16px', fontSize:14, color:'var(--color-text-primary)',
                  textAlign: c.align || 'left',
                  fontFamily: c.mono ? 'var(--font-mono)' : 'var(--font-body)',
                  borderBottom: i === rows.length-1 ? 'none' : '1px solid var(--color-border)',
                }}>{c.render ? c.render(row) : row[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

Object.assign(window, { AgentActivityCard, DataTable });
