export function detectCareerSource(value:string){
 const u=new URL(value);
 if(u.protocol!=='https:'||u.username||u.password)throw new Error('Use an HTTPS company career-board URL without credentials');
 const parts=u.pathname.split('/').filter(Boolean);
 let type:'greenhouse'|'lever'|'ashby'|'smartrecruiters';
 let board=parts[0]||'';
 if(['boards.greenhouse.io','job-boards.greenhouse.io'].includes(u.hostname)){type='greenhouse';if(parts[0]==='embed')board=u.searchParams.get('for')||'';}
 else if(u.hostname==='jobs.lever.co')type='lever';
 else if(u.hostname==='jobs.ashbyhq.com')type='ashby';
 else if(['jobs.smartrecruiters.com','careers.smartrecruiters.com'].includes(u.hostname))type='smartrecruiters';
 else throw new Error('No collector is available for that career system yet. Supported career-board URLs are Greenhouse, Lever, Ashby and SmartRecruiters. A company name alone does not connect its website.');
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(board))throw new Error('Could not identify the company board from this URL');
 return {type,board};
}

