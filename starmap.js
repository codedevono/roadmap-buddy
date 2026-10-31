/* starmap.js: the Path tab as a star map. Loaded by import.js after the other layers; replaces renderPath().
   One sector (phase) at a time. Stars are the phase's quests, links are their prerequisites inside the phase.
   Lit = done, ready = can start now, locked = needs something first. Milestones, bosses and the season calendar stay below the map. */
(function(){
'use strict';
const TN={sys:'Reactor',gfx:'Optics',sec:'Shields',ai:'Nav'};
const COL={sys:'#86B8EA',gfx:'#E6B95F',sec:'#F2958A',ai:'#CFA3E6'};
const LANE=['sys','sec','gfx','ai'];
const W=358,PX=54,TOP=172,CORE=48,BOSS=112,NS='http://www.w3.org/2000/svg';
let sector=null,sel=null;

const state=n=>isDone(n.id)?'done':ready(n)?'ready':'locked';
const tname=id=>TN[id]||((P.tracks.find(t=>t.id===id)||{}).name)||id;
function sv(tag,a,p){const e=document.createElementNS(NS,tag);for(const k in a)e.setAttribute(k,a[k]);if(p)p.append(e);return e}
function lines(n){                                   // label split over at most two lines
  let t=short(n);if(t.length>32)t=t.slice(0,30)+'…';
  if(t.length<=14)return[t];
  const sp=[...t].map((c,i)=>c===' '?i:-1).filter(i=>i>0);
  if(!sp.length)return[t];
  const mid=sp.reduce((a,b)=>Math.abs(b-t.length/2)<Math.abs(a-t.length/2)?b:a);
  return[t.slice(0,mid),t.slice(mid+1)];
}

function layout(s){
  const it=s.topics.map(t=>({id:t.id,tr:t.tr,res:t.res,n:idx[t.id]})).filter(o=>o.n);
  const ids=new Set(it.map(o=>o.id)),by={};it.forEach(o=>{by[o.id]=o});
  const dep=o=>(o.n.needs||[]).filter(x=>ids.has(x)),memo={};
  const dpt=o=>memo[o.id]!==undefined?memo[o.id]:(memo[o.id]=dep(o).length?1+Math.max(...dep(o).map(x=>dpt(by[x]))):0);
  it.forEach(dpt);
  const max=Math.max(0,...it.map(o=>memo[o.id])),rows=[];
  for(let d=0;d<=max;d++)rows.push(it.filter(o=>memo[o.id]===d).sort((a,b)=>LANE.indexOf(a.tr)-LANE.indexOf(b.tr)||a.id.localeCompare(b.id)));
  let y=TOP;
  for(let d=max;d>=0;d--){                            // deepest row on top, next to the guardian
    const r=rows[d],m=r.length,L=m<=2?1:m<=4?2:3;
    r.forEach((o,i)=>{o.x=m===1?W/2:PX+(W-2*PX)*i/(m-1);o.y=y+24+(i%L)*32;o.d=d});
    y+=70+32*(L-1);
  }
  const hasDep=new Set();it.forEach(o=>dep(o).forEach(x=>hasDep.add(x)));
  const top={};                                       // links to the guardian: the end of each chain, deepest per track
  it.forEach(o=>{if(!hasDep.has(o.id)&&(!top[o.tr]||o.d>=top[o.tr].d))top[o.tr]=o});
  return{it,by,dep,H:y+36,guard:Object.values(top)};
}

function opens(id){return D.ladders.flatMap(l=>l.nodes).filter(n=>(n.needs||[]).includes(id))}

function selCard(o){
  const n=o.n,s=state(n),c=el('div','card smsel');
  const h=el('div','smh');
  h.append(el('span','kick','SELECTED STAR · '+(s==='done'?'LIT':s.toUpperCase())));
  const r=el('span','smr'),ch=el('span','chip');ch.style.color=COL[o.tr]||'var(--mute)';ch.textContent=tname(o.tr);
  r.append(ch,el('span','mono',(n.min||25)+' MIN'));h.append(r);
  const need=(n.needs||[]).map(x=>idx[x]?short(idx[x])+(isDone(x)?' (lit)':''):x),opn=opens(n.id).slice(0,3).map(short);
  c.append(h,el('h3',null,n.t),
    el('p','sub','Needs: '+(need.length?need.join(', '):'nothing, you can start here')+'.'+(opn.length?' Opens: '+opn.join(', ')+'.':'')));
  if(o.res)c.append(el('p','sub','Study: '+o.res));
  const a=el('div','prow');
  if(s==='ready'){
    const go=el('button','main','Do now');go.type='button';go.onclick=()=>{S.pin=n.id;save();setView('today');render()};
    const dn=el('button',null,'Already done');dn.type='button';dn.setAttribute('aria-label','Mark '+n.t+' as already done');
    dn.onclick=()=>{S.done[n.id]=Date.now();if(S.pin===n.id)S.pin=null;save();check(true);renderAll()};
    a.append(go,dn);
  }else if(s==='done'){
    const u=el('button',null,'Undo');u.type='button';u.setAttribute('aria-label','Mark '+n.t+' as not done');
    u.onclick=()=>{delete S.done[n.id];save();renderAll()};a.append(u);
  }
  if(a.children.length)c.append(a);
  return c;
}

function map(s,L,x){
  const q=el('div','smap'),H=L.H;
  const g=sv('svg',{viewBox:'0 0 '+W+' '+H,role:'img','aria-label':'Star map of '+s.name+': '+x.qd+' of '+x.q+' stars lit'});
  g.style.width='100%';g.style.display='block';
  const cx=W/2;
  // links
  const link=(a,b,k,col)=>{
    const at={x1:a.x,y1:a.y,x2:b.x,y2:b.y};
    if(k==='lit')sv('line',Object.assign({stroke:'#7CC4CC','stroke-width':2.2,style:'filter:drop-shadow(0 0 4px rgba(124,196,204,.7))'},at),g);
    else if(k==='open')sv('line',Object.assign({stroke:col,'stroke-width':2,opacity:.65},at),g);
    else sv('line',Object.assign({stroke:'#3A566B','stroke-width':1,'stroke-dasharray':'4 4'},at),g);
  };
  for(const o of L.it)for(const id of L.dep(o)){
    const p=L.by[id],a=state(p.n),b=state(o.n);
    link(p,o,a==='done'&&b==='done'?'lit':(a==='done'&&b==='ready')||(b==='done'&&a==='ready')?'open':'dim',COL[o.tr]);
  }
  const boss={x:cx,y:BOSS};
  for(const o of L.guard)link(o,boss,'dim');
  link(boss,{x:cx,y:CORE},'dim');
  // the core and the guardian
  const proj=focusP();
  sv('circle',{cx,cy:CORE,r:17,fill:'none',stroke:'#7CC4CC','stroke-width':1.5,opacity:.85},g);
  sv('circle',{cx,cy:CORE,r:11,fill:'none',stroke:'#7CC4CC','stroke-width':1,opacity:.35},g);
  let cn=(proj?proj.name:P.core.split(':')[0]).toUpperCase();if(cn.length>26)cn=cn.slice(0,25)+'…';
  const core=sv('text',{x:cx,y:16,class:'sm-core','text-anchor':'middle'},g);core.textContent='THE CORE · '+cn;
  const pct=Math.round(100*x.qd/Math.max(1,x.q)),open=x.need<=0;
  const hx=[0,1,2,3,4,5].map(i=>{const a=Math.PI/3*i-Math.PI/2;return(cx+22*Math.cos(a)).toFixed(1)+','+(boss.y+22*Math.sin(a)).toFixed(1)}).join(' ');
  sv('polygon',{points:hx,fill:'#0A1119',stroke:open?'#7CC4CC':'#4F6F86','stroke-width':3},g);
  const bt=sv('text',{x:cx,y:boss.y+4,class:'sm-boss','text-anchor':'middle'},g);bt.textContent=pct+'%';
  const gt=sv('text',{x:cx,y:boss.y+42,class:'sm-note','text-anchor':'middle'},g);
  gt.textContent=open?'Guardian awake: claim it below':'Guardian opens at '+Math.round(P.bossUnlock*100)+'%';
  // stars
  for(const o of L.it){
    const n=o.n,s2=state(n),c=COL[o.tr]||'#8DA3B3',r=s2==='done'?7:s2==='ready'?8:5;
    const gr=sv('g',{tabindex:0,role:'button','aria-label':n.t+', '+(s2==='done'?'lit':s2),style:'cursor:pointer;outline:none'},g);
    if(sel===o.id)sv('circle',{cx:o.x,cy:o.y,r:17,fill:'none',stroke:'#E6EFF4','stroke-width':1,'stroke-dasharray':'3 3'},gr);
    if(s2==='done')sv('circle',{cx:o.x,cy:o.y,r,fill:c,style:'filter:drop-shadow(0 0 5px '+c+')'},gr);
    else if(s2==='ready'){sv('circle',{cx:o.x,cy:o.y,r:r+4,fill:c,opacity:.18},gr);sv('circle',{cx:o.x,cy:o.y,r,fill:'#0A1119',stroke:c,'stroke-width':2},gr)}
    else sv('circle',{cx:o.x,cy:o.y,r,fill:'#22384A',stroke:'#2E4A60','stroke-width':1},gr);
    const ls=lines(n),t=sv('text',{x:o.x,y:o.y+r+13,class:'sm-l '+s2,'text-anchor':'middle'},gr);
    ls.forEach((l,i)=>{const ts=sv('tspan',{x:o.x,dy:i?12:0},t);ts.textContent=l});
    sv('circle',{cx:o.x,cy:o.y,r:19,fill:'transparent'},gr);   // bigger tap target
    const pick=()=>{sel=o.id;renderPath()};
    gr.addEventListener('click',pick);
    gr.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick()}});
  }
  q.append(g);return q;
}

window.renderPath=function(){
  const root=$('v-path');root.textContent='';
  if(!P){root.append(el('p','msg','Path data is missing. Check that path.json is in the repo.'));return}
  const ss=P.stages.map(s=>({s,x:stageStats(s)}));
  if(sector===null||!ss[sector]){const c=ss.findIndex(o=>o.x.qd<o.x.q||o.x.md<o.x.ms.length);sector=c<0?ss.length-1:c}
  const {s,x}=ss[sector],L=layout(s);
  if(!L.it.some(o=>o.id===sel))sel=(L.it.find(o=>state(o.n)==='ready')||L.it[0]||{}).id;
  const hd=el('div','smhead');
  hd.append(el('p','kick','PATH · SECTOR '+(sector+1)+' OF '+ss.length),el('h1',null,s.name),
    el('p','mono mute',x.qd+' / '+x.q+' STARS LIT · '+x.md+' / '+x.ms.length+' MILESTONES'),bar(x.qd/Math.max(1,x.q)));
  root.append(hd);
  const pills=el('div','pills');
  ss.forEach((o,i)=>{const b=el('button','pill'+(i===sector?' on':''),(i+1)+' · '+o.s.name);b.type='button';b.onclick=()=>{sector=i;sel=null;renderPath()};pills.append(b)});
  root.append(pills);
  const tp=el('div','pills');
  for(const t of P.tracks){
    const all=s.topics.filter(y=>y.tr===t.id);if(!all.length)continue;
    const d=all.filter(y=>isDone(y.id)).length,c=el('span','chip',tname(t.id)+' '+d+'/'+all.length);c.style.color=COL[t.id];tp.append(c);
  }
  root.append(tp,map(s,L,x));
  const lg=el('div','smlegend');
  for(const [k,t] of [['done','Lit'],['ready','Ready'],['locked','Locked'],['boss','Guardian']])lg.append(el('span','lg '+k,t));
  root.append(lg);
  const cur=L.it.find(o=>o.id===sel);if(cur)root.append(selCard(cur));
  const ms=el('details','lad'),sm=el('summary');
  sm.append(el('span','ln','Milestones and guardian'),el('span','lc',x.md+'/'+x.ms.length));ms.append(sm);
  for(const m of x.ms)ms.append(msRow(m,x));
  root.append(ms);
  if(P.calendar&&P.calendar.length){
    const d=el('details','lad cal'),sm2=el('summary');
    sm2.append(el('span','ln','Season calendar'),el('span','lc','check each event site'));d.append(sm2);
    for(const c of P.calendar){const r=el('div','p-row');r.append(el('span',null,c.m),el('span',null,c.t));d.append(r)}
    root.append(d);
  }
  root.append(el('p','muted note','The map is a checklist of what you have reached, not a route. Tap a star to see it. Your next task still comes from your projects and deadlines.'));
};
if(typeof D!=='undefined'&&D&&typeof P!=='undefined'&&P)renderPath();
})();
