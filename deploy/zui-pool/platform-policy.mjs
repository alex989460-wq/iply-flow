// Public catalogue metadata only: never changes installed clients or device identity.
export const PLATFORM_DEFAULTS = [
 {id:'windows',name:'Computadores Windows',icon:'windows',status:'available',description:'ZUI Player disponível para PC na Microsoft Store.',url:'https://apps.microsoft.com/detail/9NX9KT313W7P',visible:true},
 {id:'xbox',name:'Xbox',icon:'xbox',status:'pending',description:'A loja ainda informa compatibilidade apenas com PC. Disponibilidade no Xbox em confirmação.',url:'https://apps.microsoft.com/detail/9NX9KT313W7P',visible:true},
 {id:'lg',name:'LG webOS',icon:'lg',status:'guided',description:'Instalação orientada conforme modelo e região.',url:'',visible:true},
 {id:'roku',name:'Roku TV',icon:'roku',status:'available',description:'ZUI Player disponível para Roku.',url:'',visible:true},
 {id:'android',name:'Android / Android TV',icon:'android',status:'pending',description:'Disponibilidade de pacote a confirmar.',url:'',visible:true},
 {id:'samsung',name:'Samsung Tizen',icon:'samsung',status:'pending',description:'Consulte a compatibilidade com o modelo da sua TV.',url:'',visible:true},
 {id:'apple',name:'iPhone / iPad / macOS',icon:'apple',status:'pending',description:'Aplicativo nativo ainda não confirmado.',url:'',visible:true},
 {id:'firetv',name:'Fire TV',icon:'amazonfiretv',status:'pending',description:'Disponibilidade de pacote a confirmar.',url:'',visible:true},
 {id:'linux',name:'Linux',icon:'linux',status:'pending',description:'Pacote nativo ainda não confirmado.',url:'',visible:true}
];
export function platformUrl(value) {
 const text=String(value||'').trim();
 if(!text)return '';
 if(text.length>1000)throw Error('Link muito longo.');
 let u;try{u=new URL(text);}catch{throw Error('Use um link HTTPS válido.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||/^(localhost|.*\.local|.*\.internal)$/i.test(u.hostname)||u.hostname.includes(':')||/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname))throw Error('Use um link HTTPS público, sem credenciais.');
 return u.href;
}
export function validatePlatform(input) {
 const base=PLATFORM_DEFAULTS.find(p=>p.id===input?.id);if(!base)throw Error('Plataforma inválida.');
 if(!['available','guided','pending','unavailable'].includes(input.status))throw Error('Situação inválida.');
 if(typeof input.visible!=='boolean')throw Error('Visibilidade inválida.');
 const description=String(input.description||'').trim();if(description.length>300)throw Error('Descrição: máximo de 300 caracteres.');
 return {...base,status:input.status,visible:input.visible,description,url:platformUrl(input.url)};
}
export function platformCatalogue(db) {
 return PLATFORM_DEFAULTS.map(base=>{
  try{return validatePlatform({...base,...db.settings?.platforms?.[base.id],id:base.id});}catch{return {...base};}
 });
}