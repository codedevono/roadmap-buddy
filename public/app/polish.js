/* polish.js: Coming up card (exams, mock tests, CTFs, GSoC, deadlines), public dates in the calendar,
   hide/restore for built-in projects, and the Home layout hooks. Adds to the app; removes nothing. */
(function(){
'use strict';
const PUB_URL='data/calendar.json';
let PUB=[],DELETED=new Set();
const today=()=>ymd(new Date());
const dleft=ds=>Math.round((new Date(ds+'T00:00:00')-new Date(today()+'T00:00:00'))/864e5);
const when=ds=>{const n=dleft(ds);return n===0?'today':n===1?'tomorrow':n<0?Math.abs(n)+' days ago':'in '+n+' days'};
const nice=ds=>new Date(ds+'T00:00:00').toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
const d8=s=>s.replace(/-/g,'');
const gLink=it=>{const a=it.date,b=addDays(endOf(it),1);return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text='+encodeURIComponent(it.name)+'&dates='+d8(a)+'/'+d8(b)+'&details='+encodeURIComponent((it.note||'')+(it.url?'\n'+it.url:''))};
const KIND_NAME={exam:'Exam',test:'Mock test',ctf:'CTF',gsoc:'GSoC',contest:'Contest',hackathon:'Hackathon',deadline:'Deadline',application:'Apply',milestone:'Milestone',internship:'Internship',personal:'Personal'};

/* 1. public dates join the calendar items used by the Home strip and Coming up */
const baseItems=window.calItems;
window.calItems=function(){
  const out=baseItems();
  const have=new Set(out.map(i=>(i.name||'')+'|'+(i.date||'')));
  for(const e of PUB){const k=e.name+'|'+e.date;if(!have.has(k))out.push({k:EVT[e.type]?e.type:'personal',name:e.name,date:e.date,note:e.note,url:e.url,est:/estimate/i.test(e.name),pub:true})}
  return out;
};

/* 2. the calendar tab asks the server for a month; add the public dates of that month */
const baseFetch=window.fetch.bind(window);
window.fetch=function(u,o){
  const p=baseFetch(u,o);
  if(typeof u==='string'&&u.includes('/api/calendar/activity')){
    const m=u.match(/year=(\d+)&month=(\d+)/);
    if(!m)return p;
    const pre=m[1]+'-'+String(m[2]).padStart(2,'0');
    return p.then(r=>{const c=r.clone();return c.json().then(j=>{
      j.days=j.days||{};
      for(const e of PUB){if(!e.date||!e.date.startsWith(pre))continue;
        const d=j.days[e.date]=j.days[e.date]||{sessions_count:0,total_minutes:0,commits:[],events:[]};
        d.events=d.events||[];if(!d.events.some(x=>x.name===e.name))d.events.push({name:e.name,type:e.type,date:e.date,note:e.note||''})}
      return new Response(JSON.stringify(j),{status:r.status,headers:r.headers});
    }).catch(()=>r)});
  }
  return p;
};

/* 3. built-in projects can be hidden (and restored); projects deleted in the Projects tab stay gone on Home */
const baseAll=window.allProjects;
function hid(){S.hidFile=Array.isArray(S.hidFile)?S.hidFile:[];return S.hidFile}
window.allProjects=function(){return baseAll().filter(p=>!(p.file&&(hid().includes(p.id)||DELETED.has(p.id))))};
function hiddenFileProjects(){return ((typeof D!=='undefined'&&D)?D.projects:[]).filter(p=>hid().includes(p.id)||DELETED.has(p.id))}

function decorateProjects(){
  const pj=document.getElementById('proj');if(!pj)return;
  const list=window.allProjects().filter(p=>p.file);
  [...pj.querySelectorAll('.p-row')].forEach(row=>{
    const nm=row.firstChild&&row.firstChild.textContent||'';
    const p=list.find(x=>nm.startsWith(x.name));
    if(!p||row.querySelector('.p-hide'))return;
    const b=el('button','mini p-hide','Hide');b.type='button';b.title='Hide this built-in project from Home and planning (restorable)';
    b.onclick=()=>{hid().push(p.id);save();render()};
    row.lastChild.append(b);
  });
  pj.parentNode.querySelectorAll('.p-hidden-note').forEach(n=>n.remove());
  const hp=hiddenFileProjects().filter(p=>hid().includes(p.id));
  if(hp.length){
    const n=el('div','p-hidden-note',hp.length+' hidden: ');
    const b=el('button','mini','Restore');b.type='button';b.onclick=()=>{S.hidFile=[];save();render()};
    n.append(b);pj.after(n);
  }
}

/* 4. Coming up card */
function upcoming(){
  const t=today();
  return calItems().filter(i=>i.date&&!i.paused&&endOf(i)>=t&&i.date<=addDays(t,400))
    .sort((a,b)=>a.date.localeCompare(b.date)||(a.name||'').localeCompare(b.name||''));
}
function renderComing(){
  const host=document.getElementById('v-home');if(!host)return;
  let c=document.getElementById('comingup');
  if(!c){c=el('section','card');c.id='comingup';c.setAttribute('aria-label','Coming up');host.append(c)}
  c.textContent='';
  const items=upcoming().slice(0,10);
  const hd=el('div','cu-head');hd.append(el('h2',null,'Coming up'));
  const ob=el('button','mini','Open calendar');ob.type='button';ob.onclick=()=>window.setView('calendar');hd.append(ob);c.append(hd);
  if(!items.length)c.append(el('p','cu-empty','Nothing dated yet. Add a date in the Calendar tab.'));
  for(const it of items){
    const r=el('div','cu-row k-'+it.k);
    r.append(el('span','cu-dot'));
    const nm=el('div','cu-name');nm.append(el('span','cu-t',it.name),el('span','cu-k',(KIND_NAME[it.k]||'Event')+(it.est?' · estimated date':'')));
    const w=el('div','cu-when');w.append(el('b',null,when(it.date)),el('span',null,nice(it.date)));
    const m=el('div','cu-act');
    const a=el('a',null,'Add to calendar');a.href=gLink(it);a.target='_blank';a.rel='noopener noreferrer';m.append(a);
    if(it.url&&/^https?:/.test(it.url)){const s2=el('a',null,'Source');s2.href=it.url;s2.target='_blank';s2.rel='noopener noreferrer';m.append(s2)}
    r.append(nm,w,m);c.append(r);
  }
  const t=document.getElementById('ht-coming-n');if(t)t.textContent=items.length?String(items.length):'';
}

/* 4b. Home sub-tabs: Today | Schedule | Coming up | Summary */
const HT=[['today','Today'],['schedule','Next 7 days'],['coming','Coming up'],['summary','Summary']];
let htab='today';
try{const v=localStorage.getItem('buddy.homeTab');if(HT.some(x=>x[0]===v))htab=v}catch(e){}
function setHomeTab(k,focus){
  htab=k;try{localStorage.setItem('buddy.homeTab',k)}catch(e){}
  const host=document.getElementById('v-home');if(!host)return;
  host.dataset.ht=k;
  host.querySelectorAll('#home-tabs [role=tab]').forEach(b=>{const on=b.dataset.k===k;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;b.classList.toggle('on',on);if(on&&focus)b.focus()});
  const m=document.getElementById('more');if(m&&k==='summary')m.open=true;
}
function buildTabs(){
  const host=document.getElementById('v-home');if(!host||document.getElementById('home-tabs'))return;
  const bar=el('div');bar.id='home-tabs';bar.setAttribute('role','tablist');bar.setAttribute('aria-label','Home sections');
  for(const [k,l] of HT){
    const b=el('button','ht-btn');b.type='button';b.setAttribute('role','tab');b.dataset.k=k;
    b.append(el('span',null,l));if(k==='coming'){const n=el('span','ht-n');n.id='ht-coming-n';b.append(n)}
    b.onclick=()=>setHomeTab(k,false);
    b.onkeydown=e=>{const i=HT.findIndex(x=>x[0]===k);let j=-1;
      if(e.key==='ArrowRight')j=(i+1)%HT.length;else if(e.key==='ArrowLeft')j=(i+HT.length-1)%HT.length;
      if(j>=0){e.preventDefault();setHomeTab(HT[j][0],true)}};
    bar.append(b);
  }
  host.prepend(bar);setHomeTab(htab,false);
}

/* 5. hooks */
const baseRender=window.render;
window.render=function(){const r=baseRender.apply(this,arguments);try{buildTabs();renderComing();decorateProjects();}catch(e){console.error('polish',e)}return r};

(async function init(){
  try{const r=await baseFetch(PUB_URL);if(r.ok){const j=await r.json();PUB=(j.events||[]).filter(e=>e&&e.name&&/^\d{4}-\d{2}-\d{2}$/.test(e.date||''))}}catch(e){}
  try{const r=await baseFetch('/api/projects?include_deleted=1');if(r.ok){const j=await r.json();const L=Array.isArray(j)?j:(j.projects||[]);DELETED=new Set(L.filter(p=>p.deleted).map(p=>p.id))}}catch(e){}
  try{if(typeof D!=='undefined'&&D){render();if(typeof renderAll==='function')renderAll()}}catch(e){}
})();
})();
