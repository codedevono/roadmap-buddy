/* Roadmap Buddy: Google Calendar bridge and public dates.
   Loaded by import.js after v21.js. It wraps calItems(), calRow() and renderCalendar() from index.html.
   - Every calendar row gets "Add to Google Calendar" (a link, no sign-in, no API key).
   - The Month tab gets "Export .ics", one file that Google Calendar can import.
   - calendar.json adds public dates (GSoC 2027 estimates, upcoming CTFs), each with a note on what to check.
   Two-way sync with Google Calendar would need a Google sign-in and is not built. */
(function(){
'use strict';
let PUB=[];
const d8=s=>s.replace(/-/g,'');
const nextD=s=>{const d=new Date(s+'T00:00:00');d.setDate(d.getDate()+1);return ymd(d)};
const hhmm=t=>t.replace(':','')+'00';
const plus1h=t=>{const [h,m]=t.split(':').map(Number);return pad2((h+1)%24)+':'+pad2(m)};
function span(it){ // start and end in Google's date format
  const a=it.date,b=endOf(it);
  if(it.time){const et=it.etime||plus1h(it.time);return d8(a)+'T'+hhmm(it.time)+'/'+d8(b)+'T'+hhmm(et)}
  return d8(a)+'/'+d8(nextD(b));
}
function gLink(it){
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text='+encodeURIComponent(it.name)+'&dates='+span(it)+'&details='+encodeURIComponent((it.note||'')+(it.url?'\n'+it.url:''));
}
const esc=s=>String(s).replace(/[\\;,]/g,m=>'\\'+m).replace(/\n/g,'\\n');
function icsText(){
  const st=new Date().toISOString().replace(/[-:]|\.\d+/g,''),L=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Roadmap Buddy//EN'];
  for(const it of calItems()){
    if(!it.date||it.paused)continue;
    const b=endOf(it),uid=(it.fid||it.uid||it.pid||'pub')+'-'+d8(it.date)+'@roadmap-buddy';
    L.push('BEGIN:VEVENT','UID:'+uid,'DTSTAMP:'+st);
    if(it.time){L.push('DTSTART:'+d8(it.date)+'T'+hhmm(it.time),'DTEND:'+d8(b)+'T'+hhmm(it.etime||plus1h(it.time)))}
    else{L.push('DTSTART;VALUE=DATE:'+d8(it.date),'DTEND;VALUE=DATE:'+d8(nextD(b)))}
    L.push('SUMMARY:'+esc(it.name),'DESCRIPTION:'+esc((it.note||'')+(it.url?' '+it.url:'')),'END:VEVENT');
  }
  L.push('END:VCALENDAR');return L.join('\r\n');
}
function exportICS(){
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([icsText()],{type:'text/calendar'}));a.download='buddy-calendar.ics';
  document.body.append(a);a.click();a.remove();toast('Saved buddy-calendar.ics. Open it to add everything to Google Calendar.');
}
// public dates join the calendar items
const _ci=calItems;
calItems=function(){
  const out=_ci();
  for(const e of PUB)out.push({k:EVT[e.type]?e.type:'personal',name:e.name,date:e.date,end:e.end||'',note:e.note||'',est:!!e.est,url:e.url||'',pub:true});
  return out;
};
// every row gets a Google Calendar link
const _cr=calRow;
calRow=function(it){
  const r=_cr.apply(this,arguments);
  if(!it.date)return r;
  let acts=r.querySelector('.acts');if(!acts){acts=el('div','acts');r.append(acts)}
  const g=el('a','mini','Add to Google Calendar');g.href=gLink(it);g.target='_blank';g.rel='noopener';acts.append(g);
  if(it.url){const s=el('a','mini','Source');s.href=it.url;s.target='_blank';s.rel='noopener';acts.append(s)}
  return r;
};
// export button under the month
const _rc=renderCalendar;
renderCalendar=function(){
  const r=_rc.apply(this,arguments);
  const v=$('v-calendar');
  if(!ef&&v&&!v.querySelector('.gcal-box')){
    const box=el('div','card gcal-box'),b=el('button','mini','Export .ics for Google Calendar');b.onclick=exportICS;
    box.append(el('h3',null,'Google Calendar'),el('p','sub','Each event has an Add to Google Calendar button. This file adds all of them at once. Dates marked estimated or with a note come from public pages and may shift, so open the source before you plan around them.'),b);
    v.append(box);
  }
  return r;
};
window.buddyIcs=icsText;
fetch('data/calendar.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null).then(j=>{
  PUB=((j&&j.events)||[]).filter(e=>e&&e.name&&ISO.test(e.date||''));
  if(PUB.length&&typeof renderAll==='function')renderAll();
});
})();
