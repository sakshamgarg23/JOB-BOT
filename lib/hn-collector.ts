import {z} from 'zod';
import {fetchSource} from './source-fetch';
import {parseHackerNewsComment} from './source-parsers';
import type {JobInput} from './types';
export async function collectHackerNews(fetcher:typeof fetch,maximum:number):Promise<JobInput[]>{
 const user=z.object({submitted:z.array(z.number())}).parse(await fetchSource('https://hacker-news.firebaseio.com/v0/user/whoishiring.json',fetcher));
 let ids:number[]=[];
 for(const id of user.submitted.slice(0,8)){
  const item=await fetchSource('https://hacker-news.firebaseio.com/v0/item/'+id+'.json',fetcher);
  const parsed=z.object({title:z.string(),kids:z.array(z.number()).optional()}).safeParse(item);
  if(parsed.success&&/^Ask HN: Who is hiring\?/i.test(parsed.data.title)){ids=(parsed.data.kids||[]).slice(0,maximum);break;}
 }
 if(!ids.length)throw new Error('Current Who is hiring thread unavailable');
 const results:JobInput[]=[];
 for(let i=0;i<ids.length;i+=6){
  const batch=await Promise.allSettled(ids.slice(i,i+6).map(async id=>parseHackerNewsComment(await fetchSource('https://hacker-news.firebaseio.com/v0/item/'+id+'.json',fetcher))));
  for(const result of batch)if(result.status==='fulfilled'&&result.value)results.push(result.value);
 }
 if(!results.length)throw new Error('Hiring posts could not be retrieved');
 return results;
}

