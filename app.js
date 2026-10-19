import {stops} from './tour-data.js?v=7';
import {getNpcDialogue} from './npc-dialogues.js?v=7';
import {presentationFor} from './presentation-data.js?v=7';
import {createOfflineBackup,packageFor} from './offline-backup.js?v=7';
const $ = id => document.getElementById(id);
let unity=null,ready=false,sceneReady=false,exploring=false,activeStop='harbour',year=2030,animationToken=0,toastTimer,finaleStarted=false,transitioning=false;
let lookX=0,lookY=0,moveX=0,moveY=0,lastSentMoveX=0,lastSentMoveY=0,forceNextInput=true,sourceDocument=null;
let progressKey='',interactionBusy=false,presenterOperation=0;
let classroomVR=false,vrEntering=false,vrRequestTimer,vrState={};
let presentationMode=true,greetingTimer,cachePackage=null,savingBackup=false,backupSaved=false,introPlaying=false,backupCheckStarted=false,backupChecking=false;
const backupClient=createOfflineBackup();
let lastNpcTalkSerial=0,currentNpcTopic='intro';
let loadProgress=0,loadFailed=false,pendingDeparture=false,loadStalled=false,lastLoadAdvance=Date.now(),loadWatchdog,downloadMegabytes=94;
const preparationNote=()=>`8站一次準備，考察途中不用下載。首次約${downloadMegabytes} MB；演講前先準備好並保持此頁開啟。`;
const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
const send = (method,value='') => {
  if(['ResetTour','BeginFinale','SetPaused','GoToCargoPoint','GoToStop','StartTour','SetInput','EnterClassroomVR','ExitClassroomVR','SelectVRTarget'].includes(method))forceNextInput=true;
  if(unity)unity.SendMessage('HK2030Bridge',method,String(value));
};
function announce(message,{force=false}={}){
  if(presentationMode&&!force&&String(message).length>32)return;
  $('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>$('toast').hidden=true,presentationMode?2800:7200);
}
function departureButton(){
  const button=$('begin-intro'),action=button.dataset.action;
  if(!['prepare','enter'].includes(action))return;
  button.disabled=false;button.setAttribute('aria-disabled','false');button.dataset.loading=String(!ready);
  button.setAttribute('aria-busy',String(!ready&&!loadFailed));
  button.innerHTML=loadFailed?'重新載入地圖':ready?(action==='prepare'?'開始演講 <span aria-hidden="true">↗</span>':'出發考察 <span aria-hidden="true">↗</span>'):pendingDeparture?'準備好後自動出發':`準備演講 · ${Math.round(loadProgress*100)}%`;
}
const inStandby=()=>ready&&!exploring&&!introPlaying&&!$('begin-intro').hidden&&$('begin-intro').dataset.action==='prepare';
function backupControls(){
  const button=$('offline-save');
  button.hidden=!(inStandby()&&cachePackage&&backupClient.available);
  $('backup-status').hidden=!inStandby();
  button.disabled=savingBackup||backupSaved||backupChecking;
  button.textContent=savingBackup?'保存中…':backupSaved?'離線備用已保存':'保存離線備用';
  $('experience').dataset.backup=backupSaved?'saved':savingBackup?'saving':'not-saved';
}
function cancelBackup(){if(savingBackup){backupClient.cancel(cachePackage);savingBackup=false;backupSaved=false;$('backup-status').textContent='未保存離線；本頁仍可演講。';backupControls();}}
$('offline-save').addEventListener('click',async()=>{
  if(!inStandby()||savingBackup||backupSaved||backupChecking||!cachePackage||!backupCheckStarted)return;
  delete $('experience').dataset.backupError;savingBackup=true;backupControls();
  try{
    const result=await backupClient.save(cachePackage,progress=>{$('backup-status').textContent=`保存備用 ${progress.done}／${progress.total}`;});
    backupSaved=Boolean(result.complete);$('backup-status').textContent=backupSaved?'已保存這個版本；啟動時仍會檢查完整世界。':'未保存離線；本頁仍可演講。';
  }catch(error){$('experience').dataset.backupError=String(error.message||error);$('backup-status').textContent='未保存離線；本頁已準備好，可照常演講。';backupSaved=false;}
  finally{savingBackup=false;backupControls();}
});
function setLoad(progress,label){
  const next=Math.max(loadProgress,Math.min(1,Math.max(0,progress)));
  if(next>loadProgress){
    lastLoadAdvance=Date.now();$('load-retry').hidden=true;
    if(loadStalled){
      loadStalled=false;
      $('load-note').textContent=pendingDeparture?'已收到出發指令。全部8站準備好後會自動進入，請保持這個頁面開啟。':preparationNote();
    }
  }
  loadProgress=next;
  const percent=Math.round(next*100);
  $('load-fill').style.width=`${percent}%`;
  $('load-track').setAttribute('aria-valuenow',String(percent));
  $('load-label').textContent=label?`${label}${ready?'':` · ${percent}%`}`:`${next<.9?'下載全部考察地圖':'啟動地圖與互動'} · ${percent}%`;
  departureButton();
}
async function replaceIntro(title,description,eyebrow){$('intro-copy').classList.add('changing');await wait(360);$('intro-title').innerHTML=title;$('intro-description').textContent=description;$('intro-eyebrow').textContent=eyebrow;$('intro-copy').classList.remove('changing');}
function clearTimeline(){document.querySelectorAll('#timeline [data-year]').forEach(el=>el.classList.remove('active'));$('timeline-fill').style.width='0%';}
async function finalIntro(token){
  if(token!==animationToken)return;
  $('intro').classList.remove('definition-active');$('intro').classList.add('timeline-active');$('definition-animation').hidden=true;$('timeline').hidden=false;$('journey-art').hidden=true;
  document.querySelectorAll('#timeline [data-year]').forEach(el=>el.classList.add('active'));$('timeline-fill').style.width='100%';
  await replaceIntro('大家預備好到<br><em>2030年的世界了嗎？</em>','跟着器材箱，出發。','下一站 · 未來');
  if(token!==animationToken)return;
  $('begin-intro').dataset.action='enter';introPlaying=false;departureButton();$('begin-intro').hidden=false;$('load-note').hidden=true;$('skip-intro').hidden=true;backupControls();
}
async function playIntro(){
  if(introPlaying)return;
  if(!ready||loadFailed){$('load-note').textContent='正在準備完整世界。準備好後再按「開始演講」。';$('load-note').hidden=false;return;}
  introPlaying=true;cancelBackup();const token=++animationToken;
  $('begin-intro').hidden=true;$('skip-intro').hidden=false;$('load-note').hidden=true;$('offline-save').hidden=true;$('timeline').hidden=true;$('journey-art').hidden=true;clearTimeline();
  $('intro').classList.remove('timeline-active');$('intro').classList.add('definition-active');$('definition-animation').hidden=false;
  await replaceIntro('十五五','第十五個 · 五年規劃','先看這兩個數字');await wait(4200);
  if(token!==animationToken)return;
  $('intro').classList.remove('definition-active');$('intro').classList.add('timeline-active');$('definition-animation').hidden=true;
  await replaceIntro('五年，<br><em>一起向前。</em>','2026 → 2030','時間線');$('timeline').hidden=false;
  for(let i=0;i<5;i++){if(token!==animationToken)return;document.querySelector(`#timeline [data-year="${2026+i}"]`).classList.add('active');$('timeline-fill').style.width=`${i*25}%`;await wait(750);}
  await wait(600);if(token===animationToken)await finalIntro(token);
}
$('begin-intro').addEventListener('click',()=>{
  if(loadFailed){location.reload();return;}
  if($('begin-intro').dataset.action!=='enter'){playIntro();return;}
  if(ready){enterWorld();return;}
  pendingDeparture=true;$('load-note').textContent='已收到出發指令。全部8站準備好後會進入。';$('load-note').hidden=false;departureButton();
});
$('skip-intro').addEventListener('click',()=>{const token=++animationToken;finalIntro(token);});
function enterWorld(){if(!ready||loadFailed)return;cancelBackup();clearGreeting();$('experience').dataset.mode=presentationMode?'presentation':'exploration';lastNpcTalkSerial=0;lastSentMoveX=lastSentMoveY=0;finaleStarted=false;$('map-button').disabled=false;$('reset-button').textContent='返回安全位置';$('next-button').hidden=false;$('interact-button').hidden=false;$('npc-button').hidden=true;$('world-year').disabled=false;exploring=true;document.body.classList.add('exploring');$('intro').hidden=true;$('hud').hidden=false;send('StartTour');send('SetPaused','false');send('SetTurbineMode','history');send('SetYear',year);updateStop('harbour');$('unity-canvas').focus();announce(presentationMode?'走近光圈 · E 看動畫 · F 打招呼':'走近設備按 E 互動；走近路人按 F 或「聊天」。滑鼠左鍵拖曳環顧；手機用左側行走、右側環顧。');}
function showIntroduction(){
  if(classroomVR)exitClassroomVR();
  presenterOperation++;transitioning=false;finaleStarted=false;closeDialogs();send('ResetTour');$('transition').hidden=true;clearGreeting();introPlaying=false;exploring=false;pendingDeparture=false;animationToken++;document.exitPointerLock?.();send('SetPaused','true');document.body.classList.remove('exploring');
  $('hud').hidden=true;$('intro').hidden=false;$('load-note').hidden=false;$('definition-animation').hidden=true;$('timeline').hidden=true;$('journey-art').hidden=false;
  $('intro').classList.remove('definition-active','timeline-active');$('begin-intro').dataset.action='prepare';$('begin-intro').hidden=false;$('skip-intro').hidden=true;
  replaceIntro('一箱器材，<br><em>看見下一個五年。</em>','先準備整個世界，再由你帶大家出發。','學生考察小隊 · 2026 — 2030');departureButton();backupControls();
}
$('restart-button').addEventListener('click',showIntroduction);
function stopInfo(id){return stops.find(s=>s.id===id)||stops[0];}
function updateStop(id,state={}){
  activeStop=id;const s=stopInfo(id),meta=presentationFor(id);
  $('control-help').textContent=presentationMode?'WASD 行走 · 拖曳環顧 · E 看動畫 · F 打招呼':'WASD 行走 · 拖曳環顧 · E 操作 · F 聊天';
  $('station-name').textContent=s.name;$('station-kicker').textContent=s.theme;$('station-description').textContent=s.description;$('region-label').textContent=s.region;$('year-note').textContent=presentationMode?meta.kind:s.status;
  $('interact-button').replaceChildren(document.createTextNode((presentationMode?meta.action:s.action)+' '));
  if(!matchMedia('(pointer:coarse)').matches){const k=document.createElement('kbd');k.textContent='E';$('interact-button').append(k);}
  $('demo-stages').replaceChildren();for(const [key,label] of meta.stages){const node=document.createElement('span');node.dataset.stage=key;node.textContent=label;$('demo-stages').append(node);}
  $('notes-title').textContent=s.name;$('notes-cue').textContent=meta.cue;$('notes-kind').textContent=s.status;$('notes-body').textContent=s.description;
  document.querySelectorAll('[data-stop]').forEach(el=>el.setAttribute('aria-current',el.dataset.stop===id?'location':'false'));
  renderVRControls();
  $('exhibit-button').hidden=id!=='museum'||finaleStarted;
  if(id==='classroom')preloadVRDonning();
}
function renderVRControls(){
  const inClass=exploring&&activeStop==='classroom'&&!finaleStarted;
  $('vr-button').hidden=!inClass||classroomVR;
  $('vr-button').disabled=interactionBusy||transitioning||vrEntering;
  $('vr-exit-button').hidden=!classroomVR||!exploring;
  $('vr-progress').hidden=!classroomVR||!exploring;
  $('next-button').hidden=finaleStarted||classroomVR;
  $('map-button').disabled=transitioning;
  $('world-year').disabled=finaleStarted||classroomVR;
  $('reset-button').hidden=classroomVR;
  $('experience').dataset.vrActive=String(classroomVR);
  $('vr-targets').hidden=!classroomVR||!exploring;
  if(!classroomVR){$('interact-button').disabled=interactionBusy||vrEntering;return;}
  const visited=Number.isFinite(vrState.vrVisited)?Math.max(0,vrState.vrVisited):0;
  const total=Number.isFinite(vrState.vrTaskTotal)?Math.max(1,vrState.vrTaskTotal):11;
  const actions={overview:'由太陽開始',sun:'觀察太陽',mercury:'觀察水星',venus:'觀察金星',earth:'觀察地球',mars:'觀察火星',jupiter:'觀察木星',saturn:'觀察土星',uranus:'觀察天王星',neptune:'觀察海王星',orbit:'觀察真實衛星',moon:'觀看月球採樣',complete:'探索完成'};
  $('vr-targets').hidden=!classroomVR||!exploring;
  $('vr-targets').querySelectorAll('button').forEach(b=>{b.disabled=interactionBusy;b.setAttribute('aria-pressed',String(b.dataset.vrTarget===vrState.vrStage));});
  $('station-name').textContent='太陽系 VR 探索';$('station-kicker').textContent='沉浸學習';
  $('station-description').textContent='選擇天體近距離觀察，探索太陽、八大行星、衛星與月球採樣。';
  $('year-note').textContent='大小・距離・時間為教學調整';
  $('vr-progress').textContent=`太空觀察 ${Math.min(visited,total)}／${total}`;
  $('interact-button').replaceChildren(document.createTextNode(actions[vrState.vrStage]||'探索太空'));
  if(!matchMedia('(pointer:coarse)').matches){const k=document.createElement('kbd');k.textContent='E';$('interact-button').append(k);}
  $('interact-button').disabled=interactionBusy||vrState.vrInteractable===false||vrState.vrStage==='complete';
  $('control-help').textContent='WASD 行走 · 拖曳環顧 · E 觀察 · 返回課室離開';
  $('npc-button').hidden=true;$('demo-progress').hidden=true;
}
function updateVRState(state){
  if(typeof state.vrActive!=='boolean')return;
  const changed=classroomVR!==state.vrActive;classroomVR=state.vrActive;
  for(const key of ['vrStage','vrVisited','vrTaskTotal','vrInteractable'])if(state[key]!==undefined)vrState[key]=state[key];
  for(const key of ['vrStage','vrVisited','vrTaskTotal'])if(state[key]!==undefined)$('unity-canvas').dataset[key]=String(state[key]);
  $('unity-canvas').dataset.vrActive=String(classroomVR);
  if(vrEntering&&classroomVR){vrEntering=false;clearTimeout(vrRequestTimer);}
  if(changed){clearGreeting();moveX=moveY=lookX=lookY=0;if(!classroomVR)updateStop(activeStop);}
  renderVRControls();
}
function enterClassroomVR(){
  if(!ready||!exploring||activeStop!=='classroom'||classroomVR||vrEntering||interactionBusy||transitioning||finaleStarted)return;
  clearGreeting();closeDialogs();moveX=moveY=lookX=lookY=0;vrEntering=true;renderVRControls();
  send('SetInput',JSON.stringify({moveX:0,moveY:0,lookX:0,lookY:0}));
  // First-person "put on the headset" overlay; the scene switches while the view is dark.
  playVRDonning(()=>{
    if(!vrEntering||!exploring||activeStop!=='classroom'||classroomVR)return false;
    send('EnterClassroomVR');$('unity-canvas').focus();
    vrRequestTimer=setTimeout(()=>{if(!classroomVR){vrEntering=false;renderVRControls();announce('太空體驗暫未開啟，請再試一次。',{force:true});}},3000);
    return true;
  });
}
let vrDonningFrame=0,vrVideoPreloaded=false;
// Generated first-person clip (hands lift the headset to the eyes, ends black).
const VR_VIDEO_COVER_S=3.7,VR_REVEAL_MS=700;
function preloadVRDonning(){
  if(vrVideoPreloaded||matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  vrVideoPreloaded=true;const video=$('vr-donning-video');video.preload='auto';video.load();
}
function playVRDonning(onCovered){
  const overlay=$('vr-donning'),video=$('vr-donning-video'),rig=overlay.querySelector('.vr-donning-rig'),shade=overlay.querySelector('.vr-donning-shade'),caption=overlay.querySelector('.vr-donning-caption');
  if(matchMedia('(prefers-reduced-motion:reduce)').matches||video.error){playVRDonningSVG(onCovered);return;}
  cancelAnimationFrame(vrDonningFrame);
  let done=false,covered=false,started=false,revealStart=0;
  const finish=()=>{overlay.style.background='';done=true;cancelAnimationFrame(vrDonningFrame);video.pause();video.hidden=true;video.style.opacity='';overlay.hidden=true;rig.hidden=false;caption.hidden=false;shade.style.cssText='';};
  const fallback=()=>{if(done||started)return;done=true;video.pause();video.hidden=true;rig.hidden=false;caption.hidden=false;playVRDonningSVG(onCovered);};
  overlay.hidden=false;rig.hidden=true;caption.hidden=true;video.hidden=false;video.style.opacity='0';
  shade.style.setProperty('--vr-dark','0');shade.style.setProperty('--vr-lens','-12%');
  const startedAt=performance.now();
  const cover=()=>{if(covered)return;covered=true;overlay.style.background='';shade.style.setProperty('--vr-dark','1');video.hidden=true;onCovered();revealStart=performance.now();};
  const frame=()=>{
    if(done)return;const now=performance.now();
    if(!started&&now-startedAt>1500){fallback();return;}
    if(started&&!covered){
      const fade=Math.min(1,video.currentTime/.25);video.style.opacity=String(fade);overlay.style.background=`rgba(2,6,10,${fade})`;
      if(video.currentTime>=VR_VIDEO_COVER_S||video.ended||now-startedAt>8000)cover();
    }
    if(covered){
      const t=Math.min(1,(now-revealStart)/VR_REVEAL_MS),reveal=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
      shade.style.setProperty('--vr-lens',`${reveal*152-12}%`);
      if(t>=1){finish();return;}
    }
    vrDonningFrame=requestAnimationFrame(frame);
  };
  video.onerror=fallback;
  video.onplaying=()=>{if(done){video.pause();return;}started=true;};
  try{video.currentTime=0;}catch{}
  const playing=video.play();
  if(playing?.catch)playing.catch(fallback);
  vrDonningFrame=requestAnimationFrame(frame);
}
function playVRDonningSVG(onCovered){
  const overlay=$('vr-donning'),rig=overlay.querySelector('.vr-donning-rig'),shade=overlay.querySelector('.vr-donning-shade'),caption=overlay.querySelector('.vr-donning-caption');
  cancelAnimationFrame(vrDonningFrame);overlay.hidden=false;
  const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches,total=reduced?1200:3400,coverAt=reduced?500:2250;
  const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2,seg=(t,a,b)=>Math.min(1,Math.max(0,(t-a)/(b-a))),mix=(a,b,k)=>a+(b-a)*k;
  let start=performance.now(),covered=false,entered=true;
  const frame=()=>{const now=performance.now();
    const t=(now-start)*(reduced?3400/1200:1);
    // Rise into view, lift to eye level, then fill the screen.
    const rise=ease(seg(t,0,600)),lift=ease(seg(t,600,1600)),close=ease(seg(t,1600,2300));
    const y=mix(mix(120,38,rise),0,lift),scale=mix(mix(.85,1.35,lift),6.5,close);
    rig.style.transform=`translate(-50%,-50%) translateY(${y}%) scale(${scale})`;
    rig.style.opacity=String(1-seg(t,2250,2450));
    const dark=seg(t,1500,2250),reveal=ease(seg(t,2700,3400));
    shade.style.setProperty('--vr-dark',String(dark));shade.style.setProperty('--vr-lens',`${reveal*152-12}%`);caption.style.opacity=String(1-reveal);
    if(!covered&&now-start>=coverAt){covered=true;entered=onCovered()!==false;if(!entered)start=now-2700/(reduced?3400/1200:1);}
    if(t<3400)vrDonningFrame=requestAnimationFrame(frame);
    else{overlay.hidden=true;rig.style.cssText='';shade.style.cssText='';caption.style.cssText='';}
  };
  vrDonningFrame=requestAnimationFrame(frame);
}
function exitClassroomVR(){
  if(!classroomVR)return;
  closeDialogs();moveX=moveY=lookX=lookY=0;send('ExitClassroomVR');$('unity-canvas').focus();
}
const vrTargets=[['overview','全景'],['sun','太陽'],['mercury','水星'],['venus','金星'],['earth','地球'],['mars','火星'],['jupiter','木星'],['saturn','土星'],['uranus','天王星'],['neptune','海王星'],['orbit','人造衛星'],['moon','月球採樣']];
for(const [key,label] of vrTargets){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.vrTarget=key;b.setAttribute('aria-pressed','false');b.addEventListener('click',()=>{if(classroomVR&&!interactionBusy){send('SelectVRTarget',key);$('unity-canvas').focus();}});$('vr-targets').append(b);}
$('vr-button').addEventListener('click',enterClassroomVR);
$('vr-exit-button').addEventListener('click',exitClassroomVR);
function checkReady(){
  if(unity&&sceneReady&&!ready&&!loadFailed){
    ready=true;$('experience').dataset.ready='true';clearInterval(loadWatchdog);$('load-retry').hidden=true;send('SetPaused','true');send('SetTurbineMode','history');setLoad(1,'完整世界已準備好');
    $('load-note').textContent='8站已準備好。演講途中不用下載場景；請保持此頁開啟。';checkBackupInStandby();backupControls();
    if(pendingDeparture&&$('begin-intro').dataset.action==='enter'){pendingDeparture=false;enterWorld();}
  }
}
function checkBackupInStandby(){
  if(!cachePackage||backupCheckStarted||!inStandby())return;
  backupCheckStarted=true;backupChecking=true;backupControls();
  backupClient.check(cachePackage).then(result=>{backupSaved=Boolean(result.complete);$('backup-status').textContent=backupSaved?'此版本已有離線備用。':'';backupControls();})
    .catch(()=>{$('backup-status').textContent='';backupControls();}).finally(()=>{backupChecking=false;backupControls();});
}
function updateProgress(state){$('tour-progress').textContent=autoTourLabel();document.querySelectorAll('#stop-list [data-stop]').forEach((button,i)=>{button.classList.remove('completed');button.firstElementChild.textContent=String(i+1).padStart(2,'0');button.title='自行選擇此站，可隨時轉站';});}
window.addEventListener('hk2030-state',event=>{let s=event.detail;try{if(typeof s==='string')s=JSON.parse(s);}catch{return;}if(!s||typeof s!=='object')return;if(s.ready){sceneReady=true;checkReady();}if(typeof s.busy==='boolean'){interactionBusy=s.busy;$('next-button').disabled=false;$('interact-button').disabled=interactionBusy;document.querySelectorAll('#stop-list [data-stop]').forEach(button=>button.disabled=false);}updateVRState(s);updateCargoDestination(s);updateDemoState(s);updateNpcState(s);if(Array.isArray(s.visitedIds))updateProgress(s);if(s.stopId&&s.stopId!==activeStop)updateStop(s.stopId,s);if(s.year&&String(s.year)!==$ ('world-year').value){year=Number(s.year);$('world-year').value=String(year);}if(s.message&&s.message!==window.__lastWorldMessage){window.__lastWorldMessage=s.message;if(exploring)announce(s.message);}window.__hk2030State=s;renderVRControls();});
async function beginFinale(){if(!exploring||transitioning)return;const op=++presenterOperation;finaleStarted=true;clearGreeting();transitioning=true;closeDialogs();document.exitPointerLock?.();moveX=moveY=lookX=lookY=0;clearTimeout(vrRequestTimer);vrEntering=false;if(classroomVR)send('ExitClassroomVR');send('SetPaused','true');$('transition-name').textContent='返回維多利亞港';$('transition-region').textContent='演講者選擇 · 播放煙花';$('transition').hidden=false;await wait(900);if(op!==presenterOperation)return;year=2030;$('world-year').value='2030';send('SetYear',year);send('BeginFinale');activeStop='harbour';$('station-kicker').textContent='演講者自行選擇';$('station-name').textContent='維港，下一個五年';$('station-description').textContent='由你決定何時播放煙花、繼續考察或結束演講。';$('next-button').hidden=true;$('interact-button').hidden=true;$('exhibit-button').hidden=true;$('world-year').disabled=true;$('year-note').textContent='2030願景 · 煙花';$('map-button').disabled=false;$('reset-button').textContent='返回考察';await wait(550);if(op!==presenterOperation)return;$('transition').hidden=true;transitioning=false;announce('煙花播放中 · 可繼續考察或結束演講');}
function interact(){
  if(activeStop==='kwai'&&!interactionBusy&&!transitioning){goToCargoPoint('follow');return;}
  if(!classroomVR&&window.__hk2030State?.interactable===false&&!interactionBusy)announce('走近光圈，再啟動示範',{force:true});
  send('Interact');
}
function updateDemoState(state){
  const sampler=$('soil-sampler-status');
  sampler.hidden=!(exploring&&activeStop==='lamma'&&state.busy&&['soil','analyse'].includes(state.demoStage));
  if(!sampler.hidden){const labels={dig:`反覆掘土 · 已封存 ${state.soilSampleCount||0}／3 瓶`,transport:'運送密封樣本至實驗室',handoff:'實驗室接收樣本',return:`已送達 ${state.soilDeliveredCount||0} 瓶 · 返回再採樣`};const label=labels[state.soilSamplerStage]||'自動採樣循環';if(sampler.textContent!==label)sampler.textContent=label;}
  const fertilizer=$('fertilizer-status');
  fertilizer.hidden=!(exploring&&activeStop==='lamma'&&state.busy&&state.demoStage==='fertilise');
  if(!fertilizer.hidden){const label=state.fertilizerSpraying?`田區 ${String.fromCharCode(65+state.fertilizerZone)} · 模擬噴量 ${state.fertilizerRate}%`:'田間空隙 · 噴嘴已關閉';if(fertilizer.textContent!==label)fertilizer.textContent=label;}
  $('demo-progress').hidden=!state.busy||!exploring||finaleStarted||classroomVR;
  if(Number.isFinite(state.demoProgress)){$('demo-fill').style.width=`${Math.max(0,Math.min(1,state.demoProgress))*100}%`;$('unity-canvas').dataset.demoProgress=String(state.demoProgress);}
  if(typeof state.demoStage==='string'){$('unity-canvas').dataset.demoStage=state.demoStage;document.querySelectorAll('#demo-stages [data-stage]').forEach(node=>node.classList.toggle('active',node.dataset.stage===state.demoStage));}
  if(!ready&&Number.isFinite(state.prepStep)&&state.prepStep>0){$('load-label').textContent=`準備場景 ${state.prepStep}／${state.prepTotal||stops.length}`;$('unity-canvas').dataset.prepStep=String(state.prepStep);}
}
function clearGreeting(){clearTimeout(greetingTimer);if(!$('npc-greeting').hidden){$('npc-greeting').hidden=true;send('EndTalk');}}
function showGreeting(state){
  clearTimeout(greetingTimer);$('greeting-name').textContent=`${state.npcName||'考察同學'} · 你好！`;$('npc-greeting').hidden=false;
  greetingTimer=setTimeout(()=>{$('npc-greeting').hidden=true;send('EndTalk');},2200);
}
function updateNpcState(state){
  // Read-only runtime diagnostics for checking the loaded scene and frame cost.
  // No diagnostic data is sent to a server or shown over the teaching world.
  for(const key of ['frameMsAvg','visibleActors','activeQuality','antiAliasing','lessonTime','poseRevision','labTime','labPoseRevision','labVideoFrame']){
    if(Number.isFinite(state[key]))$('unity-canvas').dataset[key]=String(state[key]);
  }
  if(Array.isArray(state.position))$('unity-canvas').dataset.playerPosition=JSON.stringify(state.position);
  if(Array.isArray(state.robotPosition))$('unity-canvas').dataset.robotPosition=JSON.stringify(state.robotPosition);
  for(const key of ['robotPhase','classroomPhase','labPhase','labRobotPhase','labVideoStatus'])if(typeof state[key]==='string')$('unity-canvas').dataset[key]=state[key];
  const nearby=Boolean(state.npcNear&&state.npcName&&exploring&&!finaleStarted&&!classroomVR&&!(presentationMode&&activeStop==='classroom'));
  $('npc-button').hidden=!nearby;
  $('npc-button').disabled=interactionBusy||transitioning;
  if(nearby)$('npc-button').textContent=presentationMode?'打招呼':`與${state.npcName}聊天`;
  const serial=Number(state.npcTalkSerial)||0;
  if(state.npcTalking&&serial>lastNpcTalkSerial&&exploring&&!finaleStarted&&!transitioning&&!classroomVR){
    // Mark first: pausing emits another synchronous bridge event.
    lastNpcTalkSerial=serial;
    if(presentationMode)showGreeting(state);else openNpcConversation(state);
  }
}
function appendNpcLine(speaker,text){
  const row=document.createElement('p'),label=document.createElement('b'),copy=document.createElement('span');
  label.textContent=speaker;copy.textContent=text;row.append(label,copy);$('npc-conversation').append(row);
  row.scrollIntoView({block:'nearest',behavior:'auto'});
}
function openNpcConversation(state){
  currentNpcTopic=state.npcTopic||'intro';
  const dialogue=getNpcDialogue(currentNpcTopic);
  $('npc-name').textContent=state.npcName||'海旁路人';
  $('npc-role').textContent=`${state.npcRole||'香港市民'} · 教學對話`;
  $('npc-conversation').replaceChildren();$('npc-questions').replaceChildren();
  appendNpcLine($('npc-name').textContent,dialogue.greeting);
  $('npc-note').textContent=dialogue.note||'2030畫面為教學願景示意。';
  for(const question of dialogue.questions){
    const button=document.createElement('button');button.textContent=question.label;
    button.addEventListener('click',()=>{
      appendNpcLine('你',question.label);appendNpcLine($('npc-name').textContent,question.answer);
      button.disabled=true;
    });$('npc-questions').append(button);
  }
  openDialog('npc-dialog');
}
$('npc-button').addEventListener('click',()=>{if(!interactionBusy&&!transitioning&&!finaleStarted)send('TalkNearest');});
function bindDesktopLook(){const canvas=$('unity-canvas');let pointer=null,point=null;const release=()=>{pointer=null;point=null;};canvas.addEventListener('pointerdown',event=>{if(!exploring||event.button!==0||matchMedia('(pointer:coarse)').matches||document.querySelector('dialog[open]'))return;pointer=event.pointerId;point=[event.clientX,event.clientY];canvas.setPointerCapture(pointer);canvas.focus();event.preventDefault();});canvas.addEventListener('pointermove',event=>{if(event.pointerId!==pointer||!point)return;if(exploring&&!finaleStarted&&!document.querySelector('dialog[open]')){lookX+=event.clientX-point[0];lookY-=event.clientY-point[1];}point=[event.clientX,event.clientY];event.preventDefault();});for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,release);window.addEventListener('blur',release);}
$('interact-button').addEventListener('click',interact);
$('unity-canvas').addEventListener('keydown',event=>{
  if(activeStop!=='kwai'||!exploring||document.querySelector('dialog[open]')||event.repeat||interactionBusy||transitioning)return;
  if(event.code==='KeyE'){event.preventDefault();event.stopImmediatePropagation();interact();}
  else if(event.code==='KeyR'){event.preventDefault();event.stopImmediatePropagation();goToCargoPoint(window.__hk2030State?.cargoDestination||'port');}
});
async function goToStop(id){if(transitioning||!exploring)return;const op=++presenterOperation;if(finaleStarted)enterWorld();clearGreeting();clearTimeout(vrRequestTimer);vrEntering=false;if(classroomVR)send('ExitClassroomVR');transitioning=true;const s=stopInfo(id);closeDialogs();document.exitPointerLock?.();send('SetPaused','true');moveX=moveY=lookX=lookY=0;$('transition-name').textContent=s.name;$('transition-region').textContent=s.region+' · 自選考察';$('transition').hidden=false;await wait(650);if(op!==presenterOperation)return;send('GoToStop',id);updateStop(id);await wait(450);if(op!==presenterOperation)return;$('transition').hidden=true;transitioning=false;send('SetPaused','false');$('unity-canvas').focus();renderVRControls();}
async function goToCargoPoint(choice){
  if(transitioning||!ready||!exploring)return;
  const op=++presenterOperation;if(finaleStarted)enterWorld();clearTimeout(vrRequestTimer);vrEntering=false;if(classroomVR)send('ExitClassroomVR');
  transitioning=true;clearGreeting();closeDialogs();document.exitPointerLock?.();moveX=moveY=lookX=lookY=0;send('SetPaused','true');
  const labels={port:'東莞港口自由探索',follow:'從東莞跟隨貨物出發',airport:'香港機場貨運停機坪',overview:'香港國際機場總覽'};
  $('transition-name').textContent=labels[choice];$('transition-region').textContent=choice==='follow'?'收貨 → 安檢 → 打板 → 海運 → 香港機場':'海空聯運考察 · 自選目的地';$('transition').hidden=false;
  await wait(650);if(op!==presenterOperation)return;send('GoToStop','kwai');updateStop('kwai');send('GoToCargoPoint',choice);await wait(450);if(op!==presenterOperation)return;$('transition').hidden=true;transitioning=false;send('SetPaused','false');$('unity-canvas').focus();
}
document.querySelectorAll('[data-cargo-route]').forEach(b=>b.addEventListener('click',()=>goToCargoPoint(b.dataset.cargoRoute)));
function updateCargoDestination(state){
  if(typeof state.cargoDestination!=='string')return;$('unity-canvas').dataset.cargoDestination=state.cargoDestination;
  document.querySelectorAll('[data-cargo-route]').forEach(b=>{b.disabled=false;b.setAttribute('aria-pressed',String(b.dataset.cargoRoute===state.cargoDestination));});
  if(activeStop!=='kwai')return;
  const labels={port:'香港國際機場東莞空港中心',airport:'香港國際機場 · 貨運停機坪',overview:'香港國際機場 · 三跑道鳥瞰'};
  $('station-name').textContent=labels[state.cargoDestination]||labels.port;
  $('control-help').textContent=state.cargoDestination==='overview'?'鳥瞰教學視角 · 拖曳環顧 · 在地圖選擇目的地':'WASD 行走 · 拖曳環顧 · E 跟隨貨物 · F 交談';
}
$('next-button').addEventListener('click',()=>{const index=stops.findIndex(s=>s.id===activeStop);goToStop(stops[(index+1)%stops.length].id);});
$('reset-button').addEventListener('click',()=>finaleStarted?enterWorld():activeStop==='kwai'?goToCargoPoint(window.__hk2030State?.cargoDestination||'port'):goToStop(activeStop));
$('world-year').addEventListener('change',()=>{year=Number($('world-year').value);send('SetYear',year);announce(`${year}年考察視角。未來變化是教學願景；已有成果和正式計劃保留各自年份。`);});
function openDialog(id){clearGreeting();document.exitPointerLock?.();moveX=moveY=lookX=lookY=0;send('SetInput',JSON.stringify({moveX:0,moveY:0,lookX:0,lookY:0}));send('SetPaused','true');$(id).showModal();}
function closeDialogs(){for(const d of document.querySelectorAll('dialog[open]'))d.close();}
const museumPanels=[['history','國家歷史與發展'],['technology','天宮太空站與香港航天人才'],['sports','體育與拼搏'],['two_systems','一國兩制與交流']];
const museumPanelText={history:'彩色中國地圖展示省級行政區與主要城市，配合開國大典和武漢長江大橋的歷史照片，認識國家發展的歷程。',technology:'天宮太空站由天和核心艙、問天和夢天實驗艙組成，2022年完成T字基本構型，開展微重力和生命科學等研究。香港首位女太空人黎家盈博士是載荷專家，2026年入選神舟二十三號飛行乘組，參與國家航天科研任務。上方合照展示艙內生活，並非黎家盈肖像。',sports:'中國代表團在巴黎2024奧運獲40金、27銀、24銅，共91面獎牌。中國香港代表團獲2金、2銅：張家朗和江旻憓奪金，何詩蓓奪兩銅。榮耀背後是長期訓練、團隊支持和不懈努力。照片涵蓋排球、游泳、劍擊及體育交流，並非全屬巴黎奧運。',two_systems:'香港行政長官與習近平主席會面照片，認識香港與內地的聯繫和交流。'};
function showMuseumPanel(key){const item=museumPanels.find(p=>p[0]===key)||museumPanels[0];$('exhibit-image').src=`content/exhibits-v39/${item[0]}.png`;$('exhibit-image').alt=item[1];$('exhibit-title').textContent=item[1];$('exhibit-description').textContent=museumPanelText[item[0]];document.querySelectorAll('[data-exhibit]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.exhibit===item[0])));}
$('exhibit-button').addEventListener('click',()=>{if(activeStop!=='museum')return;showMuseumPanel('history');openDialog('exhibit-dialog');});
document.querySelectorAll('[data-exhibit]').forEach(b=>b.addEventListener('click',()=>showMuseumPanel(b.dataset.exhibit)));
$('presenter-button').addEventListener('click',()=>{if(exploring)openDialog('presenter-dialog');});
$('presenter-fireworks').addEventListener('click',()=>{if(!transitioning)beginFinale();});
$('presenter-resume').addEventListener('click',()=>{if(transitioning)return;closeDialogs();if(finaleStarted)enterWorld();else send('SetPaused','false');});
$('presenter-end').addEventListener('click',showIntroduction);
$('map-button').addEventListener('click',()=>openDialog('map-dialog'));
$('sources-button').addEventListener('click',()=>openDialog('sources-dialog'));
$('notes-button').addEventListener('click',()=>openDialog('notes-dialog'));
$('notes-sources-button').addEventListener('click',()=>{$('notes-dialog').close();openDialog('sources-dialog');});
$('map-sources-button').addEventListener('click',()=>{$('map-dialog').close();openDialog('sources-dialog');});
$('mode-button').addEventListener('click',()=>{
  clearGreeting();presentationMode=!presentationMode;document.body.classList.toggle('presentation',presentationMode);$('experience').dataset.mode=presentationMode?'presentation':'exploration';
  $('mode-button').setAttribute('aria-pressed',String(presentationMode));$('mode-button').textContent=presentationMode?'演講模式':'自由考察';$('toast').hidden=true;updateStop(activeStop);
});
document.querySelectorAll('.close-dialog').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(d=>{d.addEventListener('close',()=>{if(d.id==='npc-dialog')send('EndTalk');if(exploring&&!transitioning&&!document.querySelector('dialog[open]'))send('SetPaused',finaleStarted?'true':'false');});d.addEventListener('click',event=>{if(event.target===d){const r=d.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)d.close();}});});
$('fullscreen-button').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if($('experience').requestFullscreen)await $('experience').requestFullscreen();else announce('這個瀏覽器未提供全螢幕功能；橫向使用手機可擴大視野。');}catch{announce('可以使用瀏覽器的全螢幕功能，或將手機橫放。');}});
function buildStopList(){const nav=$('stop-list');for(let i=0;i<stops.length;i++){const s=stops[i],b=document.createElement('button');b.dataset.stop=s.id;const n=document.createElement('span');n.textContent=String(i+1).padStart(2,'0');const label=document.createElement('span'),title=document.createElement('b'),region=document.createElement('small');title.textContent=s.name;region.textContent=s.region;label.append(title,region);b.append(n,label);b.addEventListener('click',()=>goToStop(s.id));nav.append(b);}}
async function buildMap(){const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 900 340');svg.setAttribute('role','group');svg.setAttribute('aria-label','香港地理方位與考察站點');const bounds={west:113.83,east:114.31,south:22.19,north:22.40};const xy=([lon,lat])=>[40+(lon-bounds.west)/(bounds.east-bounds.west)*800,310-(lat-bounds.south)/(bounds.north-bounds.south)*285];const pathFromRing=ring=>ring.map((p,i)=>{const[x,y]=xy(p);return`${i?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`;}).join(' ')+'Z';try{const response=await fetch('content/hk-coastline.geojson');if(response.ok){const g=await response.json();const geometries=g.type==='FeatureCollection'?g.features.map(f=>f.geometry):[g.geometry||g];for(const geometry of geometries){const lines=geometry.type==='MultiLineString'?geometry.coordinates:geometry.type==='LineString'?[geometry.coordinates]:[];for(const line of lines){const p=document.createElementNS(ns,'path');p.setAttribute('d',line.map((point,i)=>{const[x,y]=xy(point);return `${i?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`;}).join(' '));p.setAttribute('fill','none');p.setAttribute('stroke','#719388');p.setAttribute('stroke-width','1.3');svg.append(p);}const polygons=geometry.type==='MultiPolygon'?geometry.coordinates:geometry.type==='Polygon'?[geometry.coordinates]:[];for(const polygon of polygons){const p=document.createElementNS(ns,'path');p.setAttribute('d',polygon.map(pathFromRing).join(' '));p.setAttribute('class','land');p.setAttribute('fill-rule','evenodd');svg.append(p);}}}}catch{}const local=stops.filter(s=>s.lat&&s.id!=='classroom');const route=document.createElementNS(ns,'path');route.setAttribute('d',local.map((s,i)=>{const[x,y]=xy([s.lon,s.lat]);return`${i?'L':'M'}${x} ${y}`;}).join(' '));route.setAttribute('class','route');svg.append(route);for(const s of local){const[x,y]=xy([s.lon,s.lat]),group=document.createElementNS(ns,'g'),circle=document.createElementNS(ns,'circle'),text=document.createElementNS(ns,'text');circle.setAttribute('cx',x);circle.setAttribute('cy',y);circle.setAttribute('r',5);circle.setAttribute('class','map-point');const placements={harbour:[32,50,'維多利亞港','start'],polyu:[35,-35,'理工大學實驗室','start'],community:[-35,45,'社區服務示意','end'],culture:[-42,-34,'西九文化','end'],lamma:[30,-18,'歷史風采','start'],lamma_solar:[-22,30,'電廠太陽能','end']};const [dx,dy,label,anchor]=placements[s.id]||[8,-10,s.name,'start'];if(placements[s.id]){const connector=document.createElementNS(ns,'path');connector.setAttribute('d',`M${x} ${y}L${x+dx} ${y+dy-5}`);connector.setAttribute('fill','none');connector.setAttribute('stroke','#8e9d83');connector.setAttribute('stroke-width','.8');group.append(connector);}text.setAttribute('x',x+dx);text.setAttribute('y',y+dy);text.setAttribute('text-anchor',anchor);text.textContent=label;group.append(circle,text);svg.append(group);}const [ax,ay]=xy([113.914603,22.308919]);const airport=document.createElementNS(ns,'g');airport.setAttribute('role','button');airport.setAttribute('tabindex','0');airport.setAttribute('aria-label','前往香港國際機場總覽');airport.setAttribute('class','airport-map-choice');const ac=document.createElementNS(ns,'circle');ac.setAttribute('cx',ax);ac.setAttribute('cy',ay);ac.setAttribute('r','8');ac.setAttribute('fill','#e8bc64');const at=document.createElementNS(ns,'text');at.setAttribute('x',ax+12);at.setAttribute('y',ay-14);at.textContent='香港國際機場 · 選擇考察';airport.append(ac,at);airport.addEventListener('click',()=>goToCargoPoint('overview'));airport.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();goToCargoPoint('overview');}});svg.append(airport);const north=document.createElementNS(ns,'text');north.setAttribute('x',850);north.setAttribute('y',25);north.textContent='北 ↑';svg.append(north);$('geographic-map').append(svg);}
async function loadSources(){try{const response=await fetch('content/sources.json');if(!response.ok)throw Error();sourceDocument=await response.json();const items=Array.isArray(sourceDocument)?sourceDocument:(sourceDocument.sources||[]);for(const item of items){const group=document.createElement('section');group.className='source-group';const h=document.createElement('h3');h.textContent=item.title||item.name||item.id;const p=document.createElement('p');p.textContent=[item.location,item.status,item.claim||item.description].filter(Boolean).join(' · ');group.append(h,p);const links=item.url?[item]:(item.sources||[]);for(const link of links){if(!/^https:\/\//.test(link.url||''))continue;const a=document.createElement('a');a.href=link.url;a.textContent=link.title||link.name||'閱讀官方原文';a.target='_blank';a.rel='noopener noreferrer';group.append(a);}$('source-list').append(group);}for(const [key,title] of [['display_notes','場景與年份說明'],['credits','資料署名']]){const notes=sourceDocument[key];if(!Array.isArray(notes)||!notes.length)continue;const group=document.createElement('section');group.className='source-group';const h=document.createElement('h3');h.textContent=title;group.append(h);for(const note of notes){const p=document.createElement('p');p.textContent=String(note);group.append(p);}$('source-list').append(group);}}catch{$('source-list').textContent='資料來源暫未載入，請重新整理頁面後再查看。';}}
function bindTouch(){const joystick=$('joystick'),thumb=$('joystick-thumb');let joystickPointer=null,lookPointer=null,lastPoint=null;function releaseStick(){joystickPointer=null;moveX=moveY=0;thumb.style.transform='';}joystick.addEventListener('pointerdown',event=>{if(!exploring)return;joystickPointer=event.pointerId;joystick.setPointerCapture(event.pointerId);event.preventDefault();});joystick.addEventListener('pointermove',event=>{if(event.pointerId!==joystickPointer)return;const r=joystick.getBoundingClientRect(),radius=r.width*.34,dx=event.clientX-r.left-r.width/2,dy=event.clientY-r.top-r.height/2,length=Math.hypot(dx,dy),scale=length>radius?radius/length:1;moveX=dx*scale/radius;moveY=-dy*scale/radius;thumb.style.transform=`translate(${dx*scale}px,${dy*scale}px)`;event.preventDefault();});joystick.addEventListener('pointerup',releaseStick);joystick.addEventListener('pointercancel',releaseStick);joystick.addEventListener('lostpointercapture',releaseStick);const zone=$('look-zone');zone.addEventListener('pointerdown',event=>{if(!exploring)return;lookPointer=event.pointerId;lastPoint=[event.clientX,event.clientY];zone.setPointerCapture(event.pointerId);event.preventDefault();});zone.addEventListener('pointermove',event=>{if(event.pointerId!==lookPointer||!lastPoint)return;lookX+=event.clientX-lastPoint[0];lookY-=event.clientY-lastPoint[1];lastPoint=[event.clientX,event.clientY];event.preventDefault();});const releaseLook=()=>{lookPointer=null;lastPoint=null;};zone.addEventListener('pointerup',releaseLook);zone.addEventListener('pointercancel',releaseLook);zone.addEventListener('lostpointercapture',releaseLook);window.addEventListener('blur',()=>{releaseStick();releaseLook();lookX=lookY=0;send('SetInput',JSON.stringify({moveX:0,moveY:0,lookX:0,lookY:0}));});}
function inputLoop(){
  if(exploring&&unity&&!transitioning&&!finaleStarted&&!document.querySelector('dialog[open]')){
    if(forceNextInput||lookX||lookY||moveX!==lastSentMoveX||moveY!==lastSentMoveY){
      send('SetInput',JSON.stringify({moveX,moveY,lookX,lookY}));
      lastSentMoveX=moveX;lastSentMoveY=moveY;lookX=lookY=0;forceNextInput=false;
    }
  }
  requestAnimationFrame(inputLoop);
}
function fail(error){
  if(loadFailed)return;
  loadFailed=true;ready=false;sceneReady=false;$('experience').dataset.ready='false';pendingDeparture=false;clearInterval(loadWatchdog);
  console.error('考察地圖載入失敗',error);
  const message=String(error?.message||error);
  $('error-message').textContent=/memory|allocation|array buffer/i.test(message)?'瀏覽器未能分配足夠記憶體。請關閉其他分頁，重新開啟考察；現場演講可使用電腦。':/WebGL|WebAssembly|wasm-exceptions|wasm-simd/i.test(message)?'這個瀏覽器未能啟動三維地圖。請更新 Safari／系統，或使用電腦瀏覽器開啟。':'地圖下載或啟動未完成。請確認網絡連線，再按「重新載入」。';
  $('error-panel').hidden=false;$('load-label').textContent='地圖未能載入';departureButton();
  window.__hk2030LoadError=message;
}
$('retry-button').addEventListener('click',()=>location.reload());
$('load-retry').addEventListener('click',()=>location.reload());
function chooseTextureData(manifest){
  const variant=manifest.textureVariants?.astc;
  // ?textures=generic forces the non-ASTC scene data (for comparing on phones).
  if(!variant||new URLSearchParams(location.search).get('textures')==='generic')return null;
  // Probe a separate context, release it, then let Unity own the world canvas.
  const probe=document.createElement('canvas');let gl;
  try{
    gl=probe.getContext('webgl2',{powerPreference:'low-power'});
    return gl?.getExtension('WEBGL_compressed_texture_astc')?variant:null;
  }catch{return null;}
  finally{try{gl?.getExtension('WEBGL_lose_context')?.loseContext();}catch{}}
}
// GitHub Pages cannot serve files over 100 MB or set Content-Encoding, so the
// gzip scene data is stored in parts and decompressed here into one blob.
async function assembleData(parts,totalBytes,onProgress){
  if(typeof DecompressionStream!=='function')throw new Error('WebAssembly: 這個瀏覽器未支援 DecompressionStream');
  let index=0,reader=null,loaded=0;
  const stream=new ReadableStream({async pull(controller){
    for(;;){
      if(!reader){
        if(index>=parts.length){controller.close();return;}
        const response=await fetch(parts[index++]);
        if(!response.ok||!response.body)throw new Error('考察地圖資料未能取得。');
        reader=response.body.getReader();
      }
      const {done,value}=await reader.read();
      if(done){reader=null;continue;}
      loaded+=value.byteLength;if(totalBytes)onProgress(Math.min(1,loaded/totalBytes));
      controller.enqueue(value);return;
    }
  }});
  const blob=await new Response(stream.pipeThrough(new DecompressionStream('gzip'))).blob();
  return URL.createObjectURL(blob);
}
async function loadWorld(){
  lastLoadAdvance=Date.now();
  loadWatchdog=setInterval(()=>{
    if(ready||loadFailed||document.hidden)return;
    if(Date.now()-lastLoadAdvance>75000){
      loadStalled=true;
      $('load-note').hidden=false;
      $('load-note').textContent='地圖仍在準備，較長時間未有新進度。請保持頁面開啟；如一直停留，可檢查網絡後重新載入。';
      $('load-retry').hidden=false;
    }
  },5000);
  try{
    const response=await fetch('unity-manifest.json',{cache:'no-cache'});
    if(!response.ok)throw new Error('考察地圖建置檔案未能取得。');
    const manifestText=await response.text();
    const manifest=JSON.parse(manifestText);
    const textureData=chooseTextureData(manifest);
    $('unity-canvas').dataset.buildVersion=manifest.version;$('unity-canvas').dataset.textureVariant=textureData?'astc':'generic';
    // Optional backup metadata must never delay or fail the native startup.
    Promise.resolve().then(()=>packageFor(manifest,textureData,manifestText)).then(pkg=>{
      if(loadFailed)return;
      cachePackage=pkg;checkBackupInStandby();backupControls();
    }).catch(()=>{cachePackage=null;backupControls();});
    // Full cache validation begins only after native scene preparation to avoid duplicate startup buffers.
    const downloadBytes=(textureData?.dataCompressedBytes||manifest.dataCompressedBytes||0)+(manifest.codeCompressedBytes||0)+(manifest.frameworkCompressedBytes||0);
    if(downloadBytes)downloadMegabytes=Math.ceil(downloadBytes/1e6);
    if(!pendingDeparture)$('load-note').textContent=preparationNote();
    const dataParts=(textureData||manifest).dataParts;
    const dataUrl=Array.isArray(dataParts)&&dataParts.length?await assembleData(dataParts,textureData?.dataCompressedBytes||manifest.dataCompressedBytes,p=>setLoad(p*.85)):textureData?.dataUrl||manifest.config.dataUrl;
    const config={...manifest.config,
      dataUrl,
      devicePixelRatio:Math.min(devicePixelRatio,matchMedia('(pointer:coarse)').matches?1.75:2),
      // Native Unity downloads stream progress and avoid a second raw Blob copy.
      // HTTP caching remains available; disable Unity's additional IndexedDB copy.
      cacheControl:()=> 'no-store',
      showBanner:(message,type)=>{if(type==='error')fail(new Error(message));},
      errorHandler:message=>{fail(new Error(message));return true;}
    };
    await new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=manifest.loaderUrl;script.onload=resolve;
      script.onerror=()=>reject(new Error('Unity載入程式未能取得。'));
      document.head.append(script);
    });
    unity=await window.createUnityInstance($('unity-canvas'),config,progress=>setLoad(dataParts?.85+progress*.13:Math.min(progress,.98)));
    window.__hk2030Unity=unity;
    send('SetPaused','true');send('SetTurbineMode','history');
    if(loadFailed)return;
    setLoad(.99,'檢查全部地圖與互動');checkReady();send('GetState');
    setInterval(()=>{if(unity&&!loadFailed&&(!ready||exploring))send('GetState');},1100);
  }catch(error){fail(error);}
}
$('experience').dataset.ready='false';$('experience').dataset.mode='presentation';
buildStopList();buildMap();loadSources();bindTouch();bindDesktopLook();updateStop('harbour');requestAnimationFrame(inputLoop);loadWorld();
// Auto navigation: visit each stop in tour order, about 30 seconds each.
// While paused the presenter keeps full manual control (walk, look, change stop);
// a manual stop change restarts the 30 seconds at that stop.
const AUTO_STAY_MS=30000;
const autoTour={running:false,paused:false,stopId:null,elapsed:0,demoStarted:false,last:0};
function autoTourLabel(){
  if(!autoTour.running)return '講者自選';
  const index=stops.findIndex(s=>s.id===activeStop)+1,left=Math.max(0,Math.ceil((AUTO_STAY_MS-autoTour.elapsed)/1000));
  return autoTour.paused?`自動導航已暫停 · ${index}／${stops.length}`:`自動導航 ${index}／${stops.length} · ${left}秒`;
}
function renderAutoTour(){
  $('autotour-button').textContent=autoTour.running?'停止導航':'自動導航';
  $('autotour-button').setAttribute('aria-pressed',String(autoTour.running));
  $('autotour-pause').hidden=!autoTour.running;
  $('autotour-pause').textContent=autoTour.paused?'繼續':'暫停';
  $('autotour-pause').setAttribute('aria-pressed',String(autoTour.paused));
  $('tour-progress').textContent=autoTourLabel();
}
function startAutoTour(){
  if(!exploring||!ready)return;
  if(finaleStarted)enterWorld();
  Object.assign(autoTour,{running:true,paused:false,stopId:activeStop,elapsed:0,demoStarted:false,last:performance.now()});
  renderAutoTour();announce('自動導航：每站約30秒，可隨時暫停',{force:true});
}
function stopAutoTour(){if(!autoTour.running)return;autoTour.running=false;autoTour.paused=false;renderAutoTour();}
function toggleAutoTourPause(){
  if(!autoTour.running)return;
  autoTour.paused=!autoTour.paused;autoTour.last=performance.now();renderAutoTour();
  announce(autoTour.paused?'已暫停 · 可自行行走和環顧':'繼續自動導航',{force:true});
  $('unity-canvas').focus();
}
function autoTourTick(){
  const now=performance.now(),dt=now-autoTour.last;autoTour.last=now;
  if(!autoTour.running)return;
  if(!exploring||finaleStarted){stopAutoTour();return;}
  if(autoTour.stopId!==activeStop){autoTour.stopId=activeStop;autoTour.elapsed=0;autoTour.demoStarted=false;}
  if(autoTour.paused||transitioning||classroomVR||document.querySelector('dialog[open]')){$('tour-progress').textContent=autoTourLabel();return;}
  autoTour.elapsed+=dt;
  // Start the station's demo animation shortly after arriving.
  if(!autoTour.demoStarted&&autoTour.elapsed>1500){
    autoTour.demoStarted=true;
    if(activeStop==='kwai')goToCargoPoint('follow');
    else if(!interactionBusy&&window.__hk2030State?.interactable!==false)send('Interact');
  }
  if(autoTour.elapsed>=AUTO_STAY_MS){
    const index=stops.findIndex(s=>s.id===activeStop),next=stops[(index+1)%stops.length].id;
    autoTour.elapsed=0;goToStop(next);
  }
  $('tour-progress').textContent=autoTourLabel();
}
$('autotour-button').addEventListener('click',()=>autoTour.running?stopAutoTour():startAutoTour());
$('autotour-pause').addEventListener('click',toggleAutoTourPause);
setInterval(autoTourTick,250);
window.__hk2030App={get autoTour(){return {...autoTour}},get ready(){return ready},get exploring(){return exploring},get activeStop(){return activeStop},goToStop,showIntroduction,stops};

