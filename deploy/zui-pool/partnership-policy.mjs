// Partnership deadlines govern delegated management, never device playback.
export function partnershipExpiry(value) {
 if(value==null||value==='')return null;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value)))throw Error('Data de vencimento inválida.');
 const t=Date.parse(value+'T23:59:59.999-03:00');
 if(!Number.isFinite(t)||new Date(t-3*3600000).toISOString().slice(0,10)!==value)throw Error('Data de vencimento inválida.');
 return t;
}
export function partnershipActive(server,now=Date.now()){return !server.partnerExpiresAt||Number(server.partnerExpiresAt)>now;}
export function partnershipDate(t){return t?new Date(t).toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'}):'';}