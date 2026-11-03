'use client';
import {Badge,date,type JobView} from './workspace';
export function JobSignals({job}:{job:JobView}){
 const q=job.quality;
 return <section className="detail-section quality-detail"><div className="section-row"><h3>Source, freshness & risk</h3><Badge tone={q.risk.level==='high'?'red':q.risk.level==='review'?'amber':'green'}>{q.risk.label}</Badge></div>
 {job.employer.preferred&&<p className="muted">Preferred employer: {job.employer.matchedName}. This preference is not employer verification.</p>}
 <p className="muted">{q.freshness.label}{q.freshness.ageDays!==null?' · '+q.freshness.ageDays+' days since the source publication date':''}</p>
 <div className="date-grid"><span>Source date kind<strong>{q.freshness.dateKind.replaceAll('_',' ')}</strong></span><span>First seen here<strong>{date(q.freshness.firstSeenAt)}</strong></span><span>Last seen at source<strong>{date(q.freshness.lastSeenAt)}</strong></span></div>
 {q.freshness.lastCheckedAt&&<p className="muted">Last source check: {new Date(q.freshness.lastCheckedAt).toLocaleString('en-IN')}. Missing from a snapshot does not prove that an opening is closed.</p>}
 {q.risk.flags.map(f=><div className={'risk-note '+f.severity} key={f.code}><strong>{f.severity==='high'?'High-risk signal':'Review signal'}</strong><p>{f.reason}</p></div>)}
 {q.risk.evidence.map(e=><p className="reason" key={e}>{e}</p>)}
 <details><summary>Verification limits</summary><ul>{q.risk.unknowns.map(u=><li key={u}>{u}</li>)}</ul></details>
 {job.sourcePostUrl&&<p><a className="text-btn" href={job.sourcePostUrl} target="_blank" rel="noreferrer">Read the original hiring post ↗</a></p>}
 {!!q.provenance.length&&<details><summary>{q.provenance.length} recorded source reference(s)</summary><ul>{q.provenance.map((p,i)=><li key={i}>{p.source} · {date(p.observedAt)}{p.url&&<> · <a href={p.url} target="_blank" rel="noreferrer">Original listing</a></>}</li>)}</ul></details>}
 </section>;
}

