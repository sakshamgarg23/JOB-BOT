import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';
import path from 'node:path';
mkdirSync('.local',{recursive:true});process.env.JOBDESK_DATA_DIR=mkdtempSync(path.resolve('.local/source-quality-'));
const {jobInputSchema,emptyProfile}=await import('../lib/types');
const {importJob}=await import('../lib/jobs');
const {assessJob}=await import('../lib/quality');
const {observe,markMissing,getObservation,getProvenance}=await import('../lib/observations');
const {parseLever,parseAshby,parseStartupRss,parseHiringPost,parseHackerNewsComment}=await import('../lib/source-parsers');
const {sourceUrlAllowed}=await import('../lib/source-fetch');
const {detectCareerSource}=await import('../lib/career-source');
const {companyPreference}=await import('../lib/company-preferences');
const {automationTick,defaultAutomation}=await import('../lib/automation');
const {all,setKv,getProfile}=await import('../lib/db');
const current=new Date().toISOString();
const make=(description:string,extra={})=>importJob({description,title:'React Developer',company:'Example',url:'https://example.test/job/'+Math.random(),...extra}).job;

test('scam evidence distinguishes payment demands from no-fee warnings and never certifies genuineness',()=>{
 const clean=assessJob(make('We are hiring a React Developer. No registration fee. Do not share OTPs with recruiters.'));
 assert.equal(clean.risk.level,'no_obvious_flags');assert.ok(clean.risk.unknowns.some(s=>s.includes('guarantee')));
 const payment=assessJob(make('We never charge fees. However pay a refundable deposit to apply.'));
 assert.equal(payment.risk.level,'high');assert.ok(payment.risk.flags.some(f=>f.code==='payment'));
 const crypto=assessJob(make('Send USDT to unlock tasks and withdraw earnings.'));assert.equal(crypto.risk.level,'high');
 const email=assessJob(make('Apply with your CV to hiringteam@gmail.com'));
 assert.equal(email.risk.level,'review');assert.ok(email.risk.flags.some(f=>f.code==='personal-email'));
});
test('company domain checks handle public suffixes and impersonation without rewarding a name alone',()=>{
 const suspicious=assessJob(make('React frontend role',{url:'https://employer.co.in.attacker.test/apply',companyWebsite:'https://employer.co.in'}));
 assert.ok(suspicious.risk.flags.some(f=>f.code==='domain-mismatch'));
 assert.equal(companyPreference('Accenture in India',['Accenture']).preferred,true);
 assert.equal(companyPreference('Accenture Lookalike',['Accenture']).preferred,false);
});
test('last seen, changed posting dates and absent snapshots are tracked without inventing closure',()=>{
 const job=make('React frontend role',{postedAt:'2026-10-01'});
 observe(job,'fixture',current,'2026-10-01');observe(job,'fixture',current,current);
 assert.equal(getObservation(job.id)?.dateChanges.length,1);
 assert.equal(assessJob(job).freshness.repostSuspected,true);
 markMissing('fixture',new Set(),current);
 assert.equal(assessJob(job).freshness.present,false);
 assert.equal(assessJob(job).freshness.label,'Not in latest source snapshot');
 const unknown=assessJob(make('React'));
 assert.equal(unknown.freshness.ageDays,null);assert.equal(unknown.freshness.postedAt,null);
});
test('duplicate discovery keeps additional source provenance',()=>{
 const first=make('React',{url:'https://employer.test/one',source:'Career board',sourceId:'abc'});
 const second=importJob({...first,source:'LinkedIn hiring post',sourceId:'post-1',sourcePostUrl:'https://www.linkedin.com/posts/example-1',originKind:'hiring_post'});
 assert.equal(second.duplicate,true);assert.equal(getProvenance(first.id).length,2);
});
test('ATS parsers preserve known publication dates and leave undocumented dates unknown',()=>{
 const lever=parseLever([{id:'x',text:'Frontend Developer',hostedUrl:'https://jobs.lever.co/example/x',descriptionPlain:'React and CSS',createdAt:Date.now(),categories:{location:'India'},workplaceType:'remote'}],'example')[0];
 assert.equal(lever.postedAt,null);assert.equal(lever.postingDateKind,'unknown');assert.equal(lever.remoteEligibility,'India');
 const ashby=parseAshby({jobs:[{title:'React Developer',jobUrl:'https://jobs.ashbyhq.com/example/x',location:'India',isRemote:true,publishedAt:current,descriptionPlain:'React and JavaScript'},{title:'Unlisted',jobUrl:'https://jobs.ashbyhq.com/example/y',isListed:false}]},'example');
 assert.equal(ashby.length,1);assert.equal(ashby[0].postedAt,current);assert.equal(ashby[0].remoteEligibility,'India');
});
test('shared hiring posts preserve evidence, remove personalized link tokens and reject unsupported content',()=>{
 const post=parseHiringPost({platform:'LinkedIn',url:'https://www.linkedin.com/posts/example-123?otpToken=secret&trk=mail',text:'We are hiring!\nRole: React Developer\nCompany: Example\nRemote within India. Send your CV.'})!;
 assert.equal(post.originKind,'hiring_post');assert.equal(post.sourcePostUrl,'https://www.linkedin.com/posts/example-123');assert.equal(post.postedAt,null);
 assert.equal(post.descriptionComplete,false);assert.equal(post.title,'React Developer');
 assert.throws(()=>parseHiringPost({platform:'LinkedIn',url:'https://evil.test/post',text:'We are hiring React Developers'}));
 assert.throws(()=>parseHiringPost({platform:'LinkedIn',url:'https://www.linkedin.com/posts/hello',text:'A general article about my development career.'}));
 assert.equal(parseHackerNewsComment({id:1,type:'comment',dead:true,text:'Hiring frontend developers'}),null);
 const hn=parseHackerNewsComment({id:2,type:'comment',time:100,text:'<p>Example | React Developer | REMOTE</p>'})!;
 assert.equal(hn.postedAt,new Date(100000).toISOString());assert.equal(hn.source,'Hacker News hiring post');
 assert.equal(hn.company,'Example');
 const paragraphs=parseHackerNewsComment({id:3,type:'comment',text:'Example | React Developer | Remote worldwide<p>We are hiring engineers who work with React.'})!;
 assert.equal(paragraphs.title,'Example | React Developer | Remote worldwide');assert.equal(paragraphs.company,'Example');
});
test('RSS does not resolve DTDs and isolates invalid publication dates',()=>{
 assert.throws(()=>parseStartupRss('<!DOCTYPE rss [<!ENTITY x SYSTEM \"file:///secret\">]><rss/>'));
 const jobs=parseStartupRss('<rss><channel><item><title>Frontend Developer</title><link>https://startup.jobs/frontend-1</link><pubDate>not a date</pubDate><description>React</description></item></channel></rss>');
 assert.equal(jobs[0].postedAt,null);assert.equal(jobs[0].source,'Startup Jobs RSS');
});
test('source URLs and career registration accept only supported public endpoints',()=>{
 assert.equal(sourceUrlAllowed('https://api.ashbyhq.com/posting-api/job-board/example'),true);
 assert.equal(sourceUrlAllowed('https://api.smartrecruiters.com/v1/companies/Example/postings/123'),true);
 for(const url of ['http://127.0.0.1/jobs','https://api.lever.co/admin','https://api.lever.co.attacker.test/v0/postings/example','https://user:pass@api.lever.co/v0/postings/example'])assert.equal(sourceUrlAllowed(url),false);
 assert.deepEqual(detectCareerSource('https://careers.smartrecruiters.com/Version1'),{type:'smartrecruiters',board:'Version1'});
 assert.throws(()=>detectCareerSource('https://example.test/careers'));
});
test('unattended preparation blocks high risk, stale and senior roles while preserving suitable jobs',async()=>{
 setKv('profile',{...emptyProfile,name:'Test Candidate',email:'candidate@example.test',skills:['React','JavaScript','HTML','CSS'],yearsExperience:1,verified:true});
 setKv('automation-config',{...defaultAutomation,enabled:true});setKv('automation-requested',true);
 const fixture=(id:number,description:string,title='Frontend Developer',publication_date=current)=>({id,title,company_name:'Accenture',candidate_required_location:'India',url:'https://remotive.com/remote-jobs/software-dev/'+id,description,publication_date});
 const data={jobs:[fixture(1,'React and JavaScript. Pay a registration fee to apply.'),fixture(2,'React and CSS','Senior Frontend Developer'),fixture(3,'React and JavaScript','Frontend Developer','2020-01-01'),{...fixture(4,'React and JavaScript. Experience: 0-3 years.'),company_name:'Infosys'}]};
 await automationTick((async()=>new Response(JSON.stringify(data))) as typeof fetch);
 assert.equal(all('jobs').some(j=>j.title==='Senior Frontend Developer'),false);
 assert.equal(all('jobs').some(j=>j.postedAt==='2020-01-01'),false);
 const fee=all('jobs').find(j=>j.description.includes('registration fee'))!;assert.ok(fee);assert.equal(all('applications').some(a=>a.jobId===fee.id),false);
 assert.equal(all('applications').length,1);assert.equal(all('tasks').length,0);
 assert.equal(getProfile().verified,true);
});

