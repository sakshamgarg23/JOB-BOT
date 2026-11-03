import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';
import path from 'node:path';
mkdirSync('.local',{recursive:true});
process.env.JOBDESK_DATA_DIR=mkdtempSync(path.resolve('.local/provider-test-'));
const {kv,setKv,all}=await import('../lib/db');
const {saveProviderKey,readProviderKey,providerKeyConfigured}=await import('../lib/provider-key');
const {parseFantasticJobs,collectFantasticJobs}=await import('../lib/fantastic-jobs');
const {automationTick,defaultAutomation}=await import('../lib/automation');
const fixture=(source='ycombinator')=>({id:41,title:'Frontend Developer',organization:'Fixture Startup',url:'https://example.test/careers/41',source,
 date_created:'2026-11-03T08:00:00Z',date_posted:null,locations_derived:['Remote - India'],description_text:'Requirements: JavaScript, React, HTML and CSS. Build accessible user interfaces for our product team. Experience: 0-3 years.'});

test('provider parsing keeps missing publication dates unknown and labels provenance',()=>{
 const jobs=parseFantasticJobs([fixture(),fixture('wellfound'),{...fixture(),source:'linkedin'},{...fixture(),url:'http://127.0.0.1/private'}],['ycombinator']);
 assert.equal(jobs.length,1);assert.equal(jobs[0].postedAt,null);assert.equal(jobs[0].receivedAt,null);
 assert.equal(jobs[0].source,'YC via Fantastic.jobs');assert.equal(jobs[0].adapter,'manual');
 assert.equal(jobs[0].remoteEligibility,'India');
 const dated=parseFantasticJobs([{...fixture(),date_posted:'2026-10-01T01:00:00Z'}],['ycombinator'])[0];
 assert.equal(dated.postedAt,'2026-10-01T01:00:00.000Z');
});
test('provider uses fixed endpoint with server-only authorization and sanitized failures',async()=>{
 await collectFantasticJobs('fixture-secret',['wellfound'],25,(async(url,options)=>{
  const target=new URL(String(url));assert.equal(target.origin,'https://data.fantastic.jobs');assert.equal(target.pathname,'/v1/active-jb');
  assert.equal(target.searchParams.get('source'),'wellfound');assert.equal(target.searchParams.get('limit'),'25');
  assert.equal(target.searchParams.get('description_format'),'text');assert.equal(target.searchParams.get('time_frame'),'24h');
  assert.equal(options?.redirect,'error');assert.equal((options?.headers as Record<string,string>).Authorization,'Bearer fixture-secret');
  return Response.json([fixture('wellfound')]);
 }) as typeof fetch);
 await assert.rejects(()=>collectFantasticJobs('fixture-secret',['wellfound'],25,(async()=>{throw new Error('raw fixture-secret');}) as typeof fetch),error=>error instanceof Error&&!error.message.includes('fixture-secret'));
});
test('Windows key storage round-trips ciphertext and scheduler cannot bypass daily credit cap',{skip:process.platform!=='win32'},async()=>{
 const secret='fixture-key-only-not-a-real-credential';
 await saveProviderKey(secret);assert.equal(providerKeyConfigured(),true);
 assert.equal(await readProviderKey(),secret);assert.ok(!kv<string>('fantastic-jobs-key-dpapi','').includes(secret));
 setKv('automation-config',{...defaultAutomation,enabled:true,remotive:false,autoPrepare:false,fantasticEnabled:true});
 let calls=0;
 const fake=(async()=>{calls++;return Response.json([{...fixture(),date_posted:new Date().toISOString()}]);}) as typeof fetch;
 await automationTick(fake);assert.equal(calls,1);assert.equal(all('jobs').length,1);assert.equal(all('tasks').length,0);
 setKv('automation-requested',true);await automationTick(fake);assert.equal(calls,1,'Check now must reuse cache');
 await saveProviderKey('');assert.equal(providerKeyConfigured(),false);assert.equal(await readProviderKey(),null);
 setKv('automation-requested',true);await automationTick(fake);assert.equal(calls,1,'Missing key cannot call provider');
});
