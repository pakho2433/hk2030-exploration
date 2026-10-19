// Optional rehearsal backup. Cold Unity downloads are never copied by this module.
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
const digest = async buffer => [...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(n=>n.toString(16).padStart(2,'0')).join('');
export async function packageFor(manifest,texture,manifestText){
  if(!/^[a-f0-9]{16}$/.test(manifest.packageId||'')||!Array.isArray(manifest.shellAssets))return null;
  const selected=texture||manifest,format=texture?'astc':'generic';
  const text=new TextEncoder().encode(manifestText);
  return {cacheId:`hk2030-v6-${manifest.packageId}-${format}`,version:manifest.version,files:[
    ...manifest.shellAssets,
    {url:'/unity-manifest.json',bytes:text.byteLength,sha256:await digest(text),kind:'shell'},
    {url:manifest.loaderUrl,...manifest.loaderIntegrity,kind:'shell'},
    {url:selected.dataUrl||manifest.config.dataUrl,bytes:selected.dataBytes,sha256:selected.dataSha256,kind:'data'},
    {url:manifest.config.frameworkUrl,...manifest.frameworkIntegrity,kind:'script'},
    {url:manifest.config.codeUrl,...manifest.codeIntegrity,kind:'wasm'}
  ]};
}
export function createOfflineBackup(){
  let worker=null,available=false,saveGeneration=0,activeSave=null;
  const connection=(async()=>{
    if(!('serviceWorker' in navigator)||!window.isSecureContext)return false;
    try{
      await navigator.serviceWorker.register('sw.js',{scope:'./',updateViaCache:'none'});
      await Promise.race([navigator.serviceWorker.ready,delay(2500)]);
      if(!navigator.serviceWorker.controller){
        await Promise.race([new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true})),delay(1500)]);
      }
      // Use the worker controlling fetches, even while an update is being activated.
      worker=navigator.serviceWorker.controller;
      available=Boolean(worker);
      return available;
    }catch{return false;}
  })();
  async function rpc(type,pkg,progress,timeout=6000,save=null){
    if(!await Promise.race([connection,delay(4500).then(()=>false)]))return {available:false,complete:false};
    if(save&&save.token!==saveGeneration)return {available:true,complete:false,cancelled:true};
    const target=navigator.serviceWorker.controller||worker;
    if(!target)return {available:false,complete:false};
    if(save)save.worker=target;
    return new Promise((resolve,reject)=>{
      const channel=new MessageChannel();
      const timer=setTimeout(()=>{
        if(type==='SAVE')try{target.postMessage({type:'CANCEL',package:pkg});}catch{}
        channel.port1.close();reject(new Error('離線備用檢查逾時'));
      },timeout);
      channel.port1.onmessage=event=>{
        const message=event.data||{};
        if(message.type==='progress'){progress?.(message);return;}
        clearTimeout(timer);channel.port1.close();
        if(message.error)reject(new Error(message.error));else resolve(message);
      };
      try{target.postMessage({type,package:pkg},[channel.port2]);}
      catch(error){clearTimeout(timer);channel.port1.close();reject(error);}
    });
  }
  return {
    get available(){return available;},
    check:pkg=>pkg?rpc('CHECK',pkg):Promise.resolve({available:false,complete:false}),
    save:async(pkg,progress)=>{
      const save={token:++saveGeneration,pkg,worker:null};activeSave=save;
      try{return await rpc('SAVE',pkg,progress,180000,save);}
      finally{if(activeSave===save)activeSave=null;}
    },
    cancel:pkg=>{
      saveGeneration++;
      const target=activeSave?.worker;const boundPackage=activeSave?.pkg||pkg;
      activeSave=null;
      if(target&&boundPackage)try{target.postMessage({type:'CANCEL',package:boundPackage});}catch{}
    }
  };
}
