/* Roadmap Buddy: Welcome back screen (resume.js).
   Loaded last (space.js adds it after pstate.js). It only READS the app's data; it never writes S.
   It shows after a break (2 hours or more since the app was last in use), or on the first open on a device that has progress.
   It never interrupts a running timer. The only thing it stores is one timestamp under its own key (buddy.v2.seen).
   AI hook for later: define window.wbAI(ctx) returning a Promise of a short text, and it appears on this screen. */
(function(){
'use strict';
const SEEN='buddy.v2.seen', GAP=2*3600*1000;

const css=document.createElement('style');
css.textContent='.wb{position:fixed;inset:0;z-index:30;display:grid;place-items:center;padding:1rem;background:rgba(5,10,15,.72);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}'
+'.wb .card{width:min(28rem,100%);max-height:calc(100% - 1rem);overflow:auto;margin:0}'
+'.wb h2{font:600 1.5rem/1.2 Georgia,"Times New Roman",serif;margin:0 0 .1rem}'
+'.wb .k{font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);margin:.95rem 0 .15rem}'
+'.wb .v{margin:0;font-size:.95rem}.wb .v.s{font-size:.85rem;color:var(--mute)}'
+'.wb ul{list-style:none;margin:0;padding:0}.wb li{font-size:.92rem;padding:.2rem 0}'
+'.wb .go{margin-top:1.1rem}.wb .alt{margin-top:.5rem;width:100%;color:var(--mute)}';
document.head.append(css);

const stamp=()=>{try{localStorage.setItem(SEEN,String(Date.now()))}catch(e){}};
const lastSeen=()=>{try{return +localStorage.getItem(SEEN)||0}catch(e){return 0}};
const isReady=()=>typeof D!=='undefined'&&!!D&&typeof idx!=='undefined'&&Object.keys(idx).length>0;

function ago(ts){
  const d=new Date(ts),t0=new Date();t0.setHours(0,0,0,0);
  const days=Math.round((t0-new Date(d.getFullYear(),d.getMonth(),d.getDate()))/864e5);
  const tm=d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
  return days<=0?'today at '+tm:days===1?'yesterday at '+tm:days<7?days+' days ago':d.toLocaleDateString(undefined,{day:'numeric',month:'short'});
}
function greet(){const h=new Date().getHours();return (h<12?'Good morning':h<18?'Good afternoon':'Good evening')+'. Welcome back.'}

/* the focus project's own data: a file project keeps it in S.fpx, a project made in the app keeps it on itself */
function projInfo(){
  const p=focusP();if(!p)return null;
  const x=p.file?((S.fpx||{})[p.id]||{}):p;
  const nm=(x.ms||[]).filter(m=>!m.done).sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'))[0]||null;
  return{p,note:x.next||'',nm,pr:projProg(p),dl:daysTo(p.deadline)};
}
function upcoming(){
  return calItems().filter(it=>it.date&&!it.paused&&daysTo(endOf(it))>=0&&daysTo(it.date)<=7)
    .sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||'')||a.name.localeCompare(b.name)).slice(0,4);
}

let box=null,back=null,onKey=null;
function close(){
  if(!box)return;
  box.remove();box=null;document.removeEventListener('keydown',onKey,true);
  stamp();if(back&&back.focus)try{back.focus({preventScroll:true})}catch(e){}back=null;
}
function show(){
  renderAll();                                    // refresh the date and the pick, in case the app stayed open for days
  const info=projInfo(),r=pickToday(),st=stats(),L=S.log[S.log.length-1];
  back=document.activeElement;
  const bg=el('div','wb'),c=el('div','card'),h=el('h2',null,greet());
  bg.setAttribute('role','dialog');bg.setAttribute('aria-modal','true');bg.setAttribute('aria-labelledby','wb-h');h.id='wb-h';
  c.append(h,el('p','v s',new Date().toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'})));
  const sec=(k,t,s)=>{c.append(el('p','k',k),el('p','v'+(s?' s':''),t))};

  const left=[];
  if(L)left.push(L.title+' · '+ago(L.ts)+(L.k==='topic'?' (finished)':L.k==='tiny'?' (tiny step)':''));
  if(info&&info.note)left.push('Your note: '+info.note);
  if(left.length){c.append(el('p','k','Where you left off'));for(const t of left)c.append(el('p','v',t))}

  if(info){
    const bits=[info.pr.d+' of '+info.pr.tot+' '+info.pr.unit];
    if(info.dl!=null)bits.push(info.dl>=0?'due in '+info.dl+' days':'past its date');
    sec('Focus: '+info.p.name,bits.join(' · '));
    if(info.nm)c.append(el('p','v s','Next milestone: '+info.nm.t+(info.nm.date?' · '+fmt(info.nm.date,{day:'numeric',month:'short'}):'')));
  }

  c.append(el('p','k','Next step'));
  if(r){c.append(el('p','v',r.n.t+' · '+(r.n.min||25)+' min'));if(r.why)c.append(el('p','v s','Why now: '+r.why))}
  else c.append(el('p','v','Nothing is ready. Enjoy the free time.'));

  const up=upcoming();
  if(up.length){c.append(el('p','k','Coming up'));const ul=el('ul');for(const it of up){const li=el('li');li.append(el('span','chip k-'+it.k,EVT[it.k]),document.createTextNode(it.name+' · '+when(it)));ul.append(li)}c.append(ul)}

  sec('This week',st.thisWeek+' of '+GOAL+' sessions'+(st.streak?' · '+st.streak+' goal week'+(st.streak>1?'s':'')+' in a row':''),true);

  let ai=null;
  if(typeof window.wbAI==='function'){
    ai=el('p','v s','Thinking…');c.append(el('p','k','Summary'),ai);
    try{
      Promise.resolve(window.wbAI({last:L?L.title:'',note:info?info.note:'',focus:info?info.p.name:'',next:r?r.n.t:'',upcoming:up.map(i=>i.name+' '+when(i))}))
        .then(t=>{if(box)ai.textContent=String(t||'').slice(0,600)||''}).catch(()=>{if(box)ai.remove()});
    }catch(e){ai.remove()}
  }

  const go=r?el('button','main go','Start '+(r.n.min||25)+' minutes'):null,alt=el('button','alt','Look around first');
  if(go){go.type='button';go.onclick=()=>{back=null;close();setView('home');const g=$('go');if(g)g.click()};c.append(go)}
  alt.type='button';alt.onclick=close;c.append(alt);
  bg.append(c);document.body.append(bg);box=bg;
  onKey=e=>{
    if(!box)return;
    if(e.key==='Escape'){e.preventDefault();close();return}
    if(e.key==='Tab'){const f=[go,alt].filter(Boolean),i=f.indexOf(document.activeElement);e.preventDefault();f[(i+(e.shiftKey?-1:1)+f.length)%f.length].focus()}
  };
  document.addEventListener('keydown',onKey,true);
  (go||alt).focus();
}

function maybe(){
  if(box||!isReady())return;
  const seen=lastSeen();
  if(seen&&Date.now()-seen<GAP){stamp();return}
  if(S.tm&&S.tm.end&&tmLeft()>0){stamp();return}   // mid-session: do not interrupt
  if(!S.log.length&&!focusP()){stamp();return}      // nothing to say yet
  show();
}

/* when the app stays open, keep the "last in use" time fresh; a sleeping laptop stops the clock, so waking it shows the screen */
setInterval(()=>{if(box||document.hidden)return;if(Date.now()-lastSeen()>=GAP)maybe();else stamp()},60000);
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(!box)stamp()}else maybe()});
window.addEventListener('focus',maybe);
window.addEventListener('pageshow',maybe);

let tries=0;
window.showSavePoint = show;
const wait=setInterval(()=>{if(isReady()){clearInterval(wait);maybe()}else if(++tries>100)clearInterval(wait)},150);
})();
