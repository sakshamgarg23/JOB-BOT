export function sourceUrlAllowed(value:string){
 try{
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.port)return false;
  const paths:Record<string,RegExp>={
   'remotive.com':/^\/api\/remote-jobs$/,
   'boards-api.greenhouse.io':/^\/v1\/boards\/[a-zA-Z0-9_-]+\/jobs$/,
   'api.lever.co':/^\/v0\/postings\/[a-zA-Z0-9_-]+$/,
   'api.eu.lever.co':/^\/v0\/postings\/[a-zA-Z0-9_-]+$/,
   'api.ashbyhq.com':/^\/posting-api\/job-board\/[a-zA-Z0-9_-]+$/,
   'hacker-news.firebaseio.com':/^\/v0\/(?:user\/whoishiring|item\/\d+)\.json$/,
   'startup.jobs':/^\/feeds\/jobs$/,
   'api.smartrecruiters.com':/^\/v1\/companies\/[a-zA-Z0-9_-]+\/postings(?:\/[a-zA-Z0-9_-]+)?$/,
  };
  return !!paths[u.hostname]?.test(u.pathname);
 }catch{return false;}
}
export async function fetchSource(url:string,fetcher:typeof fetch=fetch,format:'json'|'text'='json'):Promise<unknown>{
 if(!sourceUrlAllowed(url))throw new Error('Source URL not allowed');
 const response=await fetcher(url,{redirect:'error',headers:{Accept:format==='json'?'application/json':'application/rss+xml, application/xml, text/xml'},signal:AbortSignal.timeout(18000)});
 if(!response.ok)throw new Error('Source unavailable');
 const limit=8_000_000;
 if(Number(response.headers.get('content-length')||0)>limit)throw new Error('Source response too large');
 const reader=response.body?.getReader();let raw='';
 if(reader){
  const decoder=new TextDecoder();let bytes=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>limit){await reader.cancel();throw new Error('Source response too large');}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}
  finally{reader.releaseLock();}
 }else raw=await response.text();
 if(raw.length>limit)throw new Error('Source response too large');
 return format==='text'?raw:JSON.parse(raw);
}

