/* Home tab: the first screen. Reads the app's own state and adds nothing to storage.
   Loaded by index.html after the main script, it wraps setView and renderAll. */
(function(){
const css=document.createElement('style');
css.textContent='.tabs{grid-template-columns:repeat(7,minmax(0,1fr))}@media (max-width:30rem){.tabs{grid-template-columns:repeat(4,minmax(0,1fr))}}.hm h1{margin-top:.2rem}.hm .main{margin-top:.5rem}';
document.head.append(css);

const nav=document.querySelector('.tabs'), hb=el('button',null,'Home');
hb.setAttribute('role','tab');hb.dataset.v='home';hb.onclick=()=>setView('home');
nav.prepend(hb);
const panel=el('div');panel.id='v-home';panel.setAttribute('role','tabpanel');
$('v-today').before(panel);

const _sv=setView, _ra=renderAll;
setView=function(v){
  if(v!=='home'){_sv(v);panel.hidden=true;return}
  view='home';
  for(const b of document.querySelectorAll('.tabs button'))b.setAttribute('aria-selected',String(b.dataset.v==='home'));
  for(const id of ['today','projects','calendar','path','roadmap','rewards'])$('v-'+id).hidden=true;
  panel.hidden=false;window.scrollTo(0,0);
};
renderAll=function(){_ra();renderHome()};

function renderHome(){
  panel.textContent='';
  if(!D){panel.append(el('p','msg','Loading…'));return}
  const st=stats(), p=pick(), w=el('div','hm');
  const last=S.log.reduce((m,l)=>Math.max(m,l.ts),0), away=last?Math.floor((Date.now()-last)/DAY):null;
  w.append(el('p','hint',away===null?'Welcome. One small step is enough to start.':away>=2?'Welcome back. Nothing is lost. Pick up with one small step.':'Here is your next step.'));

  const c=el('div','card');
  if(p){
    c.append(el('p','track',p.lad.name),el('h1',null,p.n.t),
      el('p','sub','Smallest start: '+(p.n.tiny||'open the first resource and work for 5 minutes')),
      el('p','sub','Why now: '+p.why));
    const go=el('button','main','Start '+(p.n.min||25)+' minutes');
    go.onclick=()=>{setView('today');render();const g=$('go');if(g)g.click()};
    c.append(go);
  }else c.append(el('p','msg','Nothing is ready. Everything is done or snoozed.'));
  w.append(c);

  const lv=el('div','card');
  lv.append(el('h2',null,'Level '+st.lvl+' · '+title(st.lvl)),bar(st.frac),el('p','sub',(st.next-st.xp)+' XP to level '+(st.lvl+1)));
  w.append(lv);

  const wk=el('div','card'),dots=el('div','dots');
  for(let i=0;i<GOAL;i++)dots.append(el('span','dot'+(i<st.thisWeek?' on':'')));
  wk.append(el('h2',null,'This week: '+Math.min(st.thisWeek,GOAL)+' of '+GOAL+' sessions'),dots,
    el('p','sub',st.streak?st.streak+' goal week'+(st.streak>1?'s':'')+' in a row. A slow week pauses the count; it never erases XP.':'Missing a day costs nothing.'));
  const nb=allBadges().find(b=>!S.badges[b.id]);
  if(nb)wk.append(el('p','sub','Next badge: '+nb.n+'. '+nb.d));
  w.append(wk);

  const items=calItems(), up=items.filter(i=>i.date&&daysTo(endOf(i))>=0).sort((a,b)=>a.date.localeCompare(b.date))[0], nd=items.filter(i=>!i.date).length;
  const ev=el('div','card');ev.append(el('h2',null,'Next date'));
  if(up){const r=el('div','ev');r.append(el('div','tt',up.name),el('div','sub',when(up)+(up.est?' · estimated':'')));ev.append(r)}
  else ev.append(el('p','sub','No dates coming up.'));
  if(nd){const b=el('button','mini',nd+(nd===1?' event needs':' events need')+' a date');b.onclick=()=>setView('calendar');ev.append(b)}
  w.append(ev);

  if(P){
    const ss=P.stages.map(s=>({s,x:stageStats(s)})), i=ss.findIndex(o=>o.x.qd<o.x.q||o.x.md<o.x.ms.length), o=ss[i<0?ss.length-1:i];
    const ph=el('div','card');
    ph.append(el('h2',null,'Path · Phase '+((i<0?ss.length-1:i)+1)+': '+o.s.name),bar(o.x.all),el('p','sub',o.x.qd+' of '+o.x.q+' quests · '+o.x.md+' of '+o.x.ms.length+' milestones'));
    const b=el('button','mini','Open Path');b.onclick=()=>setView('path');ph.append(b);
    w.append(ph);
  }
  panel.append(w);
}
renderHome();setView('home');
})();
