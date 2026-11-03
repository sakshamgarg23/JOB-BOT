export function localRequest(request:Request) {
  const u=new URL(request.url);
  const host=request.headers.get('host')?.split(':')[0];
  if(!host||!['127.0.0.1','localhost'].includes(host)) throw new Error('Local access only');
  const origin=request.headers.get('origin');
  if(origin && origin!==`${u.protocol}//${request.headers.get('host')}`) throw new Error('Cross-origin request blocked');
  if(['POST','PUT','PATCH','DELETE'].includes(request.method)&&request.headers.get('sec-fetch-site')==='cross-site') throw new Error('Cross-site request blocked');
}
