export function plainText(html:string) {
 const clean=html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<\s*\/?(?:br|p|div|li|h[1-6])\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,'');
 return clean.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi,(_,entity:string)=>{
  const names:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  if(!entity.startsWith('#'))return names[entity.toLowerCase()]||'';
  const code=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):parseInt(entity.slice(1),10);
  return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';
 }).replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim().slice(0,28000);
}
export function iso(value:unknown):string|null {
 if(typeof value!=='string'||!value||!Number.isFinite(Date.parse(value)))return null;
 return value.includes('T')?new Date(value).toISOString():/^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;
}
export function feedEligibility(location:string):'India'|'Worldwide'|'Restricted'|'Unknown' {
 if(/\bworldwide\b|anywhere in the world/i.test(location))return 'Worldwide';
 if(/\bindia\b/i.test(location))return 'India';
 if(/^(?:USA?|United States|Canada|UK|United Kingdom|Europe|European Union|EU|Germany|France|Australia)(?:\s+only)?$/i.test(location.trim()))return 'Restricted';
 return 'Unknown';
}

