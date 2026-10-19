// Refresh the offline-backup integrity data in unity-manifest.json.
// Run after editing any shell file (index.html, app.js, CSS, data modules, content/*):
//   node scripts/update-manifest.mjs
// The service worker rejects a saved backup whose bytes or SHA-256 differ from
// these entries, so stale values make "保存離線備用" fail.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifestPath=path.join(root,'unity-manifest.json');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
let changed=0;
for(const asset of manifest.shellAssets){
  const pathname=new URL(asset.url,'https://local').pathname;
  const file=path.join(root,pathname==='/'?'index.html':pathname.slice(1));
  const bytes=readFileSync(file);
  const next={bytes:bytes.byteLength,sha256:sha(bytes)};
  if(next.bytes!==asset.bytes||next.sha256!==asset.sha256){changed++;console.log('updated',asset.url);}
  Object.assign(asset,next);
}
// A new package id gives each content version its own offline cache.
if(manifest.packageId)manifest.packageId=sha(JSON.stringify([manifest.runtimeSha256,manifest.shellAssets])).slice(0,16);
writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(`${changed} shell asset(s) changed; packageId ${manifest.packageId||'(none: offline backup disabled)'}`);
