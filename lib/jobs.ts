import { createHash } from 'node:crypto';
import Papa from 'papaparse';
import { db, all, get, id, now, saveJob, log } from './db';
import { jobInputSchema, type Job, type JobInput, type Match, type Profile, type Settings } from './types';
import { addProvenance } from './observations';

export const skillNames = ['JavaScript','TypeScript','React','Next.js','HTML','CSS','Tailwind','SQL','WordPress','Shopify','Node.js','MongoDB','Express','Redux','Git','REST','GraphQL','Python','Java','AWS','Docker','Jest','Playwright','Angular','Vue','PHP','Spring','Informatica PowerCenter'];
const aliases: Record<string,string[]> = { 'React':['react','react.js','reactjs'], 'Next.js':['next.js','nextjs'], 'Node.js':['node.js','nodejs'], 'Tailwind':['tailwind','tailwindcss'], 'JavaScript':['javascript','js'], 'TypeScript':['typescript','ts'], 'Express':['express','express.js'] };
const escape = (s:string) => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function hasSkill(text:string, skill:string) { return (aliases[skill]||[skill]).some(a => new RegExp(`(^|[^a-z0-9])${escape(a)}(?=$|[^a-z0-9])`,'i').test(text)); }
export function extractSkills(text:string) { return skillNames.filter(s => hasSkill(text,s)); }
export function canonicalUrl(value:string): string|null {
  if (!value.trim()) return null;
  let u:URL; try { u=new URL(value); } catch { throw new Error('Application URL must be a full http(s) URL'); }
  if (!['http:','https:'].includes(u.protocol) || u.username || u.password) throw new Error('Use an http(s) URL without credentials');
  u.hash=''; u.hostname=u.hostname.toLowerCase();
  for (const key of [...u.searchParams.keys()]) if (/^(utm_.+|trk|trackingId|ref|refId|source|fbclid|gclid)$/i.test(key)) u.searchParams.delete(key);
  u.searchParams.sort(); u.pathname=u.pathname.replace(/\/$/,'')||'/'; return u.toString();
}
export function extractJob(input: JobInput): JobInput {
  const d=input.description;
  const labeled=(label:string)=>d.match(new RegExp(`^(?:${label})\\s*:\\s*(.+)$`,'im'))?.[1]?.trim()||'';
  const lines=d.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const title=input.title || labeled('title|role|position') || (lines[0]?.length<130?lines[0]:'Untitled job');
  const company=input.company || labeled('company');
  const location=input.location || labeled('location');
  const range=d.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*years?/i);
  const minimum=d.match(/(?:minimum|at least)\s*(\d+(?:\.\d+)?)\s*years?|\b(\d+)\+\s*years?/i);
  const expMin=input.experienceMin??(range?Number(range[1]):minimum?Number(minimum[1]||minimum[2]):null);
  const expMax=input.experienceMax??(range?Number(range[2]):null);
  const requiredLines:string[]=[],preferredLines:string[]=[];let preferredSection=false;
  for(const line of lines) {
    if(/^(?:preferred|nice to have|good to have|bonus|optional)(?:\s+skills)?\s*:/i.test(line)) preferredSection=true;
    if(/^(?:requirements|required|qualifications|responsibilities|salary|experience|benefits)(?:\s+skills)?\s*:/i.test(line)) preferredSection=false;
    (preferredSection||/preferred|nice to have|bonus|optional/i.test(line)?preferredLines:requiredLines).push(line);
  }
  const preferredText=preferredLines.join('\n'),requiredText=requiredLines.join('\n');
  const preferredSkills=input.preferredSkills.length?input.preferredSkills:extractSkills(preferredText);
  const requiredSkills=input.requiredSkills.length?input.requiredSkills:extractSkills(requiredText);
  const remoteText=`${location} ${d}`;
  let remoteEligibility=input.remoteEligibility;
  if (remoteEligibility==='Unknown') {
    if (/remote|work from home/i.test(remoteText)) {
      if (/\b(?:US|USA|UK|Canada|Europe|EU)\s*(?:only|based)|(?:only|must be|reside|located)\s+(?:in\s+)?(?:the\s+)?(?:US|USA|United States|UK|Canada|Europe)|remote\s*[-–(]?\s*(?:US|USA|UK|Canada|Europe)\b/i.test(remoteText)) remoteEligibility='Restricted';
      else if (/worldwide|anywhere in the world|globally remote/i.test(remoteText)) remoteEligibility='Worldwide';
      else if (/remote\s*(?:[-–:(]|within|in|from|across)?\s*India|India\s*[-–:]?\s*remote|work from anywhere in India/i.test(remoteText)) remoteEligibility='India';
    } else if (/onsite|on-site|in.office|hybrid/i.test(remoteText)) remoteEligibility='Onsite';
  }
  const lpa=d.match(/(?:INR|₹|Rs\.?\s*)?\s*(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:LPA|lakhs? per annum)/i);
  const url=input.url || d.match(/https?:\/\/[^\s<>"']+/)?.[0]?.replace(/[.,)]+$/,'')||'';
  const postedAt=input.postedAt || labeled('posted(?: at| date)?') || null;
  const receivedAt=input.receivedAt || labeled('received(?: at| date)?') || null;
  for (const date of [postedAt,receivedAt]) if (date && !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(date)) throw new Error('Use ISO dates (YYYY-MM-DD); relative dates need manual confirmation');
  return {...input,title,company,location,url,experienceMin:expMin,experienceMax:expMax,requiredSkills,preferredSkills,remoteEligibility,postedAt,receivedAt,
    salaryMin:input.salaryMin??(lpa?Number(lpa[1])*100000:null), salaryMax:input.salaryMax??(lpa?Number(lpa[2])*100000:null), currency:input.currency??(lpa?'INR':null), salaryPeriod:input.salaryPeriod??(lpa?'annual':null)};
}
export function importJob(raw: unknown): {job:Job; duplicate:boolean} {
  const input=extractJob(jobInputSchema.parse(raw));
  const canonical=canonicalUrl(input.url);
  const sourceKey=input.sourceId?`${input.source.toLowerCase()}:${input.sourceId}`:null;
  const fingerprint=canonical || `text:${createHash('sha256').update(input.description.trim().toLowerCase()+'|'+input.title.toLowerCase()+'|'+input.company.toLowerCase()).digest('hex')}`;
  const existing=db.prepare('SELECT id FROM jobs WHERE canonical=? OR (source_key IS NOT NULL AND source_key=?)').get(fingerprint,sourceKey) as {id:string}|undefined;
  if (existing) {const job=get('jobs',existing.id)!;addProvenance(job,input);return {job,duplicate:true};}
  const norm=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  const likely=all('jobs').find(j=>input.company && norm(j.company)===norm(input.company) && norm(j.title)===norm(input.title) && norm(j.location)===norm(input.location));
  const job:Job={...input,id:id(),discoveredAt:now(),status:'New',likelyDuplicate:likely?.id||null};
  db.prepare('INSERT INTO jobs VALUES (?,?,?,?)').run(job.id,fingerprint,sourceKey,JSON.stringify(job));
  addProvenance(job,input);log('Job imported'); return {job,duplicate:false};
}
export function importCsv(csv:string) {
  const parsed=Papa.parse<Record<string,string>>(csv,{header:true,skipEmptyLines:true,transformHeader:h=>h.trim()});
  if (parsed.errors.length) throw new Error(`CSV: ${parsed.errors[0].message}`);
  if (parsed.data.length>500) throw new Error('Import up to 500 rows at a time');
  if (!parsed.meta.fields?.includes('description')) throw new Error('CSV requires a description header');
  return parsed.data.map((r,index)=>{
    try { return {...importJob({title:r.title||'',company:r.company||'',location:r.location||'',description:r.description,url:r.url||'',source:r.source||'CSV',sourceId:r.sourceId||'',postedAt:r.postedAt||null,receivedAt:r.receivedAt||null}),row:index+2}; }
    catch(e) { return {row:index+2,error:e instanceof Error?e.message:'Invalid row'}; }
  });
}
export function matchJob(job: Job, profile:Profile, settings:Settings):Match {
  const verifiedSkills=profile.verified?profile.skills:[];
  const contains=(skill:string)=>verifiedSkills.some(s=>s.toLowerCase()===skill.toLowerCase()||hasSkill(s,skill));
  const matching=job.requiredSkills.filter(contains), missing=job.requiredSkills.filter(s=>!contains(s)), preferred=job.preferredSkills.filter(contains);
  const uncertainties:string[]=[], reasons:string[]=[], hardBlocks:string[]=[];
  let score=job.requiredSkills.length?Math.round(matching.length/job.requiredSkills.length*55):25;
  if (!job.requiredSkills.length) uncertainties.push('No explicit skill requirements were extracted. Review the description.');
  if (!profile.verified) uncertainties.push('Profile facts have not been verified.');
  if (matching.length) reasons.push(`${matching.length} required skills match verified profile facts`);
  const roleMatch=settings.targetRoles.some(role=>{
    const terms=role.toLowerCase().split(/[\s/]+/).filter(t=>t.length>2&&!['developer','engineer','junior','associate'].includes(t));
    return terms.some(t=>job.title.toLowerCase().includes(t)) || job.title.toLowerCase().includes(role.toLowerCase());
  });
  if (roleMatch) { score+=15; reasons.push('Title aligns with a target role'); } else uncertainties.push('Title may be outside your target roles.');
  let experience='Unknown';
  if (job.experienceMin===null && job.experienceMax===null) uncertainties.push('Required experience is undisclosed.');
  else if (profile.yearsExperience===null||!profile.verified) uncertainties.push('Your verified years of experience are unknown.');
  else {
    const tooLow=job.experienceMin!==null&&profile.yearsExperience<job.experienceMin;
    const tooHigh=job.experienceMax!==null&&profile.yearsExperience>job.experienceMax;
    experience=tooLow?'Below stated minimum':tooHigh?'Above stated range':'Within stated range';
    if (!tooLow&&!tooHigh) score+=10;
    if (tooLow) hardBlocks.push('Verified experience is below the stated minimum');
    if (tooHigh) uncertainties.push('Your experience exceeds the stated range; review seniority.');
  }
  if (job.experienceMin!==null&&job.experienceMin>settings.maxExperience) hardBlocks.push('Job is above your configured experience range');
  if (job.experienceMax!==null&&job.experienceMax<settings.minExperience) uncertainties.push('Job is below your preferred experience range.');
  let location='Eligibility unknown';
  if (job.remoteEligibility==='Restricted') {
    location='Remote restricted to another country';
    if(settings.requireIndiaEligible) hardBlocks.push('Remote is restricted outside India');
  } else if (['India','Worldwide'].includes(job.remoteEligibility)) {
    location=job.remoteEligibility==='India'?'Remote from India':'Worldwide remote';
    if(settings.remote) score+=10; else uncertainties.push('Remote work is outside your preferences.');
  } else if (job.remoteEligibility==='Onsite') {
    const fits=settings.locations.some(l=>job.location.toLowerCase().includes(l.toLowerCase()));
    location=fits?'Location matches preferences':settings.relocate?'Relocation needs confirmation':'Outside preferred locations';
    if(fits) score+=10; else if(settings.locationHard&&!settings.relocate) hardBlocks.push('Onsite location does not match preferences');
  } else uncertainties.push('Remote-from-India eligibility is unconfirmed; generic “remote” is not enough.');
  let salary='Undisclosed';
  if(job.salaryMin!==null||job.salaryMax!==null) {
    if (job.currency!==profile.currency||job.salaryPeriod!=='annual') { salary='Not directly comparable'; uncertainties.push('Salary currency or period differs or is unknown.'); }
    else {
      const target=settings.minimumSalary??profile.expectedSalary;
      if(target===null) salary='Disclosed; set expectations to compare';
      else if(job.salaryMax!==null&&job.salaryMax<target) { salary='Below expectations'; if(settings.salaryHard) hardBlocks.push('Maximum salary is below your annual minimum'); }
      else { salary='Potentially meets expectations'; score+=5; if(job.salaryMin!==null&&job.salaryMin<target) uncertainties.push('Only part of the salary range meets your expectations.'); }
    }
  } else uncertainties.push('Salary is undisclosed; this does not block the job.');
  if(preferred.length) score+=Math.min(5,preferred.length*2);
  return {score:Math.min(100,score),matching,missing,preferred,reasons,uncertainties,hardBlocks,experience,location,salary};
}
