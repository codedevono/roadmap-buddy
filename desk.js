/* desk.js: full-window layout and mini player for Roadmap Buddy (desktop and laptop windows).
   A layer in the pstate.js pattern: loaded by space.js, index.html untouched.
   - Wide windows (900 px wide and 500 px high or more) get body.desk: a left rail instead of the bottom bar,
     Home as a dashboard of boxes that fill the window (no page scroll; long boxes scroll inside themselves),
     and the whole UI scales with the window (CSS zoom from the window size).
   - Phones and narrow windows are not touched at all.
   - Mini player: the "Mini" button opens a small always-on-top window with only the time (Document
     Picture-in-Picture, Chrome and Edge). Without it, a small floating timer is shown inside the page.
   - window.deskAI.mount(el) gives a future AI panel its own column on Home.
   Reads S, cur, view, tmLeft, $ from the main script; writes nothing to S. */
(function(){
'use strict';
const MQ=matchMedia('(min-width:900px) and (min-height:500px)');
const RAIL=124;

const css=`
.deskbtn,#deskMini,#deskAI{display:none}
body.desk{--dz:1;--vh:calc(100dvh / var(--dz));--rail:${RAIL}px;zoom:var(--dz);height:var(--vh);overflow:hidden}
body.desk main{max-width:none;height:var(--vh);min-height:0;padding:14px 22px 14px calc(var(--rail) + 22px);
  display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);gap:6px 28px;align-content:stretch}
body.desk .top{grid-column:1;grid-row:1;align-self:center;display:flex;gap:14px;align-items:center;margin:0}
body.desk .hud{grid-column:2;grid-row:1;align-self:center;margin:0}
body.desk .hud .hl{margin-bottom:5px}
body.desk main>[role=tabpanel]:not([hidden]){grid-column:1/-1;grid-row:2;min-height:0;min-width:0;overflow:auto;scrollbar-width:thin;padding-right:4px}
body.desk .deskbtn{display:inline-flex;align-items:center;gap:6px;min-height:30px;padding:2px 12px;font-size:12px;letter-spacing:.08em;text-transform:uppercase}
/* left rail instead of the bottom bar */
body.desk .bnav{position:fixed;left:0;top:0;bottom:auto;right:auto;width:var(--rail);height:var(--vh);max-width:none;margin:0;
  display:flex;flex-direction:column;justify-content:flex-start;gap:4px;padding:18px 10px;border:0;border-right:1px solid var(--line);border-radius:0;background:#0A1119}
body.desk .bnav button{flex:none;width:100%;min-height:46px;text-align:left;padding:0 14px;border-radius:6px;letter-spacing:.1em}
body.desk .bnav button[aria-selected="true"]{box-shadow:inset 3px 0 0 var(--accent);background:rgba(124,196,204,.08)}
body.desk #toast{bottom:24px}
/* Home: a dashboard of boxes */
body.desk #v-home:not([hidden]){display:grid;gap:14px;overflow:hidden;padding:0;
  grid-template-columns:minmax(0,1fr) minmax(0,1.25fr) minmax(0,1fr);grid-template-rows:auto auto minmax(0,1fr)}
body.desk #v-home.has-ai:not([hidden]){grid-template-columns:minmax(0,1fr) minmax(0,1.2fr) minmax(0,1fr) minmax(0,1fr)}
body.desk #v-home>.card,body.desk #v-home>details{margin:0;min-height:0;min-width:0}
body.desk #goal{grid-column:1;grid-row:1}
body.desk #coming{grid-column:1;grid-row:2}
body.desk .nx{grid-column:2;grid-row:1/4;display:flex;flex-direction:column;overflow:auto;scrollbar-width:thin;padding:18px 22px;--rs:clamp(96px,calc(var(--vh) * .21),230px)}
body.desk .nx .focus{flex:none;margin:auto 0;padding:0;min-height:0}
body.desk .nx .track{align-self:flex-start}
body.desk .nx h1{font-size:clamp(22px,calc(var(--vh) * .043),34px)}
body.desk .nx .ring{width:var(--rs);height:var(--rs);margin:.5rem auto .9rem}
body.desk .nx .ring .t{font-size:calc(var(--rs) * .21)}
body.desk .nx .hint,body.desk .nx .why{font-size:14px}
body.desk #strip{grid-column:3;grid-row:1/4;overflow:auto;scrollbar-width:thin}
body.desk #more{grid-column:1;grid-row:3;overflow:auto;scrollbar-width:thin}
body.desk #more>summary{display:none}
body.desk #more>div{padding:4px 16px 14px!important}
body.desk #deskAI{grid-column:4;grid-row:1/4;display:block;min-height:0;overflow:auto;border:1px solid var(--line);border-radius:8px;background:rgba(15,27,38,.92);padding:16px}
body.desk #v-home:not(.has-ai) #deskAI{display:none}
/* other views: centred, scroll inside the window, never the page */
body.desk #v-roadmap:not([hidden]),body.desk #v-projects:not([hidden]),body.desk #v-calendar:not([hidden]),body.desk #v-path:not([hidden]),body.desk #v-rewards:not([hidden]){
  width:100%;max-width:1180px;justify-self:center}
body.desk .smap{max-height:calc(var(--vh) - 250px)}
body.desk .smap svg{max-height:calc(var(--vh) - 252px);width:100%}
/* in-page floating timer (fallback, and when the main timer is out of sight) */
body.desk #deskMini{position:fixed;right:20px;bottom:20px;z-index:20;display:none;align-items:center;gap:10px;padding:8px 10px 8px 14px;
  background:var(--card);border:1px solid var(--hot);border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.45);zoom:1}
body.desk #deskMini.on{display:flex}
#deskMini .dm-t{font:600 26px var(--mono);letter-spacing:.02em;min-width:4.2ch;text-align:center}
#deskMini .dm-n{font-size:11px;color:var(--mute);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#deskMini button{min-height:34px;padding:0 12px;font-size:12px}
`;

function el(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
const g=id=>document.getElementById(id);

/* ---------- layout ---------- */
let moreWas=null;
function fit(){
  const b=document.body;if(!b)return;
  if(!MQ.matches){
    if(b.classList.contains('desk')){b.classList.remove('desk');b.style.removeProperty('--dz');
      const m=g('more');if(m&&moreWas!==null)m.open=moreWas;moreWas=null}
    paintMini();return}
  const dz=Math.max(.75,Math.min(1.6,Math.min(innerWidth/1280,innerHeight/720)));
  b.style.setProperty('--dz',dz.toFixed(3));
  if(!b.classList.contains('desk')){b.classList.add('desk');const m=g('more');if(m){moreWas=m.open;m.open=true}}
  paintMini();
}

/* ---------- mini player ---------- */
const fmt=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
function snap(){
  let tm=null;try{tm=S&&S.tm||null}catch(e){}
  let left=0,total=0,state='idle',title='';
  try{title=cur&&cur.n&&cur.n.t||''}catch(e){}
  if(tm){left=tmLeft();total=tm.total||1;state=left<=0?'up':tm.end?'run':'pause'}
  else{try{total=((cur&&cur.n&&cur.n.min)||25)*60}catch(e){total=1500}left=total}
  return{left,total,state,title}
}
const LABEL={idle:'Start',run:'Pause',pause:'Resume',up:'Time is up'};
function press(id){const b=g(id);if(b)b.click()}
function nudge(s){ // the main timer may be throttled while its window is hidden: finish the tick here
  if(s.state==='up'){try{if(S.tm&&S.tm.end)runTick()}catch(e){}}
}

let fl=null,pinned=false;
function buildFloat(){
  fl=el('div');fl.id='deskMini';fl.setAttribute('role','group');fl.setAttribute('aria-label','Mini timer');
  const t=el('span','dm-t','');const n=el('span','dm-n','');
  const pp=el('button','main','');const ok=el('button',null,'Done');const x=el('button',null,'Hide');
  pp.onclick=()=>press('go');ok.onclick=()=>press('ok');x.onclick=()=>{pinned=false;paintMini()};
  const col=el('div');col.style.cssText='display:flex;flex-direction:column;gap:2px';col.append(t,n);
  fl.append(col,pp,ok,x);fl._t=t;fl._n=n;fl._pp=pp;
  document.body.append(fl);
}
function paintMini(){
  if(!fl&&document.body)buildFloat();
  if(!fl)return;
  const s=snap();
  const show=document.body.classList.contains('desk')&&!pip&&(pinned||(s.state!=='idle'&&typeof view!=='undefined'&&view!=='home'));
  fl.classList.toggle('on',!!show);
  if(show){fl._t.textContent=fmt(s.left);fl._n.textContent=s.title;fl._pp.textContent=LABEL[s.state];fl._pp.disabled=s.state==='up'}
}

let pip=null,ac=null;
function beep(){try{ac=ac||new (window.AudioContext||window.webkitAudioContext)();const o=ac.createOscillator(),gn=ac.createGain();
  o.connect(gn);gn.connect(ac.destination);o.frequency.value=880;gn.gain.value=.12;o.start();o.stop(ac.currentTime+.25)}catch(e){}}
async function openMini(){
  if(pip){try{pip.close()}catch(e){}return}
  if(!('documentPictureInPicture' in window)){pinned=!pinned;paintMini();return}
  try{
    ac=ac||new (window.AudioContext||window.webkitAudioContext)(); // made on the click so the end beep may play
    const w=await documentPictureInPicture.requestWindow({width:300,height:150});
    pip=w;const d=w.document;
    const cs=getComputedStyle(document.body);const v=n=>cs.getPropertyValue(n).trim();
    const font=new URL('chakra-petch-600.woff2',location.href).href;
    const st=d.createElement('style');
    st.textContent=`@font-face{font-family:'Chakra Petch';font-weight:600;src:url(${font}) format('woff2')}
*{box-sizing:border-box}html,body{height:100%;margin:0}
body{background:${v('--bg')||'#0A1119'};color:${v('--ink')||'#E6EFF4'};font:600 13px 'Chakra Petch',system-ui,sans-serif;display:flex;flex-direction:column;justify-content:center;gap:6px;padding:10px 14px}
.n{color:${v('--mute')||'#93A9B8'};font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center}
.t{font:600 clamp(30px,24vw,64px)/1 ui-monospace,Consolas,monospace;text-align:center;letter-spacing:.02em}
.b{height:4px;border-radius:2px;background:${v('--track')||'#1B2F40'};overflow:hidden}.b i{display:block;height:100%;width:0;background:${v('--accent')||'#7CC4CC'}}
.r{display:flex;gap:8px}button{flex:1;min-height:34px;border-radius:6px;border:1px solid ${v('--edge')||'#2A4357'};background:transparent;color:inherit;font:inherit;cursor:pointer}
button.m{background:${v('--accent')||'#7CC4CC'};color:${v('--accent-ink')||'#06161A'};border-color:transparent}button:disabled{opacity:.5;cursor:default}
body.up .t{color:${v('--accent')||'#7CC4CC'}}`;
    d.head.append(st);d.title='Roadmap Buddy timer';
    const n=d.createElement('div');n.className='n';const t=d.createElement('div');t.className='t';
    const b=d.createElement('div');b.className='b';const bi=d.createElement('i');b.append(bi);
    const r=d.createElement('div');r.className='r';
    const pp=d.createElement('button');pp.className='m';const ok=d.createElement('button');ok.textContent='Done';
    r.append(pp,ok);d.body.append(n,t,b,r);
    pp.onclick=()=>press('go');ok.onclick=()=>press('ok');
    let wasUp=false;
    const paint=()=>{const s=snap();nudge(s);
      t.textContent=fmt(s.left);n.textContent=s.title;pp.textContent=LABEL[s.state];pp.disabled=s.state==='up';
      bi.style.width=(s.state==='idle'?0:Math.round(100*(1-s.left/s.total)))+'%';
      d.body.classList.toggle('up',s.state==='up');
      if(s.state==='up'&&!wasUp)beep();wasUp=s.state==='up'};
    paint();const iv=w.setInterval(paint,500); // timer of the small window, so a hidden main window cannot slow it
    w.addEventListener('pagehide',()=>{w.clearInterval(iv);pip=null;paintMini()});
    paintMini();
  }catch(e){pip=null;pinned=true;paintMini()} // refused or not available: use the floating timer
}

/* ---------- AI slot ---------- */
window.deskAI={
  mount(node){const a=g('deskAI');if(!a)return false;a.textContent='';a.append(node);g('v-home').classList.add('has-ai');return true},
  clear(){const a=g('deskAI');if(a)a.textContent='';const h=g('v-home');if(h)h.classList.remove('has-ai')}
};

/* ---------- start ---------- */
function init(){
  const st=document.createElement('style');st.id='deskcss';st.textContent=css;document.head.append(st);
  const top=document.querySelector('.top');
  if(top){const b=el('button','deskbtn','Mini');b.id='deskMiniBtn';b.type='button';
    b.title='Small always-on-top timer window';b.onclick=openMini;top.append(b)}
  const home=g('v-home');
  if(home&&!g('deskAI')){const a=el('aside');a.id='deskAI';a.setAttribute('aria-label','AI panel');home.append(a)}
  MQ.addEventListener('change',fit);addEventListener('resize',fit);
  fit();
  setInterval(()=>{paintMini();
    let s=null;try{s=snap()}catch(e){}
    if(s&&s.state!=='idle'){document.title=fmt(s.left)+' · Roadmap Buddy';_t=1}
    else if(_t){document.title='Roadmap Buddy';_t=0}},1000);
}
let _t=0;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
