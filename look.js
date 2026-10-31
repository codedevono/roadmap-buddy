/* look.js: new colours and layout polish for Roadmap Buddy, plus a timer fix.
   Loaded after the main script and import.js. It only adds CSS and wraps two functions. */
(function(){
const css=`
:root{--accent:#0f7a74;--accent2:#2563c9;--warm:#2563c9;--bg:#e6eef3;--card:#fff;--tile:rgba(20,32,43,.045);--glow:rgba(15,122,116,.3)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--accent:#6fd3c6;--accent2:#6aa7ff;--warm:#6aa7ff;--bg:#0b131c;--card:#13202b;--line:#26394a;--tile:rgba(255,255,255,.045);--glow:rgba(111,211,198,.3)}}
body{background:radial-gradient(90% 38% at 8% -6%,color-mix(in srgb,var(--accent) 24%,transparent),transparent 62%) fixed,radial-gradient(70% 34% at 100% 2%,color-mix(in srgb,var(--accent2) 20%,transparent),transparent 60%) fixed,var(--bg)}
main{padding-bottom:7.5rem}
.card,details.lad,.jour,.tk,.hud{border-radius:1.4rem;border:1px solid color-mix(in srgb,var(--accent) 14%,var(--line));background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 5%,var(--card)),var(--card));box-shadow:var(--sh)}
.bar{height:.7rem;background:color-mix(in srgb,var(--ink) 9%,transparent);box-shadow:inset 0 1px 2px rgba(0,0,0,.16)}
.bar i{background:linear-gradient(90deg,var(--accent),var(--accent2));box-shadow:0 0 10px -1px var(--glow)}
.hl b{font-size:1.05rem}
.goal{padding:1.2rem;gap:1.1rem}
.gring{width:5.4rem;height:5.4rem}
.gring circle{stroke-width:10}
.gring b{font-size:1.05rem;font-weight:700}
.goal h2{font:600 1.3rem/1.2 Georgia,"Times New Roman",serif}
.goal>div>.sub:first-child{text-transform:uppercase;letter-spacing:.09em;font-size:.7rem}
.goal>div>.sub:last-child{background:var(--tile);border-radius:.7rem;padding:.35rem .6rem;margin-top:.55rem}
.nx{padding:1.2rem;background:radial-gradient(120% 60% at 50% 0,color-mix(in srgb,var(--accent) 16%,transparent),transparent 70%),linear-gradient(180deg,color-mix(in srgb,var(--accent) 6%,var(--card)),var(--card));border-color:color-mix(in srgb,var(--accent) 38%,var(--line))}
.nx .track{align-self:flex-start}
.nx h1{font-size:1.65rem;margin-bottom:.8rem}
.nx .hint,.nx .why{background:var(--tile);border:1px solid color-mix(in srgb,var(--line) 70%,transparent);border-radius:.9rem;padding:.6rem .8rem;margin:0 0 .55rem;font-size:.9rem;color:var(--ink)}
.nx .hint{color:var(--mute)}
.nx .ring{width:8.6rem;height:8.6rem;margin:.9rem auto 1.2rem}
.nx .ring .t{font-size:1.9rem;font-weight:650}
.ring circle{stroke-width:9}
.ring .fg{filter:drop-shadow(0 0 6px var(--glow))}
button.main{background:linear-gradient(135deg,var(--accent),var(--accent2));color:var(--accent-ink);box-shadow:0 10px 22px -10px var(--glow);border-color:transparent}
.row button{border-radius:1rem;min-height:3.8rem;background:var(--tile)}
.row #ok{background:color-mix(in srgb,var(--accent) 14%,var(--card))}
.sd{grid-template-columns:4.6rem 1fr;gap:.35rem .8rem;padding:.7rem;border-radius:1rem;background:var(--tile);border:1px solid transparent;margin:.35rem 0}
.sd .dl{text-align:center;background:color-mix(in srgb,var(--ink) 6%,transparent);border-radius:.8rem;padding:.4rem .2rem;align-self:start}
.sd.today{border-color:color-mix(in srgb,var(--accent) 45%,transparent);background:color-mix(in srgb,var(--accent) 10%,transparent)}
.sd.today .dl{background:var(--accent);color:var(--accent-ink)}
.sd.today .dl b{color:var(--accent-ink)}
.bnav{left:.6rem;right:.6rem;bottom:calc(.6rem + env(safe-area-inset-bottom,0px));max-width:29rem;margin:0 auto;padding:.3rem;border:1px solid var(--line);border-radius:1.5rem;background:color-mix(in srgb,var(--card) 88%,transparent);box-shadow:0 14px 34px -12px rgba(0,0,0,.5)}
.bnav button[aria-selected="true"]{background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 26%,transparent),color-mix(in srgb,var(--accent2) 22%,transparent));color:var(--accent)}
#toast{bottom:calc(6.2rem + env(safe-area-inset-bottom,0px))}
.badges li.on{background:color-mix(in srgb,var(--accent) 10%,var(--card));box-shadow:0 0 18px -8px var(--glow)}
@media (prefers-reduced-motion:no-preference){
[role=tabpanel]:not([hidden]){animation:rise .35s ease both}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
body.running .nx{animation:pulse 2.6s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:var(--sh)}50%{box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 45%,transparent),0 0 26px -4px var(--glow)}}}
`;
const st=document.createElement('style');st.textContent=css;document.head.append(st);

/* Timer fix: while a timer is running or paused, keep showing ITS task. Before, any redraw could pick a
   different task, the saved time no longer matched, and the timer silently started over. */
const _pt=pickToday;
pickToday=function(){
  const r=_pt(),t=S.tm;
  if(t&&t.id&&(!r||r.n.id!==t.id)&&(!S.pin||S.pin===t.id)){
    const n=idx[t.id]||PT[t.id];
    if(n&&!isDone(n.id)&&!(S.later[t.id]>Date.now()))return{n,lad:n.lad,why:'Your timer is on this task',light:!!(r&&r.light)};
  }
  return r;
};
/* a soft glow on the Next step card while the timer runs */
const _rt=runTick,_sp=stop;
runTick=function(){_rt();if(timer)document.body.classList.add('running')};
stop=function(){_sp();document.body.classList.remove('running')};
})();
