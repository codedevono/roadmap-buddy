/* Roadmap import, shown at the bottom of the Topics tab. Loaded after the main script:
   it wraps build() (merges imported ladders into the plan) and renderRoadmap() (adds the import box). */
(function(){
const css=document.createElement('style');
css.textContent='.imp textarea{display:block;width:100%;min-height:9rem;font:13px/1.4 ui-monospace,Menlo,Consolas,monospace;color:var(--ink);background:transparent;border:1.5px solid var(--line);border-radius:.7rem;padding:.6rem;margin:.5rem 0}.imp .acts{flex-wrap:wrap;margin:.3rem 0}';
document.head.append(css);

/*VET*/
const IDRE=/^[a-z0-9][a-z0-9_-]*$/;
function vet(text,have,haveL){
  const out={err:[],warn:[],ladders:[],n:0,chain:0,ready:0};
  const d=String(text||'').trim().replace(/^```[a-z]*\s*/i,'').replace(/\s*```$/,'');
  if(!d){out.err.push('Nothing pasted yet.');return out}
  let j;
  try{j=JSON.parse(d)}catch(e){
    const a=d.search(/[\[{]/),b=Math.max(d.lastIndexOf('}'),d.lastIndexOf(']'));
    try{j=JSON.parse(d.slice(a,b+1))}catch(e2){out.err.push('That is not valid JSON. Paste only the JSON block from Claude.');return out}
  }
  const L=Array.isArray(j)?j:j&&Array.isArray(j.ladders)?j.ladders:j&&Array.isArray(j.nodes)?[j]:null;
  if(!L||!L.length){out.err.push('Expected {"ladders":[...]}, a list of ladders, or one ladder.');return out}
  const seen=new Set(),g={},lads=new Set(haveL);let noTiny=0;
  for(const l of L){
    const lid=l&&l.id;
    if(!l||typeof lid!=='string'||!IDRE.test(lid)){out.err.push('Ladder id '+JSON.stringify(lid)+': use lowercase letters, digits, - or _');continue}
    if(lads.has(lid))out.err.push('Ladder id "'+lid+'" already exists. Pick a new id.');
    lads.add(lid);
    if(typeof l.name!=='string'||!l.name.trim())out.err.push(lid+': missing name');
    if(!Number.isInteger(l.floor)||l.floor<1||l.floor>7)out.err.push(lid+': floor must be a whole number from 1 to 7');
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
      const nd=n.needs==null?[]:n.needs;
      if(!Array.isArray(nd)||nd.some(x=>typeof x!=='string')){out.err.push(nid+': needs must be a list of ids');g[nid]=[];continue}
      g[nid]=nd;
    }
  }
  if(noTiny)out.warn.push(noTiny+' topics have no tiny step');
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
const _b=build;build=function(){if(D&&D.ladders)merge();_b()};
const haveIds=()=>new Set(D.ladders.flatMap(l=>l.nodes.map(n=>n.id)));
const haveLads=()=>new Set(D.ladders.map(l=>l.id));

const impBox=document.createElement('details');impBox.className='lad imp';
const sm=el('summary');sm.append(el('span','ln','Roadmaps'),el('span','lc','Import'));
const body=el('div');body.style.padding='0 1rem 1rem';
const ta=document.createElement('textarea');ta.setAttribute('aria-label','Roadmap JSON');ta.placeholder='Paste the JSON from the roadmap-import skill here';
const msg=el('div');msg.setAttribute('aria-live','polite');
const fi=document.createElement('input');fi.type='file';fi.accept='application/json,.json';fi.hidden=true;
const lst=el('div'),acts=el('div','acts');
impBox.append(sm,body);

function show(r,added){
  msg.textContent='';
  for(const e of r.err.slice(0,8)){const x=el('div','sub','✗ '+e);x.style.color='var(--c-sec)';msg.append(x)}
  if(r.err.length>8)msg.append(el('div','sub','and '+(r.err.length-8)+' more errors'));
  for(const w of r.warn.slice(0,6))msg.append(el('div','sub','! '+w));
  if(!r.err.length)msg.append(el('div','sub',(added?'Added: ':'OK: ')+r.ladders.length+' ladder'+(r.ladders.length===1?'':'s')+', '+r.n+' topics, longest chain '+r.chain+', '+r.ready+' ready to start now.'));
}
function run(add){
  if(!D){show({err:['Still loading. Try again in a moment.'],warn:[],ladders:[]});return}
  const r=vet(ta.value,haveIds(),haveLads());
  show(r);
  if(!add||r.err.length)return;
  S.ladders=(S.ladders||[]).concat(JSON.parse(JSON.stringify(r.ladders)));
  save();build();ta.value='';renderAll();show(r,true);toast('Added '+r.n+' topics');
}
function drawList(){
  lst.textContent='';
  const A=S.ladders||[];
  if(!A.length)lst.append(el('p','sub','No imported roadmaps yet.'));
  for(const l of A){
    const r=el('div','p-row');r.append(el('span',null,l.name+' · '+l.nodes.length+' topics'));
    const b=el('button','mini','Remove');b.setAttribute('aria-label','Remove '+l.name);b.onclick=()=>removeLad(l.id);r.append(b);lst.append(r);
  }
}
function removeLad(id){
  const l=(S.ladders||[]).find(x=>x.id===id);if(!l)return;
  const mine=new Set(l.nodes.map(n=>n.id));
  const dep=D.ladders.filter(x=>x.id!==id).flatMap(x=>x.nodes).filter(n=>(n.needs||[]).some(k=>mine.has(k)));
  const used=S.projects.filter(p=>(p.ladders||[]).includes(id)||(p.needs||[]).some(k=>mine.has(k)));
  if(used.length){show({err:['Cannot remove '+l.name+': the project "'+used[0].name+'" uses it. Edit the project first.'],warn:[],ladders:[]});return}
  if(dep.length){show({err:['Cannot remove '+l.name+': '+dep.length+' other topics need it, for example "'+short(dep[0])+'".'],warn:[],ladders:[]});return}
  if(!confirm('Remove '+l.name+' from this device? Your progress is kept if you add it again.'))return;
  S.ladders=S.ladders.filter(x=>x.id!==id);D.ladders=D.ladders.filter(x=>x.id!==id);
  if(S.pin&&mine.has(S.pin))S.pin=null;
  save();build();renderAll();
}
const mk=(t,f)=>{const b=el('button','mini',t);b.type='button';b.onclick=f;acts.append(b)};
mk('Check',()=>run(false));
mk('Add to my app',()=>run(true));
mk('Load a .json file',()=>fi.click());
mk('Copy backup',async()=>{
  const j=JSON.stringify({ladders:S.ladders||[]},null,1);
  try{await navigator.clipboard.writeText(j);toast('Backup copied. Paste it here to restore.')}catch(e){prompt('Copy this:',j)}
});
fi.onchange=()=>{const f=fi.files[0];if(f)f.text().then(t=>{ta.value=t;run(false)})};
body.append(el('p','sub','Roadmaps you add here live on this device. Copy a backup now and then.'),ta,acts,fi,msg,lst);

const _rr=renderRoadmap;
renderRoadmap=function(){_rr();drawList();$('v-roadmap').append(impBox)};
})();
