/* space.js: loads the mission-control theme (space.css). Loaded by import.js after the other layers. */
(function(){
  const l=document.createElement('link');l.rel='stylesheet';l.href='space.css';document.head.append(l);
  const m=document.querySelector('meta[name="theme-color"]');if(m)m.content='#0A1119';
})();
