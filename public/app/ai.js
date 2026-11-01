/* Roadmap Buddy: local AI through Ollama (ai.js).
   Loaded by space.js after pstate.js and BEFORE resume.js (so window.wbAI exists when the Welcome back screen opens).
   What it adds, and nothing else:
   1. a planner "Local AI" in the Planners registry (index.html). It plans days 2 to 7 of the 7-day strip.
      Today (day 1) is always the rules planner's pick, so the strip never disagrees with the Next step card.
      The model can only choose from tasks the rules planner already found ready; anything it returns is also checked
      by validPlan() in index.html and falls back to the rules planner per day.
   2. window.wbAI(ctx): a two-sentence welcome summary for resume.js.
   The page talks to Ollama on THIS computer (default http://localhost:11434). No key, no server, no paid API.
   On a phone localhost is the phone, so the planner quietly stays on rules there.
   Own storage keys only: buddy.v2.ai (settings), buddy.v2.aiplan (last plan). S.planner = 'ollama' is the on/off switch. */
(function(){
'use strict';
const CK='buddy.v2.ai', PK='buddy.v2.aiplan', DEF_URL='http://localhost:11434';
const BACKOFF=5*60*1000, T_PLAN=90000, T_SUM=45000;

/* ---------- settings ---------- */
const jget=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))||d}catch(e){return d}};
const jset=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const cfg=()=>Object.assign({url:DEF_URL,model:''},jget(CK,{}));
const base=()=>cfg().url.replace(/\/+$/,'');
const isOn=()=>typeof S!=='undefined'&&S.planner==='ollama';

/* ---------- Ollama calls ---------- */
let failUntil=0,lastErr='';
function http(path,body,ms){
  const ac=new AbortController(),t=setTimeout(()=>ac.abort(),ms);
  return fetch(base()+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:ac.signal}:{signal:ac.signal})
    .then(r=>r.text().then(x=>{if(!r.ok)throw new Error('HTTP '+r.status+' '+x.slice(0,160));try{return JSON.parse(x)}catch(e){throw new Error('Not JSON from Ollama')}}))
    .finally(()=>clearTimeout(t));
}
function models(){
  return http('/api/tags',null,5000).then(j=>(j.models||[]).map(m=>({name:m.name,size:m.size||0})));
}
/* the model to use: the saved one if it still exists, else the smallest Qwen, else the smallest model */
function pickModel(list){
  const c=cfg();if(c.model&&list.some(m=>m.name===c.model))return c.model;
  const by=a=>a.slice().sort((x,y)=>x.size-y.size)[0];
  const q=list.filter(m=>/qwen/i.test(m.name)),m=by(q.length?q:list);
  return m?m.name:'';
}
function chat(messages,schema,ms,maxTok){
  const mk=think=>{
    const b={model:cfg().model,messages,stream:false,keep_alive:'15m',options:{temperature:.2,num_ctx:4096,num_predict:maxTok||600}};
    if(schema)b.format=schema;
    if(think===false)b.think=false;
    return b;
  };
  const run=()=>cfg().model?Promise.resolve():models().then(l=>{const m=pickModel(l);if(!m)throw new Error('No model installed');jset(CK,Object.assign(cfg(),{model:m}))});
  return run().then(()=>http('/api/chat',mk(false),ms)).catch(e=>{
    if(/think/i.test(String(e.message)))return http('/api/chat',mk(),ms);   // a model that rejects the think switch
    throw e;
  }).then(j=>String((j.message&&j.message.content)||'').replace(/<think>[\s\S]*?<\/think>/g,'').trim());
}
function note(e){
  lastErr=String(e&&e.message||e);failUntil=Date.now()+BACKOFF;
  if(/not found/i.test(lastErr))jset(CK,Object.assign(cfg(),{model:''}));   // the saved model was removed: choose again next time
}

/* ---------- the planner ---------- */
let cache=jget(PK,null),busy=false,sigNow='';
const mins=id=>{const n=(typeof idx!=='undefined'&&idx[id])||(typeof PT!=='undefined'&&PT[id]);return n?(n.min||25):25};
const title=id=>{const n=(typeof idx!=='undefined'&&idx[id])||(typeof PT!=='undefined'&&PT[id]);return n?n.t:id};
function dayName(ds){return new Date(ds+'T00:00:00').toLocaleDateString('en',{weekday:'long',day:'numeric',month:'short'})}
function eventsOn(ds){
  try{return onDay(calItems(),ds).filter(it=>!it.paused).map(it=>it.name+(it.time?' at '+it.time:''))}catch(e){return[]}
}
function signature(from,fb,pool){
  return from+'|'+fb.map(x=>x.taskId+':'+(x.light?1:0)).join(',')+'|'+pool.join(',')+'|'+fb.map((x,i)=>eventsOn(x.date).join('/')).join(';')+'|'+cfg().model;
}
function buildPrompt(from,fb,pool){
  const tag=id=>'T'+(pool.indexOf(id)+1);
  const L=[];
  L.push('Plan days 2 to 7 for one person who studies and builds projects. Day 1 is already fixed.');
  L.push('Tasks you may use (each at most once):');
  for(const id of pool)L.push('- '+tag(id)+': '+title(id)+' ('+mins(id)+' min). Reason from the planner: '+(fb.find(x=>x.taskId===id)||{why:''}).why);
  L.push('Days:');
  for(let i=1;i<fb.length;i++){
    const ev=eventsOn(fb[i].date);
    L.push('- Day '+(i+1)+', '+dayName(fb[i].date)+(fb[i].light?' [LIGHT DAY: only tasks of 30 minutes or less]':'')+(ev.length?'; events: '+ev.join(', '):'; no events'));
  }
  L.push('Rules: use each task at most once. Use "none" for a day that should stay free (fine on busy days). A task that comes earlier in the list should usually come earlier in the week. Give each day a "why" of at most 12 words that mentions a real event or reason from above. Do not invent events.');
  return L.join('\n');
}
function schemaFor(pool,n){
  return{type:'object',properties:{days:{type:'array',minItems:n,maxItems:n,items:{type:'object',properties:{
    day:{type:'integer',minimum:2,maximum:n+1},
    task:{type:'string',enum:pool.map((_,i)=>'T'+(i+1)).concat('none')},
    why:{type:'string'}},required:['day','task','why']}}},required:['days']};
}
function refresh(from,fb,pool,sig){
  busy=true;
  const n=fb.length-1;
  chat([{role:'system',content:'You make a calm weekly study plan. Reply with JSON only.'},{role:'user',content:buildPrompt(from,fb,pool)}],schemaFor(pool,n),T_PLAN,700)
    .then(txt=>{
      let j;try{j=JSON.parse(txt)}catch(e){throw new Error('Model did not return JSON')}
      const out=[],used=new Set();
      for(const d of (j.days||[])){
        const i=(d.day|0)-1;if(i<1||i>n||out[i])continue;
        const m=/^T(\d+)$/.exec(String(d.task));const id=m?pool[+m[1]-1]:null;
        let ok=true;
        if(id!=null){ok=!used.has(id)&&!(fb[i].light&&mins(id)>30)}
        if(!ok)continue;
        if(id!=null)used.add(id);
        out[i]={date:fb[i].date,taskId:id==null?null:id,why:String(d.why||'').replace(/\s+/g,' ').slice(0,120),light:fb[i].light};
      }
      if(!out.some(Boolean))throw new Error('Model returned no usable days');
      cache={sig,at:Date.now(),days:out};jset(PK,cache);lastErr='';failUntil=0;
    })
    .catch(note)
    .finally(()=>{busy=false;if(typeof renderStrip==='function')try{renderStrip()}catch(e){}});
}
function plan(from,days){
  const fb=rulesPlan(from,days);                       // the safe answer for every day
  if(days<3||!isOn())return fb;
  const t0=fb[0].taskId;
  const wide=rulesPlan(from,14),pool=[];
  for(const x of wide)if(x.taskId!=null&&x.taskId!==t0&&!pool.includes(x.taskId))pool.push(x.taskId);
  if(!pool.length)return fb;
  const sig=signature(from,fb,pool);sigNow=sig;
  if(cache&&cache.sig===sig)return fb.map((x,i)=>i>0&&cache.days[i]?cache.days[i]:x);
  if(!busy&&Date.now()>=failUntil)setTimeout(()=>{if(!busy&&sigNow===sig)refresh(from,fb,pool,sig)},0);
  return fb;                                           // until the model answers, show the rules plan
}
Planners.ollama={name:'Local AI',plan};

/* ---------- the welcome summary ---------- */
function wbAI(ctx){
  if(Date.now()<failUntil)return Promise.reject(new Error(lastErr||'offline'));
  const facts=[];
  if(ctx.last)facts.push('Last session: '+ctx.last);
  if(ctx.note)facts.push('Their own note: '+ctx.note);
  if(ctx.focus)facts.push('Focus project: '+ctx.focus);
  if(ctx.next)facts.push('Next step: '+ctx.next);
  if(ctx.upcoming&&ctx.upcoming.length)facts.push('Coming up: '+ctx.upcoming.join('; '));
  if(!facts.length)return Promise.reject(new Error('nothing to say'));
  return chat([
    {role:'system',content:'You greet someone returning to their study app. Write exactly two short, calm sentences in plain English. Use only the facts given. No lists, no emoji, no quotes.'},
    {role:'user',content:facts.join('\n')}
  ],null,T_SUM,120).then(t=>{t=t.replace(/[*_#`>"]/g,'').replace(/\s+/g,' ').trim();if(!t)throw new Error('empty');return t}).catch(e=>{note(e);throw e});
}
function syncHook(){if(isOn())window.wbAI=wbAI;else delete window.wbAI}
syncHook();

/* ---------- settings dialog (opens from the Planner pill) ---------- */
const css=document.createElement('style');
css.textContent='.aib{position:fixed;inset:0;z-index:40;display:grid;place-items:center;padding:1rem;background:rgba(5,10,15,.72);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}'
+'.aib .card{width:min(28rem,100%);max-height:calc(100% - 1rem);overflow:auto;margin:0}'
+'.aib h2{margin:0 0 .5rem;font-size:1.2rem}.aib label{display:block;font-size:.8rem;color:var(--mute);margin:.8rem 0 .2rem}'
+'.aib input[type=text],.aib select{width:100%;min-height:2.75rem;padding:.4rem .6rem;border-radius:.6rem;border:1px solid var(--line);background:transparent;color:var(--ink);font-size:.95rem}'
+'.aib .opt{display:flex;gap:.6rem;align-items:center;min-height:2.75rem;font-size:.95rem;color:var(--ink);margin:0}.aib .opt input{width:1.2rem;height:1.2rem}'
+'.aib .st{font-size:.85rem;margin:.6rem 0 0;min-height:1.2rem}.aib .st.bad{color:var(--c-sec)}.aib .st.ok{color:var(--accent)}'
+'.aib code{display:block;white-space:pre-wrap;word-break:break-all;font:500 .78rem var(--mono,monospace);padding:.5rem;border:1px solid var(--line);border-radius:.5rem;margin:.3rem 0}'
+'.aib .row2{display:flex;gap:.5rem;margin-top:.9rem}.aib .row2 button{flex:1}';
document.head.append(css);

let dlg=null,dKey=null,dBack=null;
function closeDlg(){if(!dlg)return;dlg.remove();dlg=null;document.removeEventListener('keydown',dKey,true);if(dBack&&dBack.focus)try{dBack.focus({preventScroll:true})}catch(e){}dBack=null}
function openDlg(){
  if(dlg)return;
  dBack=document.activeElement;
  const bg=el('div','aib'),c=el('div','card'),h=el('h2',null,'Planner');h.id='aib-h';
  bg.setAttribute('role','dialog');bg.setAttribute('aria-modal','true');bg.setAttribute('aria-labelledby','aib-h');
  c.append(h);
  const mkOpt=(val,txt)=>{const l=el('label','opt'),r=document.createElement('input');r.type='radio';r.name='aip';r.value=val;r.checked=(S.planner||'rules')===val;l.append(r,document.createTextNode(txt));return{l,r}};
  const o1=mkOpt('rules','Rules (works everywhere, no AI)'),o2=mkOpt('ollama','Local AI on this computer (Ollama)');
  c.append(o1.l,o2.l);
  const lu=el('label',null,'Ollama address'),iu=document.createElement('input');iu.type='text';iu.value=cfg().url;iu.id='aib-u';lu.htmlFor='aib-u';
  const lm=el('label',null,'Model'),sm=document.createElement('select');sm.id='aib-m';lm.htmlFor='aib-m';
  const st=el('p','st');st.setAttribute('role','status');
  c.append(lu,iu,lm,sm,st);
  const fill=(list,sel)=>{sm.textContent='';for(const m of list){const o=document.createElement('option');o.value=m.name;o.textContent=m.name;sm.append(o)}if(sel)sm.value=sel};
  const cur0=cfg().model;if(cur0)fill([{name:cur0}],cur0);else fill([]);
  const help=el('p','st','If it cannot connect on Windows: quit Ollama from the tray, run this once in PowerShell, then start Ollama again.');
  const cmd=el('code',null,'setx OLLAMA_ORIGINS "'+location.origin+'"');
  const test=()=>{
    jset(CK,Object.assign(cfg(),{url:iu.value.trim()||DEF_URL}));
    st.className='st';st.textContent='Checking…';
    return models().then(l=>{
      if(!l.length){st.className='st bad';st.textContent='Connected, but no model is installed. Run: ollama pull qwen3.5:4b';return}
      const m=pickModel(l);fill(l,m);
      st.className='st ok';st.textContent='Connected. '+l.length+' model'+(l.length>1?'s':'')+' found. Using '+m+'.';
    }).catch(e=>{
      st.className='st bad';
      st.textContent=(e&&e.name==='AbortError'?'No answer from ':'Cannot reach ')+(iu.value||DEF_URL)+'. Is Ollama running? Is this browser allowed to use it (see below)?';
    });
  };
  const bt=el('button','mini','Test connection');bt.type='button';bt.onclick=test;
  const ok=el('button','main','Save'),no=el('button',null,'Cancel');ok.type='button';no.type='button';
  ok.style.minHeight='2.75rem';ok.style.fontSize='1rem';
  no.onclick=closeDlg;
  ok.onclick=()=>{
    const want=o2.r.checked?'ollama':'rules';
    jset(CK,Object.assign(cfg(),{url:iu.value.trim()||DEF_URL,model:sm.value||cfg().model}));
    failUntil=0;lastErr='';cache=null;jset(PK,null);
    S.planner=want;save();syncHook();closeDlg();
    if(typeof renderStrip==='function')renderStrip();
    toast(want==='ollama'?'Local AI planner on. Days 2 to 7 will update when the model answers.':'Rules planner on.');
  };
  const r2=el('div','row2');r2.append(bt);c.append(r2,help,cmd);
  const r3=el('div','row2');r3.append(no,ok);c.append(r3);
  bg.append(c);document.body.append(bg);dlg=bg;
  bg.addEventListener('click',e=>{if(e.target===bg)closeDlg()});
  dKey=e=>{
    if(!dlg)return;
    if(e.key==='Escape'){e.preventDefault();closeDlg();return}
    if(e.key==='Tab'){
      const f=[...dlg.querySelectorAll('input,select,button')].filter(x=>!x.disabled),i=f.indexOf(document.activeElement);
      e.preventDefault();f[(i+(e.shiftKey?-1:1)+f.length)%f.length].focus();
    }
  };
  document.addEventListener('keydown',dKey,true);
  (o2.r.checked?o2.r:o1.r).focus();
  o2.r.addEventListener('change',()=>{if(o2.r.checked)test()});   // choosing Local AI looks for the models straight away
  if(isOn())test();
}

/* the Planner pill is built by renderStrip() in index.html. Its click is taken over by one listener on the document
   (so it does not matter whether the pill was drawn before or after this file loaded); the wrapper only fixes its label. */
document.addEventListener('click',e=>{
  const b=e.target.closest&&e.target.closest('#strip .strip-h button');
  if(!b||!/^Planner:/.test(b.textContent))return;
  e.preventDefault();e.stopImmediatePropagation();openDlg();
},true);
function label(){
  const pill=[...document.querySelectorAll('#strip .strip-h button')].find(b=>/^Planner:/.test(b.textContent));
  if(!pill)return;
  if(isOn()){
    pill.textContent='Planner: Local AI'+(busy?' …':(Date.now()<failUntil&&!cache?' (offline, using rules)':''));
    pill.title=(lastErr&&Date.now()<failUntil)?lastErr:'';
  }
  pill.setAttribute('aria-haspopup','dialog');
}
if(typeof renderStrip==='function'){
  const orig=renderStrip;
  window.renderStrip=renderStrip=function(){orig.apply(this,arguments);label()};
  if(typeof D!=='undefined'&&D)try{renderStrip()}catch(e){}   // the app may already have drawn once
}
})();
