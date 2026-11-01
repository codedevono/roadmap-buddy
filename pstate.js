/* Roadmap Buddy: project states, milestones, proof and the project page.
   Loaded last (space.js adds it). Wraps allProjects, calItems and renderGoal; replaces renderProjects.
   A project made in the app keeps its state, milestones, note and proof on the project itself (so Export projects carries them).
   A file project (projects.json) keeps them in S.fpx on this device.
   Only an Active project reaches the planner: a state other than Active sets status 'paused', which index.html and v21.js already skip. */
(function(){
'use strict';
const STATES=[['idea','Idea'],['planned','Planned'],['active','Active'],['paused','Paused'],['blocked','Blocked'],['done','Done']];
const SL=Object.fromEntries(STATES);
const css=document.createElement('style');
css.textContent='.st-idea,.st-planned{color:var(--mute)}.st-active{color:var(--accent)}.st-paused{color:var(--c-gfx)}.st-blocked{color:var(--c-sec)}.st-done{color:var(--c-sys)}'
+'.pc h3{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap}.pc .chip{margin:0}'
+'.msr{display:grid;grid-template-columns:auto 1fr auto;gap:.5rem;align-items:center;padding:.4rem 0;border-top:1px solid var(--line)}'
+'.msr.done .mt{color:var(--mute);text-decoration:line-through}.msr .md{font-size:.8rem;color:var(--mute)}'
+'.pg h2{margin:1rem 0 .4rem}.pg a{color:var(--accent)}';
document.head.append(css);

const fx=()=>S.fpx||(S.fpx={});
const peek=p=>p.file?(fx()[p.id]||{}):p;                      // read
const X=p=>p.file?(fx()[p.id]||(fx()[p.id]={})):p;            // write
const stateOf=p=>peek(p).state||(p.status==='paused'?'paused':'active');
const msOf=p=>peek(p).ms||[];
const byDate=(a,b)=>(a.date||'9999').localeCompare(b.date||'9999');
const nextMs=p=>msOf(p).filter(m=>!m.done).sort(byDate)[0]||null;
const dshort=s=>fmt(s,{day:'numeric',month:'short'});
let PG=null;

/* a file project's saved state decides whether the planner sees it */
const _ap=window.allProjects;
window.allProjects=function(){return _ap().map(p=>{if(!p.file)return p;const st=(fx()[p.id]||{}).state;return st?Object.assign({},p,{status:st==='active'?'active':'paused'}):p})};

/* milestones with a date appear in the Month tab and the 7-day strip */
const _ci=window.calItems;
window.calItems=function(){
  const out=_ci();
  for(const p of allProjects()){const st=stateOf(p);if(st==='done')continue;
    for(const m of msOf(p))if(m.date&&!m.done)out.push({k:'milestone',name:p.name+': '+m.t,date:m.date,pid:p.id,paused:st!=='active'})}
  return out;
};

/* the goal card on Home also shows the next milestone and the note for next time */
const _rg=window.renderGoal;
window.renderGoal=function(){
  _rg();
  const p=focusP(),t=$('goal').lastElementChild;if(!p||!t)return;
  const nm=nextMs(p),note=peek(p).next;
  if(nm)t.append(el('p','sub','Next milestone: '+nm.t+(nm.date?' · '+dshort(nm.date):'')));
  if(note)t.append(el('p','sub','Last time: '+note));
};

function health(p){
  const st=stateOf(p),x=peek(p);
  if(st==='active')return window.projStatus21?window.projStatus21(p):null;
  if(st==='blocked')return{k:'tight',t:'Blocked: '+(x.why||'waiting on something')+'. It stays out of your days until it is Active again.'};
  if(st==='idea')return{k:'open',t:'An idea. Nothing is planned yet.'};
  if(st==='planned')return{k:'open',t:'Planned. Not in your days yet: make it Active to start.'};
  if(st==='paused')return{k:'open',t:'Paused. Nothing is owed.'};
  return{k:'done',t:'Done'+(x.doneAt?' on '+new Date(x.doneAt).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}):'')+'.'};
}
function nextTask(p){
  const t=(p.file?[]:ptNodes(p)).find(n=>!isDone(n.id));if(t)return t.t;
  const id=needsOf(p).find(i=>idx[i]&&!isDone(i)&&ready(idx[i]));return id?idx[id].t:'';
}
function setState(p,st){
  const x=X(p);
  if(st==='done'){
    const pr=x.proof||{};
    if(!/^https?:\/\/\S+$/i.test(pr.url||'')||!(pr.note||'').trim()){toast('To finish a project, add a proof link (https://…) and one line about what you learned.');return}
    x.doneAt=Date.now();
  }
  x.state=st;if(!p.file)p.status=st==='active'?'active':'paused';
  if(st!=='active'&&S.focus===p.id)S.focus=null;
  if(st==='active'&&!focusP())S.focus=p.id;
  save();renderAll();
  const n=allProjects().filter(q=>stateOf(q)==='active').length;
  if(st==='active'&&n>3)toast('You have '+n+' active projects. One focus plus two others works best.');
}

function card(p){
  const st=stateOf(p),c=el('div','card pc'),pr=projProg(p),dl=daysTo(p.deadline),hl=health(p),nm=nextMs(p);
  const h=el('h3');h.append(el('span','chip st-'+st,SL[st]),document.createTextNode(p.name+(S.focus===p.id?' ★':'')));c.append(h);
  c.append(el('p','sub',pr.d+' of '+pr.tot+' '+pr.unit+(dl!=null?' · '+(dl>=0?'due in '+dl+' days':'past its date'):'')),bar(pr.tot?pr.d/pr.tot:0));
  if(hl)c.append(el('p','sub pstat '+hl.k,hl.t));
  if(nm&&st!=='done')c.append(el('p','sub','Next milestone: '+nm.t+(nm.date?' · '+dshort(nm.date):'')));
  const row=el('div','prow'),ob=el('button','mini go','Open');ob.type='button';ob.setAttribute('aria-label','Open '+p.name);
  ob.onclick=()=>{PG=p.id;renderProjects();window.scrollTo(0,0)};row.append(ob);
  if(st==='active'){const fb=el('button','mini',S.focus===p.id?'Unfocus':'Focus');fb.type='button';fb.onclick=()=>{S.focus=S.focus===p.id?null:p.id;save();renderAll()};row.append(fb)}
  c.append(row);return c;
}
function field(parent,label,val,type,ph,on){
  const l=el('label',null,label),i=el(type==='area'?'textarea':'input');
  if(type==='area')i.rows=2;else i.type=type||'text';
  i.value=val||'';if(ph)i.placeholder=ph;i.onchange=()=>on(i.value);l.append(i);parent.append(l);return i;
}
function page(v,p){
  const x=peek(p),st=stateOf(p),pr=projProg(p),dl=daysTo(p.deadline),hl=health(p);
  const back=el('button','mini','‹ Projects');back.type='button';back.onclick=()=>{PG=null;renderProjects();window.scrollTo(0,0)};v.append(back);
  const c=el('div','card pg'),h=el('h3');
  h.append(el('span','chip st-'+st,SL[st]),document.createTextNode(p.name+(S.focus===p.id?' ★':'')));c.append(h);
  if(p.goal)c.append(el('p','sub',p.goal));
  if(p.done)c.append(el('p','sub','Done looks like: '+p.done));
  c.append(el('p','sub',pr.d+' of '+pr.tot+' '+pr.unit+(dl!=null?' · '+(dl>=0?'due in '+dl+' days ('+fmt(p.deadline)+')':'past its date ('+fmt(p.deadline)+')'):' · no deadline')),bar(pr.tot?pr.d/pr.tot:0));
  if(hl)c.append(el('p','sub pstat '+hl.k,hl.t));
  const late=msOf(p).find(m=>!m.done&&m.date&&daysTo(m.date)<0);
  if(late&&st!=='done')c.append(el('p','sub pstat tight','The date of "'+late.t+'" has passed. Finish it or move the date.'));
  const nt=nextTask(p);if(nt&&st==='active')c.append(el('p','sub','Next task: '+nt));
  c.append(el('h2',null,'State'));
  const pl=el('div','pills');
  for(const [k,l] of STATES){const b=el('button','pill'+(k===st?' on':''),l);b.type='button';b.setAttribute('aria-pressed',String(k===st));b.onclick=()=>{if(k!==st)setState(p,k)};pl.append(b)}
  c.append(pl);
  if(st==='blocked')field(c,'What is it waiting on?',x.why,'text','e.g. the display arrives on the 12th',val=>{X(p).why=val.trim();save();renderProjects()});
  field(c,'Where was I? One line for next time',x.next,'text','e.g. finished the I2C test, next wire the display',val=>{X(p).next=val.trim();save();renderGoal()});
  c.append(el('h2',null,'Milestones'));
  const L=msOf(p).slice().sort(byDate);
  if(!L.length)c.append(el('p','sub','No milestones yet. Add 3 to 5 checkpoints with dates; they show on the Month tab.'));
  for(const m of L){
    const r=el('div','msr'+(m.done?' done':'')),tg=el('button','mini',m.done?'✓':'○'),tx=el('div'),xb=el('button','mini','×');
    tg.type=xb.type='button';tg.setAttribute('aria-label',(m.done?'Mark not done: ':'Mark done: ')+m.t);xb.setAttribute('aria-label','Remove milestone '+m.t);
    tg.onclick=()=>{m.done=!m.done;save();renderAll()};
    xb.onclick=()=>{const q=X(p);q.ms=(q.ms||[]).filter(k=>k!==m);save();renderAll()};
    tx.append(el('div','mt',m.t),el('div','md',m.date?dshort(m.date)+(!m.done&&daysTo(m.date)<0?' · date passed':''):'No date'));
    r.append(tg,tx,xb);c.append(r);
  }
  const af=el('div'),mt=el('input'),md=el('input'),ab=el('button','mini go','Add milestone');
  mt.type='text';mt.placeholder='e.g. Demo video recorded';mt.setAttribute('aria-label','Milestone title');md.type='date';md.setAttribute('aria-label','Milestone date (optional)');ab.type='button';
  ab.onclick=()=>{
    if(!mt.value.trim()){toast('Give the milestone a title first');return}
    const q=X(p);(q.ms=q.ms||[]).push({id:'m'+Date.now().toString(36),t:mt.value.trim(),date:md.value||'',done:false});save();renderAll();
  };
  af.append(mt,md,ab);af.style.display='grid';af.style.gap='.4rem';af.style.marginTop='.4rem';c.append(af);
  c.append(el('h2',null,'Proof'),el('p','sub','To mark the project Done, add a link (repo, post or video) and one line about what you learned.'));
  field(c,'Proof link',(x.proof||{}).url,'url','https://…',val=>{const q=X(p);q.proof=Object.assign(q.proof||{},{url:val.trim()});save()});
  field(c,'What I learned (one line)',(x.proof||{}).note,'text','',val=>{const q=X(p);q.proof=Object.assign(q.proof||{},{note:val.trim()});save()});
  if(st==='done'&&/^https?:\/\//i.test((x.proof||{}).url||'')){const a=el('a',null,'Open the proof');a.href=x.proof.url;a.target='_blank';a.rel='noopener';c.append(a)}
  const row=el('div','prow');
  if(st==='active'){const fb=el('button',null,S.focus===p.id?'Unfocus':'Focus');fb.type='button';fb.onclick=()=>{S.focus=S.focus===p.id?null:p.id;save();renderAll()};row.append(fb)}
  if(!p.file){
    const eb=el('button',null,'Edit details'),xb=el('button',null,'Delete');eb.type=xb.type='button';
    eb.onclick=()=>openForm(p);
    xb.onclick=()=>{if(confirm('Delete '+p.name+'?')){S.projects=S.projects.filter(q=>q.id!==p.id);if(S.focus===p.id)S.focus=null;PG=null;save();renderAll()}};
    row.append(eb,xb);
  }
  if(row.childNodes.length)c.append(row);
  v.append(c);
}
window.renderProjects=function(){
  const v=$('v-projects');v.textContent='';
  if(pf){v.append(projectForm());return}
  const p=PG&&allProjects().find(q=>q.id===PG);
  if(p){page(v,p);return}
  PG=null;
  const fp=focusP();
  v.append(el('p','hint',fp?'Focus: '+fp.name+'. Today follows it first; other projects wait.':'No focus project yet. Open a project, make it Active, then Focus.'));
  const all=allProjects();
  for(const [st,label] of [['active','Active'],['planned','Planned'],['idea','Ideas'],['blocked','Blocked'],['paused','Paused'],['done','Done']]){
    const g=all.filter(p=>stateOf(p)===st);if(!g.length)continue;
    v.append(el('h2',null,label+' · '+g.length));for(const p of g)v.append(card(p));
  }
  const add=el('button','main','Add a project');add.onclick=()=>openForm(null);v.append(add);
  const io=el('div','prow'),ex=el('button',null,'Export projects'),im=el('button',null,'Import projects'),fi=el('input');
  fi.type='file';fi.accept='application/json,.json';fi.hidden=true;ex.onclick=exportP;im.onclick=()=>fi.click();fi.onchange=()=>{const f=fi.files[0];if(f)f.text().then(importP)};
  io.append(ex,im,fi);v.append(io);
  v.append(el('p','sub','State, milestones and notes of projects you add here travel with Export. Those of the built-in projects stay on this device.'));
};
/* arriving from another tab always shows the list, not the last open project */
const _sv=window.setView;
window.setView=function(v){if(v==='projects'&&view!=='projects'){PG=null;renderProjects()}return _sv(v)};
if(typeof D!=='undefined'&&D&&typeof idx!=='undefined')renderAll();
})();
