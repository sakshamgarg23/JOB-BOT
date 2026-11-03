import { createHash } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { all, get, getProfile, id, now, saveResume, getSettings, log } from './db';
import { hasSkill, extractSkills } from './jobs';
import type { Profile, Job, Resume } from './types';

export const profileHash=(p:Profile)=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
export function suggestFacts(text:string) {
  return {email:text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0]||'',skills:extractSkills(text)};
}
export function recommendResume(job:Job): {id:string;name:string;overlap:number}|null {
  const originals=all('resumes').filter(r=>r.kind==='original');
  return originals.map(r=>({id:r.id,name:r.name,overlap:job.requiredSkills.filter(s=>hasSkill(r.text,s)).length})).sort((a,b)=>b.overlap-a.overlap)[0]||null;
}
export function buildResume(job:Job, profile:Profile, order?:string[]): {text:string;notes:string[]} {
  if(!profile.verified) throw new Error('Review and verify your profile before tailoring a resume');
  if(!profile.name||!profile.email||!profile.skills.length) throw new Error('Verified name, email and skills are required');
  const relevance=(s:string)=>job.requiredSkills.filter(skill=>hasSkill(s,skill)).length;
  const rank=(a:string,b:string)=>relevance(b)-relevance(a);
  const skills=[...profile.skills].sort(rank);
  const sections=[profile.name,[profile.email,profile.phone,profile.location].filter(Boolean).join(' | '),[profile.portfolio,profile.linkedin,profile.github].filter(Boolean).join(' | '), '', 'SKILLS', skills.join(' | ')];
  for (const [title,records] of [['EXPERIENCE',profile.employment],['PROJECTS',profile.projects],['EDUCATION',profile.education]] as const) {
    if (!records.length) continue;
    sections.push('',title);
    // Employment chronology is preserved. Only project order and factual bullet order change.
    const ordered=title==='PROJECTS'?[...records].sort((a,b)=>relevance(b.details)-relevance(a.details)):records;
    for(const item of ordered) {
      sections.push([item.title,item.organization].filter(Boolean).join(' | '),[item.start,item.end].filter(Boolean).join(' - '));
      const bullets=item.details.split(/\r?\n/).filter(Boolean).map((text,i)=>({text,id:`${item.id}:${i}`}));
      bullets.sort((a,b)=>order?.includes(a.id)&&order?.includes(b.id)?order.indexOf(a.id)-order.indexOf(b.id):rank(a.text,b.text));
      sections.push(...bullets.map(b=>b.text));
    }
  }
  const missing=job.requiredSkills.filter(s=>!profile.skills.some(p=>hasSkill(p,s)||p.toLowerCase()===s.toLowerCase()));
  return {text:sections.filter((line,i,a)=>line||a[i-1]).join('\n'),notes:[
    'Built from the verified profile. Contact details, organizations, titles, dates and bullet wording are preserved.',
    'Relevant skills, project entries and existing bullets are moved earlier. Employment order is preserved.',
    ...(missing.length?[`Not added because they are not verified: ${missing.join(', ')}.`]:[]),
  ]};
}
async function aiOrder(job:Job, profile:Profile): Promise<string[]|undefined> {
  if(!getSettings().aiEnabled || !process.env.AI_RANKING_URL) return;
  const facts=[...profile.employment,...profile.projects,...profile.education].flatMap(x=>x.details.split(/\r?\n/).filter(Boolean).map((text,i)=>({id:`${x.id}:${i}`,text})));
  if(!facts.length) return;
  // The optional service ranks existing fact IDs. It cannot introduce prose or qualifications.
  try {
    const res=await fetch(process.env.AI_RANKING_URL,{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{'Content-Type':'application/json',...(process.env.AI_RANKING_KEY?{Authorization:`Bearer ${process.env.AI_RANKING_KEY}`}:{})},body:JSON.stringify({task:'rank_facts',job:{title:job.title,requiredSkills:job.requiredSkills},facts})});
    if(!res.ok) throw new Error('Provider unavailable');
    const result=await res.json(); const valid=new Set(facts.map(f=>f.id));
    if(!Array.isArray(result.orderedIds)||result.orderedIds.length!==facts.length||new Set(result.orderedIds).size!==facts.length||result.orderedIds.some((v:unknown)=>typeof v!=='string'||!valid.has(v))) throw new Error('Invalid ranking');
    return result.orderedIds;
  } catch { log('Optional ranking provider unavailable or invalid; used local tailoring','warning'); return; }
}
export async function tailorResume(job:Job): Promise<Resume> {
  const p=getProfile(); const built=buildResume(job,p,await aiOrder(job,p));
  const resume:Resume={id:id(),name:`${job.company||'Company'} - ${job.title}`,kind:'tailored',jobId:job.id,profileHash:profileHash(p),createdAt:now(),...built};
  saveResume(resume); log('Job-specific resume created from verified facts'); return resume;
}
export async function resumePdf(resume:Resume):Promise<Uint8Array> {
  const doc=await PDFDocument.create(); const regular=await doc.embedFont(StandardFonts.Helvetica); const bold=await doc.embedFont(StandardFonts.HelveticaBold);
  let page=doc.addPage([595.28,841.89]); let y=790;
  const clean=(s:string)=>s.replace(/[–—]/g,'-').replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/[^\x20-\x7E\xA0-\xFF]/g,'?');
  for(const [idx,line] of resume.text.split('\n').entries()) {
    const heading=idx===0||['SKILLS','EXPERIENCE','EDUCATION','PROJECTS'].includes(line);
    const size=idx===0?21:heading?11:10;
    const font=heading?bold:regular;
    const words=clean(line).split(/\s+/); const wrapped:string[]=[]; let row='';
    for(const word of words) {
      if(font.widthOfTextAtSize(`${row} ${word}`,size)>490&&row){wrapped.push(row);row='';}
      // Split unbroken URLs to avoid overflowing the page.
      for(const chunk of word.match(/.{1,75}/g)||['']) {
        if(font.widthOfTextAtSize(`${row} ${chunk}`,size)>490&&row){wrapped.push(row);row='';}
        row+=(row?' ':'')+chunk;
      }
    }
    wrapped.push(row);
    for(const rowText of wrapped) {
      if(y<50){page=doc.addPage([595.28,841.89]);y=790;}
      page.drawText(rowText,{x:50,y,size,font,color:rgb(.12,.15,.2)}); y-=heading?22:15;
    }
  }
  doc.setTitle(resume.name); return doc.save();
}
