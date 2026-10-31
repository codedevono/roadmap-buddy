/* Roadmap Buddy v2.1
   Loaded by import.js after the main script. It overrides pick() and renderGoal() from index.html.
   - Today follows projects, deadlines and events. Ladder weekly floors are OFF unless S.floors is true.
   - Events with a past date add no pressure (before, they kept maximum urgency forever).
   - Home leads with the focus project: progress and a calm status. Under it: Coming up (3 closest dates).
   - New event types: Exam, Test, Competition, Application.
   - With no project task waiting, Today offers one small ladder topic as a labelled free pick. */
(function(){
'use strict';
const SESS=25;                                   // minutes one session counts for in the maths below
const NEWT={exam:'Exam',test:'Test',competition:'Competition',application:'Application'};
for(const k in NEWT){EVT[k]=NEWT[k];if(!EV_USER.includes(k))EV_USER.push(k)}
const css=document.createElement('style');
css.textContent='.k-exam{color:var(--c-sec)}.k-test{color:var(--c-gfx)}.k-competition{color:var(--c-ai)}.k-application{color:var(--c-sys)}'
 +'.pstat{margin:.3rem 0 0;font-size:.9rem}.pstat.tight,.pstat.behind{color:var(--c-gfx)}'
 +'.cm{display:flex;justify-content:space-between;gap:1rem;padding:.35rem 0;font-size:.95rem;border-top:1px solid var(--line)}'
 +'.cm .d{color:var(--mute);white-space:nowrap;font-size:.85rem}.cmh{display:flex;justify-content:space-between;align-items:center;gap:.5rem}.cmh h2{margin:0}';
document.head.append(css);

/* ---------- progress and status of a project ---------- */
function minsLeft(p){
  let m=0;
  for(const t of (p.file?[]:(p.tasks||[])))if(!isDone('pt:'+p.id+':'+t.id))m+=t.min||SESS;
  for(const id of needsOf(p))if(idx[id]&&!isDone(id))m+=idx[id].min||SESS;
  return m;
}
function perWeek(){                                // sessions per week the log shows over 4 weeks; the weekly goal until there is data
  const cut=Date.now()-28*DAY,n=S.log.filter(l=>l.ts>=cut).length;
  return n>=3?n/4:GOAL;
}
function status(p){
  const left=minsLeft(p),sess=Math.ceil(left/SESS);
  if(!left)return{k:'done',t:'Everything planned is done. Ship it and keep the proof.'};
  const dl=daysTo(p.deadline);
  if(dl==null)return{k:'open',t:'No deadline set. About '+sess+' session'+(sess===1?'':'s')+' of work left.'};
  if(dl<0)return{k:'behind',t:'Past its date. Move the date or cut scope. About '+sess+' sessions left.'};
  const cap=Math.max(dl,1)/7*perWeek()*SESS,r=cap/left;
  if(r>=1.2)return{k:'ok',t:'On track: about '+sess+' sessions left, '+dl+' day'+(dl===1?'':'s')+' to go.'};
  if(r>=.8)return{k:'tight',t:'Tight: about '+sess+' sessions left in '+dl+' day'+(dl===1?'':'s')+'. One extra session a week would help.'};
  return{k:'behind',t:'Behind: about '+sess+' sessions left in '+dl+' day'+(dl===1?'':'s')+'. Cut scope or move the date.'};
}
window.projStatus21=status;

/* ---------- planner: projects, deadlines, events; floors only if switched on ---------- */
window.pick=function(o){
  o=o||{};const now=Date.now(),sc={},why={};
  if(S.pin&&idx[S.pin]&&!isDone(S.pin)&&ready(idx[S.pin])){const n=idx[S.pin];return{n,lad:n.lad,why:'You chose this from the roadmap'}}
  const add=(id,s,w)=>{sc[id]=(sc[id]||0)+s;(why[id]=why[id]||[]).push([s,w])};
  const fp=focusP();
  for(const p of allProjects()){
    if(p.status==='paused')continue;
    const f=fp?(fp.id===p.id?1:.25):1,best={};
    needsOf(p).forEach((nid,i)=>{
      if(isDone(nid)||!idx[nid])return;
      const base=p.priority*p.priority*Math.max(10-i,2);
      for(const c of closure(nid)){
        if(isDone(c)||!ready(idx[c]))continue;
        const s=c===nid?base:base*.9;
        if(!best[c]||best[c].s<s)best[c]={s,w:c===nid?p.name+' needs this':p.name+' needs '+short(idx[nid]).toLowerCase()+', and this comes first'};
      }
    });
    for(const c in best)add(c,best[c].s*f,best[c].w);
  }
  for(const p of S.projects){
    if(p.status==='paused')continue;
    const f=fp?(fp.id===p.id?1:.25):1,t=ptNodes(p).find(n=>!isDone(n.id)&&!(S.later[n.id]>now));
    if(!t)continue;
    const dl=daysTo(p.deadline);
    add(t.id,p.priority*p.priority*12*f+(dl!=null?Math.max(0,20-dl)*.5*f:0),p.name+(fp&&fp.id===p.id?' is your focus project':' is one of your projects')+(dl!=null?(dl>=0?', due in '+dl+' days':', past its date'):''));
  }
  for(const e of D.events){
    const ed=evDate(e);if(!ed)continue;
    const dd=daysTo(ed);if(dd==null||dd<0)continue;             // a passed event adds nothing
    const days=Math.max((new Date(ed+'T00:00:00')-now)/DAY,3);
    if(days>180)continue;
    const u=(e.weight||0)*300/days;if(!u)continue;
    for(const t of (e.prep||[])){
      const ids=idx[t]?[t]:[(D.ladders.find(l=>l.id===t)||{nodes:[]}).nodes.find(n=>!isDone(n.id)&&ready(n))?.id].filter(Boolean);
      for(const nid of ids)for(const c of closure(nid))if(!isDone(c)&&ready(idx[c]))add(c,u,e.name+' in '+Math.round(days)+' days');
    }
  }
  if(S.floors){                                                   // old behaviour, now opt-in
    for(const l of D.ladders){
      const n=firstOpen(l);if(!n)continue;
      const gap=Math.max(0,(l.floor-weekCount(l.id))/l.floor);
      const idle=Math.min((now-(S.last[l.id]||0))/DAY,7);
      add(n.id,gap*6+idle*.4,'keeps '+l.name+' moving this week');
    }
  }
  let best=null;
  for(const id in sc){
    if(S.later[id]>now)continue;
    const cn=idx[id]||PT[id];if(o.maxMin&&cn&&(cn.min||25)>o.maxMin)continue;
    if(!best||sc[id]>best.s)best={id,s:sc[id]};
  }
  if(!best){                                                      // nothing from projects or dates: one small labelled free pick
    for(const cap of (o.maxMin?[o.maxMin,0]:[0])){
      let fb=null;
      for(const l of D.ladders){
        const n=firstOpen(l);if(!n)continue;
        if(cap&&(n.min||25)>cap)continue;
        const t=S.last[l.id]||0;if(!fb||t<fb.t)fb={n,t};
      }
      if(fb)return{n:fb.n,lad:fb.n.lad,why:'Free pick: no project task is waiting. Add a project to steer your days'};
    }
    return null;
  }
  const n=idx[best.id]||PT[best.id],reasons=why[best.id].sort((a,b)=>b[0]-a[0]).slice(0,2).map(r=>r[1]);
  return{n,lad:n.lad,why:reasons.join('; ')};
};

/* ---------- Home: focus project first, Coming up second ---------- */
function comingBox(){
  let c=$('coming');
  if(!c){c=el('section','card');c.id='coming';c.setAttribute('aria-label','Coming up');$('goal').after(c)}
  return c;
}
function inDays(it){
  const a=daysTo(it.date),b=daysTo(endOf(it));
  if(a<=0&&b>=0)return a===0?'today':'on now';
  return a===1?'tomorrow':'in '+a+' days';
}
function renderComing(){
  const c=comingBox();c.textContent='';
  const items=calItems().filter(it=>it.date&&daysTo(endOf(it))>=0&&!it.paused)
    .sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name)).slice(0,3);
  const h=el('div','cmh'),bt=el('button','mini','Month');bt.type='button';bt.onclick=()=>setView('calendar');
  h.append(el('h2',null,'Coming up'),bt);c.append(h);
  if(!items.length){c.append(el('p','sub','Nothing dated yet. Add an exam, test or competition on the Month tab, or give a project a deadline.'));return}
  for(const it of items){
    const r=el('div','cm'),l=el('span');
    l.append(el('span','chip k-'+it.k,EVT[it.k]),document.createTextNode(it.name));
    r.append(l,el('span','d',inDays(it)+(it.est?' (est.)':'')));c.append(r);
  }
}
window.renderGoal=function(){
  const g=$('goal');g.textContent='';
  const ps=allProjects().filter(p=>p.status!=='paused');
  const p=focusP()||ps.slice().sort((a,b)=>b.priority-a.priority)[0]||null;
  const t=el('div');let frac=0;
  if(p){
    const pr=projProg(p),s=status(p),dl=daysTo(p.deadline);
    frac=pr.tot?pr.d/pr.tot:0;
    t.append(el('p','sub',S.focus===p.id?'Focus project':'Project'),el('h2',null,p.name),
      el('p','sub',pr.d+' of '+pr.tot+' '+pr.unit+(dl!=null?(dl>=0?' · due '+(dl===0?'today':'in '+dl+' days'):' · past its date'):'')),
      el('p','sub pstat '+s.k,s.t));
    if(p.done)t.append(el('p','sub','Done looks like: '+p.done));
  }else{
    t.append(el('p','sub','Project'),el('h2',null,'No project yet'),el('p','sub','Add the project you are building and your days will follow it.'));
    const b=el('button','mini','Add a project');b.type='button';b.onclick=()=>setView('projects');t.append(b);
  }
  if(P){
    const ss=P.stages.map(s=>({s,x:stageStats(s)})),i=ss.findIndex(o=>o.x.qd<o.x.q||o.x.md<o.x.ms.length),k=i<0?ss.length-1:i;
    t.append(el('p','sub','Checklist · Phase '+(k+1)+': '+ss[k].s.name+' · '+Math.round(ss[k].x.all*100)+'%'));
  }
  const ring=el('div','gring');
  ring.innerHTML='<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="bg" cx="50" cy="50" r="44"/><circle class="fg" cx="50" cy="50" r="44" stroke-dasharray="276.46" stroke-dashoffset="'+(276.46*(1-frac)).toFixed(2)+'"/></svg>';
  ring.append(el('b',null,Math.round(frac*100)+'%'));
  g.append(ring,t);
  renderComing();
};

/* ---------- switch for the old weekly floors ---------- */
function floorsToggle(){
  const box=document.querySelector('#more > div');
  if(!box||$('floorsBtn'))return;
  const s=el('section','proj'),b=el('button','mini');
  b.id='floorsBtn';b.type='button';
  const lab=()=>{b.textContent='Weekly ladder floors: '+(S.floors?'on':'off')};
  b.onclick=()=>{S.floors=!S.floors;save();lab();render()};lab();
  s.append(el('h2',null,'Ladders'),
    el('p','sub','Off: only projects, deadlines and events choose your task. On: every ladder also gets a weekly minimum.'),b);
  box.append(s);
}
floorsToggle();
if(typeof D!=='undefined'&&D&&typeof idx!=='undefined')renderAll();   // data may have loaded before this file did
})();
