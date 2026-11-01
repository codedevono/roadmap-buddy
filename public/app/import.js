/* Roadmap import, shown at the bottom of the Topics tab. Loaded after the main script.
   It wraps build() (merges imported ladders, adds due-date events), renderRoadmap() (import box, ladder notes),
   topicRow() and render() (links and due dates), and calItems() (hides finished due dates).
   It also adds: Backup everything and Restore (Home tools box), a Projects tab in the bottom bar
   (the Rewards tab moves behind the level bar at the top and a button in the Home tools box). */
(function(){
const css=document.createElement('style');
css.textContent='.imp textarea{display:block;width:100%;min-height:9rem;font:13px/1.4 ui-monospace,Menlo,Consolas,monospace;color:var(--ink);background:transparent;border:1.5px solid var(--line);border-radius:.7rem;padding:.6rem;margin:.5rem 0}.imp .acts{flex-wrap:wrap;margin:.3rem 0}'
 +'.lks{display:flex;flex-wrap:wrap;gap:.4rem;margin:.4rem 0 .8rem}.lks a{display:inline-flex;align-items:center;gap:.35rem;min-height:2.75rem;max-width:100%;padding:.2rem .8rem;border:1.5px solid var(--line);border-radius:.7rem;font-size:.85rem;color:var(--accent);text-decoration:none;overflow:hidden;white-space:nowrap}.lks a b{font-weight:inherit;overflow:hidden;text-overflow:ellipsis}.lks a small{color:var(--mute);font-size:.72rem}.lks a:focus-visible{outline:3px solid var(--accent);outline-offset:2px}'
 +'.lmeta{padding:.2rem 1rem .5rem}.lmeta .lks{margin:.3rem 0 .2rem}'
 +'.hud[role=button]{cursor:pointer}.hud[role=button]:focus-visible{outline:2px solid var(--accent);outline-offset:2px}'
 +'.foot{flex-wrap:wrap}.foot button{min-width:7rem}';
document.head.append(css);

/*VET*/
const IDRE=/^[a-z0-9][a-z0-9_-]*$/;
const KINDS=['video','docs','course','book','practice','other'];
const ETYPES=['milestone','hackathon','ctf','contest','gsoc','internship','personal','exam','test','competition','application'];
const PTYPES=['web','hardware','game','security','research','other'];
const isoOk=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(new Date(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const timeOk=s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
/* A link is {"t":"Title","u":"https://...","kind":"video","free":true} or just "https://...". Only http and https. */
function linkOf(k){
  let t='',u='';const o=k&&typeof k==='object'?k:{};
  if(typeof k==='string')u=k.trim();
  else{u=typeof o.u==='string'?o.u.trim():'';t=typeof o.t==='string'?o.t.trim():''}
  if(!/^https?:\/\/[^\s<>"']+$/i.test(u)||u.length>500)return null;
  let host;try{host=new URL(u).hostname.replace(/^www\./,'')}catch(e){return null}
  if(!host)return null;
  if(!t)t=host;
  if(t.length>80)t=t.slice(0,79)+'…';
  const r={t,u};
  if(KINDS.includes(o.kind))r.kind=o.kind;
  if(typeof o.free==='boolean')r.free=o.free;
  return r;
}
function linkList(raw,who,out){
  if(!Array.isArray(raw)){out.err.push(who+': links must be a list');return null}
  const ok=[];
  raw.forEach((k,i)=>{
    const x=linkOf(k);
    if(!x){out.err.push(who+': link '+(i+1)+' needs an http or https address, like {"t":"Title","u":"https://..."}');return}
    if(k&&typeof k==='object'&&k.kind!=null&&!KINDS.includes(k.kind))out.warn.push(who+': link kind "'+k.kind+'" ignored; use '+KINDS.join(', '));
    ok.push(x);
  });
  if(ok.length>8)out.warn.push(who+': '+ok.length+' links; only the first 8 are shown');
  out.links+=ok.length;return ok;
}
function vet(text,have,haveL){
  const out={err:[],warn:[],ladders:[],n:0,chain:0,ready:0,links:0,dues:0,events:[],project:null};
  const d=String(text||'').trim().replace(/^```[a-z]*\s*/i,'').replace(/\s*```$/,'');
  if(!d){out.err.push('Nothing pasted yet.');return out}
  let j;
  try{j=JSON.parse(d)}catch(e){
    const a=d.search(/[\[{]/),b=Math.max(d.lastIndexOf('}'),d.lastIndexOf(']'));
    try{j=JSON.parse(d.slice(a,b+1))}catch(e2){out.err.push('That is not valid JSON. Paste only the JSON block from Claude.');return out}
  }
  const L=Array.isArray(j)?j:j&&Array.isArray(j.ladders)?j.ladders:j&&Array.isArray(j.nodes)?[j]:null;
  if(!L||!L.length){out.err.push('Expected {"ladders":[...]}, a list of ladders, or one ladder.');return out}
  const meta=j&&!Array.isArray(j)&&Array.isArray(j.ladders)?j:{};
  const today=new Date().toISOString().slice(0,10);
  const seen=new Set(),g={},lads=new Set(haveL);let noTiny=0;
  for(const l of L){
    const lid=l&&l.id;
    if(!l||typeof lid!=='string'||!IDRE.test(lid)){out.err.push('Ladder id '+JSON.stringify(lid)+': use lowercase letters, digits, - or _');continue}
    if(lads.has(lid))out.err.push('Ladder id "'+lid+'" already exists. Pick a new id.');
    lads.add(lid);
    if(typeof l.name!=='string'||!l.name.trim())out.err.push(lid+': missing name');
    if(!Number.isInteger(l.floor)||l.floor<1||l.floor>7)out.err.push(lid+': floor must be a whole number from 1 to 7');
    if(l.start!=null&&!isoOk(l.start))out.err.push(lid+': start must be a real date like 2026-12-01');
    if(l.target!=null){
      if(!isoOk(l.target))out.err.push(lid+': target must be a real date like 2027-08-31');
      else if(isoOk(l.start)&&l.target<l.start)out.err.push(lid+': target is before start');
      else if(l.target<today)out.warn.push(lid+': target date is in the past');
    }
    if(l.note!=null&&(typeof l.note!=='string'||l.note.length>400))out.err.push(lid+': note must be text, up to 400 characters');
    const lraw=l.links!=null?l.links:l.resources;
    delete l.resources;
    if(lraw==null)delete l.links;else{const x=linkList(lraw,lid+' (ladder)',out);if(x)l.links=x}
    if(!Array.isArray(l.nodes)||!l.nodes.length){out.err.push(lid+': needs a list of topics');continue}
    if(l.nodes.length>40)out.warn.push(lid+' has '+l.nodes.length+' topics; consider splitting it');
    for(const n of l.nodes){
      const nid=n&&n.id;
      if(!n||typeof nid!=='string'||!IDRE.test(nid)){out.err.push('Topic id '+JSON.stringify(nid)+' in '+lid+': use lowercase letters, digits, - or _');continue}
      if(seen.has(nid)||have.has(nid))out.err.push('Topic id "'+nid+'" is already used');
      seen.add(nid);
      if(typeof n.t!=='string'||!n.t.trim())out.err.push(nid+': missing title');
      else if(n.t.length>160)out.warn.push(nid+': title is long');
      if(!Number.isInteger(n.min)||n.min<5||n.min>90)out.err.push(nid+': min must be 5 to 90 minutes');
      else if(n.min>60)out.warn.push(nid+': '+n.min+' minutes is long for one sitting');
      if(n.tiny==null)noTiny++;
      else if(typeof n.tiny!=='string'||!n.tiny.trim())out.err.push(nid+': tiny must be text');
      if(n.due!=null){
        if(!isoOk(n.due))out.err.push(nid+': due must be a real date like 2026-12-31');
        else{out.dues++;if(n.due<today)out.warn.push(nid+': due date is in the past')}
      }
      const raw=n.links!=null?n.links:n.resources;
      delete n.resources;
      if(raw==null)delete n.links;else{const x=linkList(raw,nid,out);if(x)n.links=x}
      const nd=n.needs==null?[]:n.needs;
      if(!Array.isArray(nd)||nd.some(x=>typeof x!=='string')){out.err.push(nid+': needs must be a list of ids');g[nid]=[];continue}
      g[nid]=nd;
    }
  }
  if(noTiny)out.warn.push(noTiny+' topics have no tiny step');
  /* events: dated things that come with the roadmap (exams, contests ...) */
  if(meta.events!=null){
    if(!Array.isArray(meta.events))out.err.push('events must be a list');
    else{
      if(meta.events.length>30)out.err.push('At most 30 events in one file');
      meta.events.slice(0,30).forEach((e,i)=>{
        const w='Event '+(i+1);
        if(!e||typeof e!=='object'){out.err.push(w+': must be an object');return}
        const name=typeof e.name==='string'?e.name.trim():'';
        if(!name||name.length>100)out.err.push(w+': name is required, up to 100 characters');
        if(!ETYPES.includes(e.type))out.err.push(w+': type must be one of '+ETYPES.join(', '));
        if(!isoOk(e.date))out.err.push(w+': date must be a real date like 2027-08-20');
        if(e.end!=null&&(!isoOk(e.end)||(isoOk(e.date)&&e.end<e.date)))out.err.push(w+': end must be a real date on or after the start');
        if(e.time!=null&&!timeOk(e.time))out.err.push(w+': time must look like 09:30');
        if(e.etime!=null&&!timeOk(e.etime))out.err.push(w+': etime must look like 11:00');
        if(e.note!=null&&(typeof e.note!=='string'||e.note.length>500))out.err.push(w+': note must be text, up to 500 characters');
        out.events.push({name,type:e.type,date:e.date,end:e.end||'',time:e.time||'',etime:e.etime||'',note:typeof e.note==='string'?e.note.trim():''});
      });
    }
  }
  /* project: arrives as Planned, with dated milestones */
  if(meta.project!=null){
    const p=meta.project;
    if(!p||typeof p!=='object'||Array.isArray(p))out.err.push('project must be an object');
    else{
      const name=typeof p.name==='string'?p.name.trim():'';
      if(!name||name.length>80)out.err.push('project: name is required, up to 80 characters');
      for(const k of ['goal','done'])if(p[k]!=null&&(typeof p[k]!=='string'||p[k].length>200))out.err.push('project: '+k+' must be text, up to 200 characters');
      if(p.deadline!=null&&!isoOk(p.deadline))out.err.push('project: deadline must be a real date like 2027-08-31');
      if(p.priority!=null&&![1,2,3].includes(p.priority))out.err.push('project: priority must be 1, 2 or 3');
      if(p.type!=null&&!PTYPES.includes(p.type))out.err.push('project: type must be one of '+PTYPES.join(', '));
      const ms=p.milestones==null?[]:p.milestones;
      if(!Array.isArray(ms)||ms.length>12)out.err.push('project: milestones must be a list of at most 12');
      const mo=[];
      if(Array.isArray(ms))ms.slice(0,12).forEach((m,i)=>{
        const t=m&&typeof m.t==='string'?m.t.trim():'';
        if(!t||t.length>100)out.err.push('project milestone '+(i+1)+': t is required, up to 100 characters');
        if(m&&m.date!=null&&!isoOk(m.date))out.err.push('project milestone '+(i+1)+': date must be a real date');
        mo.push({t,date:m&&isoOk(m.date)?m.date:''});
      });
      out.project={name,goal:(p.goal||'').trim(),done:(p.done||'').trim(),deadline:p.deadline||'',priority:p.priority||2,type:p.type||'other',milestones:mo};
    }
  }
  let ready=0;
  for(const k in g){
    for(const x of g[k]){if(x===k)out.err.push(k+': needs itself');else if(!seen.has(x)&&!have.has(x))out.err.push(k+': needs "'+x+'", which does not exist')}
    if(g[k].every(x=>have.has(x)))ready++;
  }
  const col={},dep={};
  const visit=(u,p)=>{
    if(col[u]===2)return dep[u];
    if(col[u]===1){out.err.push('Cycle: '+p.slice(p.indexOf(u)).join(' -> '));return 0}
    col[u]=1;let m=1;
    for(const v of g[u])if(v in g)m=Math.max(m,1+visit(v,p.concat(v)));
    col[u]=2;dep[u]=m;return m;
  };
  for(const u in g)out.chain=Math.max(out.chain,visit(u,[u]));
  out.n=Object.keys(g).length;out.ready=ready;out.ladders=L;
  return out;
}
/*END*/

/* Imported roadmaps live in S.ladders (on this device) and are merged into D.ladders on every build. */
function merge(){const h=new Set(D.ladders.map(l=>l.id));for(const l of S.ladders||[])if(!h.has(l.id))D.ladders.push(JSON.parse(JSON.stringify(l)))}
/* A topic "due" date and a ladder "target" date become dated events: they show in Month, the 7-day strip and Coming up,
   and they add planner pressure through the same prep/weight rule as every other event. Rebuilt on each build(). */
function synEvents(){
  D.events=D.events.filter(e=>!e.syn);
  for(const l of D.ladders){
    if(isoOk(l.target))D.events.push({id:'tgt-'+l.id,syn:true,name:l.name+' target',type:'deadline',date:l.target,weight:.6,prep:[l.id],note:'Target date from the roadmap import.'});
    for(const n of l.nodes)if(isoOk(n.due))D.events.push({id:'due-'+n.id,syn:true,name:short(n)+' due',type:'deadline',date:n.due,weight:1,prep:[n.id],note:'Due date from the roadmap import.'});
  }
}
const _b=build;build=function(){if(D&&D.ladders){merge();if(D.events)synEvents()}_b()};
const _ci=calItems;
calItems=function(){
  return _ci().filter(it=>{
    const e=it.fid&&D.events.find(x=>x.id===it.fid);
    if(!e||!e.syn)return true;
    return !(e.prep||[]).every(t=>idx[t]?isDone(t):(D.ladders.find(l=>l.id===t)||{nodes:[]}).nodes.every(n=>isDone(n.id)));
  });
};
const haveIds=()=>new Set(D.ladders.flatMap(l=>l.nodes.map(n=>n.id)));
const haveLads=()=>new Set(D.ladders.map(l=>l.id));

/* Links: buttons under a topic (Topics, Path), under the Why line on Today, and on a ladder. Free links first.
   Checked again here, so a hand-edited backup cannot put anything but http or https on screen. */
function linksBox(n){
  const L=((n&&Array.isArray(n.links))?n.links:[]).map(linkOf).filter(Boolean).slice(0,8)
    .sort((a,b)=>(b.free===true)-(a.free===true));
  if(!L.length)return null;
  const d=el('div','lks');
  for(const x of L){
    const a=document.createElement('a'),tag=[x.kind&&x.kind!=='other'?x.kind:'',x.free===true?'free':x.free===false?'paid':''].filter(Boolean).join(', ');
    a.href=x.u;a.target='_blank';a.rel='noopener noreferrer';
    a.setAttribute('aria-label',x.t+(tag?' ('+tag+')':'')+', opens in a new tab');
    a.append(el('b',null,x.t));
    if(tag)a.append(el('small',null,tag));
    d.append(a);
  }
  return d;
}
const _tr=topicRow;
topicRow=function(n,o){
  const r=_tr(n,o),b=r.querySelector('.tb');
  if(!b)return r;
  const ref=b.querySelector('.acts');
  if(n.due&&!isDone(n.id)){const dd=daysTo(n.due);b.insertBefore(el('div','sub','Due '+fmt(n.due)+(dd!=null&&dd<0?' · date passed':'')),ref)}
  const x=linksBox(n);if(x)b.insertBefore(x,ref);
  return r;
};
const _rn=render;
render=function(){
  _rn();
  const f=$('focus'),x=cur&&cur.n?linksBox(cur.n):null;
  if(!f||!x)return;
  const w=f.querySelector('.why')||f.querySelector('.hint');
  if(w)w.after(x);
};
function ladderMeta(l){
  const lk=linksBox(l);
  if(!l.note&&!l.start&&!l.target&&!lk)return null;
  const d=el('div','lmeta');
  if(l.note)d.append(el('div','sub',l.note));
  if(l.start||l.target){
    const bits=[],ds=isoOk(l.start)?daysTo(l.start):null,left=l.nodes.filter(n=>!isDone(n.id)).length;
    if(ds!=null&&ds>0)bits.push('Starts '+fmt(l.start));
    if(isoOk(l.target)){
      bits.push('Target '+fmt(l.target));
      if(!left)bits.push('all done');
      else{
        const dt=daysTo(l.target);
        if(dt<0)bits.push('date passed, '+left+' topic'+(left===1?'':'s')+' left');
        else{const wk=Math.max(1,Math.ceil(Math.max(1,dt-Math.max(0,ds||0))/7));bits.push(left+' topic'+(left===1?'':'s')+' left, about '+Math.ceil(left/wk)+' a week')}
      }
    }
    if(bits.length)d.append(el('div','sub',bits.join(' · ')));
  }
  if(lk)d.append(lk);
  return d;
}

/* ---------- the import box ---------- */
const AI_SPEC=`Build me a learning roadmap for the Roadmap Buddy app. Output ONLY one JSON object in a code block, no other text.

Shape:
{"ladders":[LADDER,...],"events":[EVENT,...],"project":PROJECT}
"events" and "project" are optional.

LADDER = {"id":"german","name":"German A1 to B1","floor":2,"start":"2026-12-01","target":"2027-08-31","note":"one line about the plan","links":[LINK],"nodes":[TOPIC,...]}
- id: lowercase letters, digits, - or _. floor: 1 to 7 (sessions per week this ladder deserves). start, target, note and links are optional.

TOPIC = {"id":"ger1","t":"Alphabet and greetings","min":30,"tiny":"Watch the first 5 minutes of lesson 1","needs":["ger0"],"due":"2027-01-15","links":[LINK]}
- id: unique across the whole file, lowercase. min: 5 to 90 minutes for one sitting, so split big topics. tiny: the smallest first step. needs: ids of topics that must be done first (no cycles). due and links are optional.

LINK = {"t":"Short title","u":"https://...","kind":"video","free":true}
- u must start with https:// or http://. Only use addresses you are sure exist; if unsure, leave the link out. kind: video, docs, course, book, practice or other. free: true or false. Give 1 to 4 links per topic where useful, best first.

EVENT = {"name":"Goethe B1 exam","type":"exam","date":"2027-08-20","time":"09:00","note":"book 8 weeks before"}
- type: exam, test, competition, application, hackathon, ctf, contest, gsoc, internship, milestone or personal. Dates are YYYY-MM-DD. time, end, etime and note are optional.

PROJECT = {"name":"Ausbildung in Germany","goal":"one line","done":"what done looks like, as proof","deadline":"2027-08-31","priority":2,"type":"other","milestones":[{"t":"B1 certificate","date":"2027-08-20"}]}
- priority 1 to 3. type: web, hardware, game, security, research or other. 3 to 5 milestones with dates.`;

const impBox=document.createElement('details');impBox.className='lad imp';
const sm=el('summary');sm.append(el('span','ln','Roadmaps'),el('span','lc','Import'));
const body=el('div');body.style.padding='0 1rem 1rem';
const ta=document.createElement('textarea');ta.setAttribute('aria-label','Roadmap JSON');ta.placeholder='Paste the JSON from your AI here';
const msg=el('div');msg.setAttribute('aria-live','polite');
const fi=document.createElement('input');fi.type='file';fi.accept='application/json,.json';fi.hidden=true;
const lst=el('div'),acts=el('div','acts');
impBox.append(sm,body);

function show(r,added){
  msg.textContent='';
  for(const e of r.err.slice(0,8)){const x=el('div','sub','✗ '+e);x.style.color='var(--c-sec)';msg.append(x)}
  if(r.err.length>8)msg.append(el('div','sub','and '+(r.err.length-8)+' more errors'));
  for(const w of r.warn.slice(0,6))msg.append(el('div','sub','! '+w));
  if(!r.err.length){
    const bits=[r.ladders.length+' ladder'+(r.ladders.length===1?'':'s'),r.n+' topics'];
    if(r.links)bits.push(r.links+' link'+(r.links===1?'':'s'));
    if(r.dues)bits.push(r.dues+' due date'+(r.dues===1?'':'s'));
    if(r.events.length)bits.push(r.events.length+' event'+(r.events.length===1?'':'s'));
    if(r.project)bits.push('project "'+r.project.name+'" (arrives as Planned)');
    msg.append(el('div','sub',(added?'Added: ':'OK: ')+bits.join(', ')+'. Longest chain '+r.chain+', '+r.ready+' ready to start now.'));
  }
}
function applyExtras(r){
  const a={ev:0,proj:null,dup:false};
  r.events.forEach((e,i)=>{
    if(S.events.some(x=>x.name===e.name&&x.date===e.date))return;
    S.events.push(Object.assign({id:'i'+Date.now().toString(36)+i},e));a.ev++;
  });
  if(r.project){
    const p=r.project;
    if(S.projects.some(x=>x.name===p.name))a.dup=true;
    else{
      const st=Date.now().toString(36);
      S.projects.push({id:'u'+st+'r',status:'paused',state:'planned',name:p.name,goal:p.goal,done:p.done,deadline:p.deadline,priority:p.priority,type:p.type,needs:[],ladders:r.ladders.map(l=>l.id),tasks:[],
        ms:p.milestones.map((m,i)=>({id:'m'+st+i,t:m.t,date:m.date,done:false}))});
      a.proj=p.name;
    }
  }
  return a;
}
function run(add){
  if(!D){show({err:['Still loading. Try again in a moment.'],warn:[],ladders:[],events:[]});return}
  const r=vet(ta.value,haveIds(),haveLads());
  show(r);
  if(!add||r.err.length)return;
  S.ladders=(S.ladders||[]).concat(JSON.parse(JSON.stringify(r.ladders)));
  const a=applyExtras(r);
  save();build();ta.value='';renderAll();show(r,true);
  if(a.dup)msg.append(el('div','sub','! A project named "'+r.project.name+'" already exists, so the project part was skipped.'));
  if(r.events.length-a.ev>0)msg.append(el('div','sub','! '+(r.events.length-a.ev)+' event(s) were already on your calendar and were skipped.'));
  if(a.proj)msg.append(el('div','sub','Open Projects, open "'+a.proj+'" and make it Active to put it into your days.'));
  toast('Added '+r.n+' topics');
}
function drawList(){
  lst.textContent='';
  const A=S.ladders||[];
  if(!A.length)lst.append(el('p','sub','No imported roadmaps yet.'));
  for(const l of A){
    const nl=l.nodes.reduce((a,n)=>a+(Array.isArray(n.links)?n.links.length:0),0);
    const r=el('div','p-row');r.append(el('span',null,l.name+' · '+l.nodes.length+' topics'+(nl?' · '+nl+' links':'')));
    const b=el('button','mini','Remove');b.setAttribute('aria-label','Remove '+l.name);b.onclick=()=>removeLad(l.id);r.append(b);lst.append(r);
  }
}
function removeLad(id){
  const l=(S.ladders||[]).find(x=>x.id===id);if(!l)return;
  const mine=new Set(l.nodes.map(n=>n.id));
  const dep=D.ladders.filter(x=>x.id!==id).flatMap(x=>x.nodes).filter(n=>(n.needs||[]).some(k=>mine.has(k)));
  const used=S.projects.filter(p=>(p.ladders||[]).includes(id)||(p.needs||[]).some(k=>mine.has(k)));
  if(used.length){show({err:['Cannot remove '+l.name+': the project "'+used[0].name+'" uses it. Edit the project first.'],warn:[],ladders:[],events:[]});return}
  if(dep.length){show({err:['Cannot remove '+l.name+': '+dep.length+' other topics need it, for example "'+short(dep[0])+'".'],warn:[],ladders:[],events:[]});return}
  if(!confirm('Remove '+l.name+' from this device? Your progress is kept if you add it again.'))return;
  S.ladders=S.ladders.filter(x=>x.id!==id);D.ladders=D.ladders.filter(x=>x.id!==id);
  if(S.pin&&mine.has(S.pin))S.pin=null;
  save();build();renderAll();
}
const mk=(t,f)=>{const b=el('button','mini',t);b.type='button';b.onclick=f;acts.append(b)};
mk('Check',()=>run(false));
mk('Add to my app',()=>run(true));
mk('Load a .json file',()=>fi.click());
mk('Copy AI instructions',async()=>{
  try{await navigator.clipboard.writeText(AI_SPEC);toast('Instructions copied. Paste them into your AI, add your topic, then paste its JSON here.')}catch(e){prompt('Copy this:',AI_SPEC)}
});
mk('Copy backup',async()=>{
  const j=JSON.stringify({ladders:S.ladders||[]},null,1);
  try{await navigator.clipboard.writeText(j);toast('Roadmap backup copied. Paste it here to restore.')}catch(e){prompt('Copy this:',j)}
});
fi.onchange=()=>{const f=fi.files[0];if(f)f.text().then(t=>{ta.value=t;run(false)})};
body.append(el('p','sub','Roadmaps you add here live on this device. Tap "Copy AI instructions", give them to your AI with your topic, then paste its JSON below. Topics can carry links, due dates and a ladder target date; the file can also bring events and a project.'),
  ta,acts,fi,msg,lst);

const _rr=renderRoadmap;
renderRoadmap=function(){
  _rr();drawList();
  const root=$('v-roadmap');
  for(const det of root.querySelectorAll('details.lad')){
    const nm=det.querySelector('.ln');if(!nm||det.classList.contains('imp'))continue;
    const l=D.ladders.find(x=>x.name===nm.textContent),m=l&&ladderMeta(l);
    if(m)det.querySelector('summary').after(m);
  }
  root.append(impBox);
};

/* ---------- Backup everything and Restore (Home tools box) ---------- */
function backupAll(){
  const j=JSON.stringify({buddy:'backup',v:1,at:new Date().toISOString(),S},null,1);
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([j],{type:'application/json'}));
  a.download='buddy-backup-'+ymd(new Date())+'.json';document.body.append(a);a.click();a.remove();
  try{navigator.clipboard.writeText(j)}catch(e){}
  toast('Backup saved as a file and copied. Keep it somewhere safe.');
}
function restoreAll(txt){
  let j;try{j=JSON.parse(txt)}catch(e){toast('That file is not a Buddy backup');return}
  if(!j||j.buddy!=='backup'||!j.S||typeof j.S!=='object'||Array.isArray(j.S)){toast('That file is not a Buddy backup');return}
  const when=j.at&&!isNaN(new Date(j.at))?new Date(j.at).toLocaleString():'an unknown date';
  if(!confirm('Replace everything on this device with the backup from '+when+'? Progress made since then is lost.'))return;
  S=Object.assign(blank(),j.S);S.tm=null;save();
  toast('Backup restored. Reloading.');setTimeout(()=>location.reload(),700);
}
const foot=$('reset')&&$('reset').parentNode;
if(foot){
  const f2=el('div','foot'),bk=el('button',null,'Backup everything'),rs=el('button',null,'Restore'),rf=document.createElement('input');
  bk.type=rs.type='button';rf.type='file';rf.accept='application/json,.json';rf.hidden=true;
  bk.onclick=backupAll;rs.onclick=()=>rf.click();rf.onchange=()=>{const f=rf.files[0];if(f)f.text().then(restoreAll);rf.value=''};
  f2.append(bk,rs,rf);foot.after(f2);
}

/* ---------- navigation: Projects in the bottom bar; Rewards behind the level bar and the Home tools box ---------- */
const rb=document.querySelector('.bnav button[data-v="rewards"]');
if(rb){
  rb.dataset.v='projects';
  const sp=rb.querySelector('span');if(sp)sp.textContent='Projects';
  const sv=rb.querySelector('svg');if(sv)sv.innerHTML='<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>';
  rb.setAttribute('aria-selected',String(view==='projects'));
}
const hud=document.querySelector('.hud');
if(hud){
  hud.setAttribute('role','button');hud.tabIndex=0;hud.setAttribute('aria-label','Level and XP. Open rewards');
  hud.onclick=()=>setView('rewards');
  hud.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setView('rewards')}};
}
const gp=$('goProj');
if(gp){const rw=el('button','mini','Rewards');rw.type='button';rw.onclick=()=>setView('rewards');gp.after(rw)}
})();

/* v2.1: load the project-first layer (v21.js), then the Google Calendar bridge (gcal.js), then the space theme (space.js) and the star map (starmap.js), after this file. */
(function(){for(const f of ['v21.js','gcal.js','space.js','starmap.js']){const s=document.createElement('script');s.src='app/'+f;s.async=false;document.body.append(s)}})();
