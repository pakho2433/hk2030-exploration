/* Public game files only. Each rehearsal package has an immutable content identity. */
const CATALOG='hk2030-v6-catalog',CATALOG_URL='/__hk2030_cache_catalog__';
const jobs=new Map();
const SHELL=new Set(['/','/index.html','/app.js','/styles.css','/presentation.css','/tour-data.js','/npc-dialogues.js','/presentation-data.js','/offline-backup.js','/unity-manifest.json','/content/sources.json','/content/hk-coastline.geojson']);
for(const key of ['history','technology','sports','two_systems'])SHELL.add(`/content/exhibits-v39/${key}.png`);
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
const absolute=url=>new URL(url,self.location.origin).href;
function validPackage(pkg){
  if(!pkg||!/^hk2030-v6-[a-f0-9]{16}-(generic|astc)$/.test(pkg.cacheId)||typeof pkg.version!=='string'||!Array.isArray(pkg.files)||pkg.files.length<10||pkg.files.length>20)return false;
  const urls=new Set();let data=0,wasm=0,framework=0,loader=0;
  for(const file of pkg.files){
    if(typeof file.url!=='string'||!file.url.startsWith('/')||file.url.startsWith('//')||file.url.includes('..')||!Number.isSafeInteger(file.bytes)||file.bytes<=0||!/^[a-f0-9]{64}$/.test(file.sha256))return false;
    const url=new URL(file.url,self.location.origin);
    if(url.origin!==self.location.origin||url.hash||urls.has(url.href))return false;
    // Packages use one canonical document key. /index.html requests alias it below.
    if(url.pathname==='/index.html')return false;
    const native=/^\/unity\/v6-[a-f0-9]{16}\/Build\/game(?:\.astc)?\.(?:data\.gz|framework\.js\.gz|wasm\.gz|loader\.js)$/.test(url.pathname);
    // packageFor describes decoded bytes; only native scene data gets the larger allowance.
    const sceneData=file.kind==='data'&&/^\/unity\/v6-[a-f0-9]{16}\/Build\/game(?:\.astc)?\.data\.gz$/.test(url.pathname);
    if(file.bytes>(sceneData?250000000:128*1024*1024))return false;
    if(!native&&!SHELL.has(url.pathname))return false;
    if(url.search&&url.search!=='?v=6')return false;
    if(file.kind==='data')data++;if(file.kind==='wasm')wasm++;
    if(url.pathname.endsWith('.framework.js.gz'))framework++;
    if(url.pathname.endsWith('.loader.js'))loader++;
    urls.add(url.href);
  }
  return data===1&&wasm===1&&framework===1&&loader===1;
}
async function catalog(){
  const cache=await caches.open(CATALOG),response=await cache.match(CATALOG_URL);
  if(!response)return {packages:[]};
  try{const value=await response.json();return Array.isArray(value.packages)?value:{packages:[]};}catch{return {packages:[]};}
}
async function saveCatalog(value){const cache=await caches.open(CATALOG);await cache.put(CATALOG_URL,new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}}));}
async function verifiedBytes(response,file){
  if(!response||!response.ok)throw new Error('備用檔案缺漏：'+file.url);
  const type=(response.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase();
  const pathname=new URL(file.url,self.location.origin).pathname;
  const allowed=file.kind==='wasm'?['application/wasm']:file.kind==='data'?['application/gzip','application/octet-stream']:
    /\.js(?:\.gz)?$/.test(pathname)?['application/javascript','text/javascript']:
    pathname.endsWith('.css')?['text/css']:pathname.endsWith('.geojson')?['application/geo+json','application/json']:
    pathname.endsWith('.png')?['image/png']:pathname.endsWith('.json')?['application/json']:['text/html'];
  if(!allowed.includes(type))throw new Error('備用檔案類型不符：'+file.url+' ('+type+')');
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength!==file.bytes||await sha(bytes)!==file.sha256)throw new Error('備用檔案版本不符：'+file.url);
  const head=new Uint8Array(bytes,0,Math.min(16,bytes.byteLength));
  if(file.kind==='data'&&new TextDecoder().decode(head)!=='UnityWebData1.0\0')throw new Error('地圖檔案不完整');
  if(file.kind==='wasm'&&!(head[0]===0&&head[1]===97&&head[2]===115&&head[3]===109))throw new Error('地圖程式檔案不完整');
  return bytes;
}
function decodedResponse(bytes,file,response){
  const mime=response.headers.get('Content-Type')||'application/octet-stream';
  // Fetch has already decoded gzip. Cached responses contain the actual decoded bytes.
  return new Response(bytes,{headers:{'Content-Type':mime,'Content-Length':String(bytes.byteLength),'X-HK2030-Backup':'verified'}});
}
async function removePackage(cacheId){
  const value=await catalog();value.packages=value.packages.filter(pkg=>pkg.cacheId!==cacheId);
  await saveCatalog(value);await caches.delete(cacheId);
}
async function checkPackage(pkg){
  const value=await catalog(),record=value.packages.find(item=>item.cacheId===pkg.cacheId);
  if(!record||JSON.stringify(record.files)!==JSON.stringify(pkg.files)||record.version!==pkg.version)return false;
  const cache=await caches.open(pkg.cacheId);
  try{for(const file of pkg.files)await verifiedBytes(await cache.match(absolute(file.url)),file);return true;}
  catch{await removePackage(pkg.cacheId);return false;}
}
async function savePackage(pkg,port){
  if(jobs.has(pkg.cacheId))throw new Error('這個版本已在保存中');
  const job={controller:new AbortController(),cancelled:false};jobs.set(pkg.cacheId,job);
  try{
    // The catalog is written last, so partial/failed saves can never become ready.
    const old=await catalog();old.packages=old.packages.filter(item=>item.cacheId!==pkg.cacheId);await saveCatalog(old);
    await caches.delete(pkg.cacheId);const cache=await caches.open(pkg.cacheId);
    for(let i=0;i<pkg.files.length;i++){
      if(job.cancelled)throw new Error('離線保存已取消');
      const file=pkg.files[i],response=await fetch(absolute(file.url),{cache:file.kind==='shell'?'reload':'force-cache',credentials:'omit',signal:job.controller.signal});
      const bytes=await verifiedBytes(response,file);
      if(job.cancelled)throw new Error('離線保存已取消');
      await cache.put(absolute(file.url),decodedResponse(bytes,file,response));
      port?.postMessage({type:'progress',done:i+1,total:pkg.files.length});
    }
    if(job.cancelled)throw new Error('離線保存已取消');
    const value=await catalog();value.packages=value.packages.filter(item=>item.cacheId!==pkg.cacheId);
    value.packages.unshift({...pkg,savedAt:Date.now()});await saveCatalog(value);
    return true;
  }catch(error){await removePackage(pkg.cacheId);throw error;}
  finally{jobs.delete(pkg.cacheId);}
}
self.addEventListener('message',event=>{
  const message=event.data||{},pkg=message.package,port=event.ports?.[0];
  if(!validPackage(pkg)){port?.postMessage({error:'未能確認這個備用版本'});return;}
  if(message.type==='CANCEL'){const job=jobs.get(pkg.cacheId);if(job){job.cancelled=true;job.controller.abort();}return;}
  event.waitUntil((async()=>{
    try{
      if(message.type==='CHECK')port?.postMessage({available:true,complete:await checkPackage(pkg)});
      else if(message.type==='SAVE')port?.postMessage({available:true,complete:await savePackage(pkg,port)});
      else port?.postMessage({error:'未支援的備用操作'});
    }catch(error){port?.postMessage({available:true,complete:false,error:String(error.message||error)});}
  })());
});
async function cachedFile(key){
  const value=await catalog();
  for(const pkg of value.packages){
    if(!validPackage(pkg))continue;
    const file=pkg.files.find(item=>absolute(item.url)===key);if(!file)continue;
    const cache=await caches.open(pkg.cacheId),response=await cache.match(key);
    try{return decodedResponse(await verifiedBytes(response,file),file,response);}
    catch{await removePackage(pkg.cacheId);}
  }
  return null;
}
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.hash)return;
  const native=/^\/unity\/v6-[a-f0-9]{16}\/Build\//.test(url.pathname);
  const shell=SHELL.has(url.pathname)&&(!url.search||url.search==='?v=6');
  if(!native&&!shell)return;
  const key=absolute(url.pathname==='/'||url.pathname==='/index.html'?'/':url.pathname+url.search);
  event.respondWith((async()=>{
    if(native){const cached=await cachedFile(key);return cached||fetch(request);}
    // Always obtain the current online shell; an offline fallback is an exact saved file.
    try{const response=await fetch(request);if(response.ok)return response;const cached=await cachedFile(key);return cached||response;}
    catch(error){const cached=await cachedFile(key);if(cached)return cached;throw error;}
  })());
});
