/* space.js: loads the mission-control theme (space.css). Loaded by import.js after the other layers. */
(function(){
  const l=document.createElement('link');l.rel='stylesheet';l.href='app/space.css';document.head.append(l);
  const m=document.querySelector('meta[name="theme-color"]');if(m)m.content='#0A1119';
})();
/* project states, milestones and the project page (pstate.js), then Vault export and import (vault.js), then the local AI planner (ai.js), then the Welcome back screen (resume.js), then the full-window layout and mini player (desk.js), loaded last with the interactive AI buddy (buddy.js) */
(function(){for(const f of ['pstate.js','vault.js','ai.js','resume.js','desk.js','buddy.js']){const s=document.createElement('script');s.src='app/'+f;s.async=false;document.body.append(s)}})();
