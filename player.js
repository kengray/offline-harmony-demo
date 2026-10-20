const VOICES=['guitar','lead','tenor','baritone'], SONGS='songs-v1';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
window.__state={playing:false,decoded:null,error:null,swActive:false};
let ctx=null,sources=[],gains={};

// ---- service worker (skipped when ?sw=0, used for the control run) ----
async function initSW(){
  if(params.get('sw')==='0'||!('serviceWorker' in navigator)){$('sw').textContent='Service worker: off';return;}
  try{await navigator.serviceWorker.register('sw.js');await navigator.serviceWorker.ready;
    __state.swActive=true;$('sw').innerHTML='Service worker: <b class="ok">installed, player is saved on this device</b>';}
  catch(e){$('sw').textContent='Service worker failed: '+e.message;}
}
// ---- access token: signed by the server, checked on the device with WebCrypto ----
const b64uToBytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const toB64u=buf=>btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function getToken(){   // demo only: signs in the browser; a real server would sign this
  const ttl=+(params.get('ttl')||$('ttl').value);
  const kp=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const payload=toB64u(new TextEncoder().encode(JSON.stringify({sub:'demo-user',exp:Date.now()+ttl*1000})));
  const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},kp.privateKey,new TextEncoder().encode(payload));
  localStorage.setItem('poc-token',payload+'.'+toB64u(sig));
  localStorage.setItem('poc-key',JSON.stringify(await crypto.subtle.exportKey('jwk',kp.publicKey)));
  await showAccess();
}
async function checkAccess(){
  const t=localStorage.getItem('poc-token'),k=localStorage.getItem('poc-key');
  if(!t||!k) return {ok:false,why:'no token yet'};
  const [p,s]=t.split('.');
  const key=await crypto.subtle.importKey('jwk',JSON.parse(k),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  const valid=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,b64uToBytes(s),new TextEncoder().encode(p));
  if(!valid) return {ok:false,why:'signature invalid'};
  const exp=JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/'))).exp;
  if(Date.now()>exp) return {ok:false,why:'expired '+new Date(exp).toISOString()};
  return {ok:true,until:new Date(exp).toISOString()};
}
async function showAccess(){
  const a=await checkAccess();
  $('access').innerHTML=a.ok?'Access: <b class="ok">valid until '+a.until+'</b>':'Access: <b class="bad">'+a.why+'</b>';
  return a;
}
// ---- saving songs ----
const url=(song,v)=>`audio/${song}-${v}.wav`;
async function isSaved(song){const c=await caches.open(SONGS);
  return (await Promise.all(VOICES.map(v=>c.match(url(song,v))))).every(Boolean);}
async function refreshSaved(){const s=$('song').value;
  $('saved').innerHTML=(await isSaved(s))?'<b class="ok">saved on this device</b>':'<span class="bad">not saved</span>';}
async function save(){
  const s=$('song').value;$('msg').textContent='Saving...';
  try{const c=await caches.open(SONGS);let bytes=0;
    for(const v of VOICES){const r=await fetch(url(s,v));if(!r.ok)throw new Error('HTTP '+r.status);
      const copy=r.clone();bytes+=(await copy.arrayBuffer()).byteLength;await c.put(url(s,v),r);}
    $('msg').textContent='Saved '+(bytes/1e6).toFixed(2)+' MB.';
    if(navigator.storage&&navigator.storage.persist) navigator.storage.persist();
  }catch(e){$('msg').textContent='Save failed: '+e.message;__state.error=e.message;}
  await refreshSaved();
}
async function removeSaved(){const s=$('song').value,c=await caches.open(SONGS);
  await Promise.all(VOICES.map(v=>c.delete(url(s,v))));$('msg').textContent='Removed.';await refreshSaved();}
// ---- playback ----
async function play(){
  stop();__state.error=null;
  const a=await showAccess();
  if(!a.ok){$('msg').textContent='Cannot play: access '+a.why+'. Go online to renew.';__state.error='access '+a.why;return;}
  const s=$('song').value;
  try{
    ctx=ctx||new (window.AudioContext||window.webkitAudioContext)();await ctx.resume();
    const bufs=await Promise.all(VOICES.map(async v=>{
      const r=await fetch(url(s,v));if(!r.ok)throw new Error('HTTP '+r.status);
      return ctx.decodeAudioData(await r.arrayBuffer());}));
    const t0=ctx.currentTime+0.1;
    sources=bufs.map((b,i)=>{const src=ctx.createBufferSource();src.buffer=b;src.connect(gains[VOICES[i]]);src.start(t0);return src;});
    __state.playing=true;__state.decoded=bufs.map(b=>+b.duration.toFixed(2));
    $('msg').textContent='Playing '+s+' ('+bufs.length+' parts, '+bufs[0].duration.toFixed(1)+' s).';
  }catch(e){
    __state.error=e.message;
    $('msg').textContent=/^HTTP /.test(e.message)?'Could not load song: '+e.message:'Could not load: this song is not saved on this device and there is no connection.';}
}
function stop(){sources.forEach(s=>{try{s.stop()}catch(e){}});sources=[];__state.playing=false;}
// ---- wiring ----
function init(){
  const mix=$('mix');
  ctx=ctx||new (window.AudioContext||window.webkitAudioContext)();
  VOICES.forEach(v=>{const g=ctx.createGain();g.connect(ctx.destination);gains[v]=g;
    const row=document.createElement('div');row.className='row';
    row.innerHTML=`<label>${v}</label><input type="range" min="0" max="1" step="0.01" value="0.8" aria-label="${v} volume">`;
    row.querySelector('input').oninput=e=>g.gain.value=+e.target.value;g.gain.value=.8;mix.appendChild(row);});
  const net=()=>{$('net').innerHTML='Network: '+(navigator.onLine?'<b class="ok">online</b>':'<b class="bad">offline</b>');};
  addEventListener('online',net);addEventListener('offline',net);net();
  $('getToken').onclick=()=>getToken().catch(e=>$('access').textContent='Token failed: '+e.message);
  $('save').onclick=save;$('remove').onclick=removeSaved;$('play').onclick=play;$('stop').onclick=stop;
  $('song').onchange=refreshSaved;
  initSW();showAccess();refreshSaved();
}
init();
