/* Ohmly: views and routing */
(function(){
const BC=window.BC, {$,$$,esc,S}=BC;
const D=window.SB_DATA; const M=D.M;
BC.DATA={M};
const realKeys=o=>Object.keys(o||{}).filter(k=>!k.startsWith("p"));
const countRight=c=>{const q=S.quiz[c.n]||{}; return realKeys(q).filter(k=>q[k]).length;};
const prog=c=>S.done[c.n]?1:(c.quiz.length?Math.min(.9,.9*realKeys(S.quiz[c.n]).length/c.quiz.length):0);
const tierChip=t=>t==="core"?'<span class="chip core">Foundations</span>':t==="build"?'<span class="chip build">Build things</span>':'<span class="chip">Go deeper</span>';
const ORDER=[1,2,3,4,5,7,9,8,15,16,10,13,14,6,11,12,17];

/* ---------- theme ---------- */
function applyTheme(){ const t=S.theme||"system"; if(t==="system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme",t); }
applyTheme();

/* ---------- header ---------- */
function header(){
  const L=BC.level(S.xp), pct=L.next?((S.xp-L.from)/(L.to-L.from)*100):100;
  $("#lvName").textContent=L.name; $("#lvNum").textContent="Lv "+(L.i+1); $("#xpBar").style.width=pct+"%";
  $("#xpText").textContent=L.next?`${S.xp} / ${L.to} XP`:`${S.xp} XP`;
  const sb=$("#soundBtn"); sb.setAttribute("aria-pressed",S.sound); sb.title=S.sound?"Sound on":"Sound off";
  sb.innerHTML=`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/>${S.sound?'<path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>':'<path d="M17 9l5 6M22 9l-5 6"/>'}</svg>`;
  const tb=$("#themeBtn"), t=S.theme||"system"; tb.title="Theme: "+t; tb.setAttribute("aria-label","Theme: "+t+". Click to change.");
  tb.innerHTML=t==="dark"?'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>':t==="light"?'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/></svg>':'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>';
}
BC.onXP=()=>{header(); rail(currentKey);};

/* ---------- rail ---------- */
let currentKey="home";
function rail(cur){
  $("#rail").innerHTML=`<a href="#home" class="${cur==="home"?"on":""}"><span class="n">⌂</span><span>Course map</span><span></span></a>
   <a href="#arcade" class="${cur==="arcade"||cur==="game"?"on":""}"><span class="n">▶</span><span>Arcade</span><span></span></a>
   <a href="#formulas" class="${cur==="formulas"?"on":""}"><span class="n">ƒ</span><span>Formula sheet</span><span></span></a>
   <a href="#about" class="${cur==="about"?"on":""}"><span class="n">i</span><span>About and settings</span><span></span></a>
   <div class="grp label">Modules</div>`+
   M.map(c=>{const p=prog(c);return `<a href="#m-${c.n}" class="${cur===c.n?"on":""}"${cur===c.n?' aria-current="page"':""}><span class="n">${String(c.n).padStart(2,"0")}</span><span>${esc(c.title)}</span><span class="st ${p>=1?"done":p>0?"part":""}" aria-label="${p>=1?"finished":p>0?"started":"not started"}"></span></a>`;}).join("");
}

/* ---------- PCB map ---------- */
function pcbMap(){
  const narrow=innerWidth<700, cols=narrow?3:6, nr=Math.ceil(M.length/cols);
  const cw=128, ch=66, gx=160, gy=narrow?150:192, xs=40, W=xs*2+(cols-1)*gx+cw, H=70+(nr-1)*gy+ch+80;
  const pos=M.map((c,i)=>{const r=Math.floor(i/cols), k=i%cols, col=r%2?cols-1-k:k; return {c,x:xs+col*gx,y:70+r*gy,r};});
  let traces="", lit="";
  for(let i=0;i<pos.length-1;i++){const a=pos[i], b=pos[i+1]; let d;
    if(a.r===b.r){ const ax=a.x<b.x?a.x+cw:a.x, bx=a.x<b.x?b.x:b.x+cw, y=a.y+ch/2; d=`M${ax} ${y}H${bx}`; }
    else { const x=a.x+cw/2; d=`M${x} ${a.y+ch}V${b.y}`; }
    traces+=`<path d="${d}" class="tr"/>`; if(S.done[a.c.n]) lit+=`<path d="${d}" class="tr lit"/>`;
  }
  const deco=`<path class="tr thin" d="M20 30H${W-20}M20 30V${H-30}M${W-20} 30V${H-30}M20 ${H-30}H${W-20}"/>`+(narrow?"":`<path class="tr thin" d="M104 136V170H264V136M424 136V180H904V136M744 328V380H264V328M104 520V545H584V520"/>`);
  const vias=(narrow?[]:[[104,170],[264,170],[424,180],[904,180],[744,380],[264,380],[104,545],[584,545]]).map(([x,y])=>`<circle cx="${x}" cy="${y}" r="5" class="via"/>`).join("");
  const holes=[[20,30],[W-20,30],[20,H-30],[W-20,H-30]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="9" class="hole"/>`).join("");
  const chips=pos.map(({c,x,y})=>{const p=prog(c), done=p>=1; const pins=[0,1,2,3,4].map(k=>`<rect x="${x+14+k*22}" y="${y-6}" width="10" height="6" class="pin"/><rect x="${x+14+k*22}" y="${y+ch}" width="10" height="6" class="pin"/>`).join("");
    return `<a href="#m-${c.n}" class="chipLink" aria-label="Module ${c.n}: ${esc(c.title)}${done?", finished":""}">${pins}<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="4" class="chip ${done?"done":p>0?"part":""}"/><circle cx="${x+10}" cy="${y+10}" r="3" class="notch"/>
     <text x="${x+cw/2}" y="${y+28}" class="silk small">U${String(c.n).padStart(2,"0")}</text><text x="${x+cw/2}" y="${y+48}" class="silk">${esc(c.short)}</text>
     <circle cx="${x+cw-12}" cy="${y+12}" r="5" class="led ${done?"on":p>0?"dim":""}"/>
     ${p>0&&!done?`<rect x="${x+8}" y="${y+ch-8}" width="${(cw-16)*p/0.9}" height="3" class="prog"/>`:""}</a>`;}).join("");
  const n=M.filter(c=>S.done[c.n]).length;
  return `<div class="pcbWrap" id="pcb" data-cols="${cols}"><svg class="pcb${narrow?" narrow":""}" viewBox="0 0 ${W} ${H}" role="group" aria-label="Course map. Each chip is a module. Finished modules light up.">
   <rect x="0" y="0" width="${W}" height="${H}" rx="18" class="board"/>${deco}${traces}${lit}${vias}${holes}${chips}
   <text x="40" y="${H-8}" class="silk tiny l">OHMLY · REV 1.0</text><text x="${W-40}" y="${H-8}" class="silk tiny r">${n}/${M.length} POWERED</text></svg></div>`;
}

/* ---------- home ---------- */
function home(){
  const L=BC.level(S.xp);
  const next=M[(ORDER.find(n=>!S.done[n])||1)-1];
  const answered=Object.values(S.quiz).reduce((s,q)=>s+realKeys(q).length,0);
  const fresh=!S.welcomed;
  return `
  ${fresh?`<section class="welcome" id="welcome" aria-labelledby="wh"><div><span class="label">Welcome</span><h2 id="wh">Learn electronics by poking at it.</h2>
    <ol class="steps"><li><b>Pick a module</b> on the board below. Module 1 is the place to start.</li><li><b>Play with the labs.</b> Every slider is a real circuit calculation, and most labs animate or make sound.</li><li><b>Take the quiz</b>, then mark the module done to light up its chip.</li><li><b>Drill in the arcade</b> whenever you have five minutes.</li></ol>
    <p class="note">Your progress stays in this browser only. No account, no tracking. Back it up from About and settings.</p></div>
    <div class="welcomeBtns"><a class="btn primary big" href="#m-1" id="wGo">Start Module 1</a><button class="btn" type="button" id="wClose">Look around first</button></div></section>`:""}
  <section class="hero">
    <div class="heroText">
      <span class="label">An interactive platform for learning electronics</span>
      <h1>Power up the board, one module at a time.</h1>
      <p>17 modules, 27 hands-on labs, 7 arcade games and more than 90 quiz questions, from Ohm's law to op amps, microcontrollers and motors. It all runs in your browser.</p>
      <div class="heroBtns"><a class="btn primary big" href="#m-${next.n}">${S.lastCh?"Continue":"Start"}: ${esc(next.title)}</a><a class="btn big" href="#arcade">Play the arcade</a></div>
    </div>
    <div class="levelCard">
      <span class="label">Your level</span>
      <div class="lvBig"><b>${L.name}</b><span class="mono">Lv ${L.i+1}</span></div>
      <div class="xpTrack" role="progressbar" aria-label="XP toward next level" aria-valuemin="${L.from}" aria-valuemax="${L.to}" aria-valuenow="${S.xp}"><i style="width:${L.next?((S.xp-L.from)/(L.to-L.from)*100):100}%"></i></div>
      <span class="note">${L.next?`${L.to-S.xp} XP to ${L.next}`:"Top level reached. Go build something."}</span>
      <div class="miniStats"><div><b class="mono">${S.streak.n||0}</b><span>day streak</span></div><div><b class="mono">${M.filter(c=>S.done[c.n]).length}</b><span>modules finished</span></div><div><b class="mono">${answered}</b><span>questions answered</span></div><div><b class="mono">${Object.keys(S.labs).length}</b><span>labs explored</span></div></div>
    </div>
  </section>
  ${pcbMap()}
  <section>
    <div class="sectionHead"><h2>Learning paths</h2><span class="label">pick one or follow them in order</span></div>
    <div class="tracks">${D.TRACKS.map(t=>`<div class="track ${t.cls}"><h3>${t.name}</h3><p>${t.desc}</p><ol>${t.mods.map(n=>{const c=M[n-1];return `<li class="${S.done[n]?"isdone":""}"><a href="#m-${n}">${esc(c.title)}</a></li>`;}).join("")}</ol></div>`).join("")}</div>
  </section>
  <section>
    <div class="sectionHead"><h2>Badges</h2><span class="label">${Object.keys(S.badges).length} of ${Object.keys(BC.BADGES).length}</span></div>
    <div class="badges">${Object.entries(BC.BADGES).map(([id,b])=>`<div class="badge ${S.badges[id]?"got":""}"><div class="medal" aria-hidden="true">${badgeIcon(id)}</div><b>${esc(b[0])}</b><span>${esc(b[1])}</span><span class="sr">${S.badges[id]?"Unlocked":"Locked"}</span></div>`).join("")}</div>
  </section>`;
}
function badgeIcon(id){const i={"first-light":"✦","flawless":"★","knob":"◐","labrat":"⚗","roll":"➜","half":"◑","graduate":"▲","smoke":"☁","probe":"∿","rainbow":"▥","divider":"÷","detective":"?","habit":"☀","cards":"▤","roulette":"◎","fuse":"✕","meter":"✓"}; return i[id]||"●";}

/* ---------- module ---------- */
function moduleView(c){
  const right=countRight(c), prev=M[c.n-2], next=M[c.n];
  return `
  <section class="chHead">
    <span class="label">Module ${c.n} of ${M.length}</span>
    <h1 tabindex="-1">${esc(c.title)}</h1>
    <div class="actions">${tierChip(c.tier)}${c.labs.length?`<span class="chip">${c.labs.length} lab${c.labs.length>1?"s":""}</span>`:""}<span class="chip">${c.quiz.length} questions</span><span style="flex:1"></span>
    <button class="btn primary ${S.done[c.n]?"isdone":""}" id="doneBtn" type="button" aria-pressed="${!!S.done[c.n]}">${S.done[c.n]?"✓ Module powered up":"Mark done · +50 XP"}</button></div>
  </section>
  <section class="prose"><p class="lede">${esc(c.big)}</p></section>
  ${c.tip?`<div class="tip"><b>Bench tip.</b> ${esc(c.tip)}</div>`:""}
  <section class="panel"><h2>Key ideas</h2><ul class="ideas">${c.ideas.map(i=>`<li><span>${esc(i)}</span></li>`).join("")}</ul></section>
  ${c.formulas.length?`<section><div class="sectionHead spread"><h2>Formulas to know</h2><a class="label" href="#game-cards">drill them as flashcards →</a></div><div class="formulas">${c.formulas.map(f=>`<div class="formula"><div class="eq">${esc(f[0])}</div><div class="what">${esc(f[1])}</div></div>`).join("")}</div></section>`:""}
  ${c.labs.length?`<section><div class="sectionHead"><h2>Labs</h2><span class="label">+5 XP for each one you try</span></div><div class="labNav">${c.labs.map(k=>`<a href="#lab-${k}" class="chip labJump">${esc(BC.LABS[k].title)}</a>`).join("")}</div><div id="labs"></div></section>`:""}
  <section class="panel" id="quiz"><div class="sectionHead spread"><h2>Check yourself</h2><span class="score" id="score" aria-live="polite">${right}/${c.quiz.length} correct · +10 XP each</span></div>
    ${c.quiz.map((q,i)=>quizItem(c,q,i)).join("")}
    ${realKeys(S.quiz[c.n]).length?`<button class="btn" id="resetQuiz" type="button">Reset this quiz</button>`:""}
  </section>
  ${c.reading?`<p class="reading"><span class="label">Further reading</span> Pairs well with <i>${esc(D.BOOK.title)}</i> (${esc(D.BOOK.ed)}), ${esc(c.reading)}. Ohmly is independent and not affiliated with the book's authors or publisher.</p>`:""}
  <nav class="pager" aria-label="Module navigation">${prev?`<a href="#m-${prev.n}"><span>← Module ${prev.n}</span>${esc(prev.title)}</a>`:`<a href="#home"><span>←</span>Course map</a>`}${next?`<a href="#m-${next.n}" class="r"><span>Module ${next.n} →</span>${esc(next.title)}</a>`:`<a href="#arcade" class="r"><span>→</span>Arcade</a>`}</nav>`;
}
function quizItem(c,q,i){
  const qs=S.quiz[c.n]||{}, st=qs[i], ans=qs["p"+i];
  return `<fieldset class="q" data-i="${i}"><legend class="qt">${i+1}. ${esc(q.q)}</legend><div class="opts">${q.o.map((o,j)=>{
    let cls=""; if(st!==undefined){ if(j===q.a) cls="right"; else if(ans===j) cls="wrong"; }
    return `<button type="button" data-j="${j}" class="${cls}" ${st!==undefined?"disabled":""}>${esc(o)}${cls==="right"?' <span class="sr">(correct answer)</span>':cls==="wrong"?' <span class="sr">(your answer)</span>':""}</button>`;}).join("")}</div>
    <div class="why" ${st===undefined?"hidden":""} aria-live="polite"><b>${st?"Correct.":"Not quite."}</b> ${esc(q.w)}</div></fieldset>`;
}

/* ---------- arcade ---------- */
function arcade(){
  return `<section class="chHead"><span class="label">Arcade</span><h1 tabindex="-1">Practice that feels like playing.</h1><p class="prose muted">Quick games that drill the skills you'll use most at the bench. Every game awards XP, and your best scores are saved.</p></section>
  <div class="arcadeGrid">${Object.entries(BC.GAMES).map(([id,g])=>`<a class="gameCard" href="#game-${id}"><div class="art">${g.art}</div><div><span class="label">${esc(g.tag)}</span><h3>${esc(g.title)}</h3><p>${esc(g.desc)}</p></div><span class="best mono">${S.hi[id]!==undefined?"Best: "+S.hi[id]:"Not played yet"}</span></a>`).join("")}</div>`;
}
function gameView(id){const g=BC.GAMES[id]; return `<section class="chHead"><a class="label back" href="#arcade">← Arcade</a><h1 tabindex="-1">${esc(g.title)}</h1><p class="prose muted">${esc(g.desc)}</p></section><div id="gameHost"></div>`;}

/* ---------- formulas ---------- */
function formulas(){
  return `<section class="chHead"><span class="label">Reference</span><h1 tabindex="-1">Formula sheet</h1><p class="prose muted">Every formula in the course on one page. Type to filter.</p>
  <div class="ctrl"><label for="fsearch"><span>Search formulas</span></label><input type="search" id="fsearch" placeholder="Try power, 555, filter, dB" autocomplete="off"></div></section>
  <div id="flist">${M.filter(c=>c.formulas.length).map(c=>`<section class="fgroup"><div class="sectionHead spread"><h3>${c.n}. ${esc(c.title)}</h3><a class="label" href="#m-${c.n}">open module →</a></div><div class="formulas">${c.formulas.map(f=>`<div class="formula" data-k="${esc((f[0]+" "+f[1]+" "+c.title).toLowerCase())}"><div class="eq">${esc(f[0])}</div><div class="what">${esc(f[1])}</div></div>`).join("")}</div></section>`).join("")}</div>
  <p class="note" id="fnone" hidden>No formulas match that search.</p>`;
}

/* ---------- about + settings ---------- */
function about(){
  const t=S.theme||"system";
  return `<section class="chHead"><span class="label">About</span><h1 tabindex="-1">About Ohmly</h1></section>
  <section class="prose"><p class="lede">Ohmly is a free, hands-on electronics course that runs entirely in your browser. Every lab does real circuit math, so what you see on screen is what you'd measure at the bench, within the limits of simple models.</p>
  <p>The course is built for self-learners: makers, students, and anyone who has tried to read a 1,000-page electronics textbook and wished it would just let them turn the knobs. It works as a standalone course or alongside any good textbook.</p></section>
  <section class="panel"><h2>Settings</h2>
   <div class="settings">
    <div class="ctrl"><label for="setTheme"><span>Theme</span></label><select id="setTheme"><option value="system"${t==="system"?" selected":""}>Match my device</option><option value="light"${t==="light"?" selected":""}>Light</option><option value="dark"${t==="dark"?" selected":""}>Dark</option></select></div>
    <label class="check"><input type="checkbox" id="setSound"${S.sound?" checked":""}> Sound effects</label>
   </div></section>
  <section class="panel"><h2>Your progress</h2>
   <p class="muted">Progress is saved in this browser only. Nothing is sent anywhere. To move to another device or browser, download a backup here and import it there.</p>
   <div class="row2 wrapRow"><button class="btn primary" type="button" id="exp">Download backup</button><button class="btn" type="button" id="expCopy">Copy backup as text</button><label class="btn" for="impFile">Import from file</label><input type="file" id="impFile" accept=".json,application/json" class="visuallyHidden"></div>
   <details class="paste"><summary>Paste a backup instead</summary><div class="ctrl"><label for="impText"><span>Backup text</span></label><textarea id="impText" rows="4" spellcheck="false"></textarea></div><button class="btn" type="button" id="impGo">Import pasted backup</button></details>
   <p class="note" id="impMsg" aria-live="polite"></p>
   <div class="danger"><button class="btn" type="button" id="reset">Reset all progress</button><span id="resetConfirm" hidden><span class="note bad">This erases XP, badges, quiz answers and high scores.</span> <button class="btn dangerBtn" type="button" id="resetYes">Yes, erase everything</button> <button class="btn" type="button" id="resetNo">Cancel</button></span></div>
  </section>
  <section class="panel"><h2>More free tools worth knowing</h2>
   <ul class="ideas links">
    <li><span><a href="https://www.falstad.com/circuit/" rel="noopener">Falstad Circuit Simulator</a>. Draw any circuit and watch it run, with hundreds of built-in examples.</span></li>
    <li><span><a href="https://phet.colorado.edu/en/simulations/circuit-construction-kit-dc" rel="noopener">PhET Circuit Construction Kit</a>. A friendly drag-and-drop circuit sandbox from the University of Colorado.</span></li>
    <li><span><a href="https://www.tinkercad.com/circuits" rel="noopener">Tinkercad Circuits</a>. A virtual breadboard with a programmable Arduino.</span></li>
    <li><span><a href="https://wokwi.com/" rel="noopener">Wokwi</a>. Simulates Arduino, ESP32 and Raspberry Pi Pico projects in the browser.</span></li>
    <li><span><a href="https://nandgame.com/" rel="noopener">Nandgame</a>. Build a computer from NAND gates, one puzzle at a time.</span></li>
    <li><span><a href="https://www.allaboutcircuits.com/textbook/" rel="noopener">All About Circuits textbook</a>. A free online electronics textbook.</span></li>
   </ul></section>
  <section class="panel"><h2>The fine print</h2>
   <ul class="ideas">
    <li><span>Labs use simplified models: ideal sources, typical part values and first-order behavior. They're built for intuition. Always check a part's datasheet before you build.</span></li>
    <li><span>Mains electricity can kill. Nothing here is instructions for working on mains-powered equipment.</span></li>
    <li><span>Ohmly is independent. Book references are suggestions for further reading only, and imply no affiliation or endorsement.</span></li>
    <li><span>Fonts: Bricolage Grotesque, IBM Plex Sans and IBM Plex Mono, all under the SIL Open Font License, bundled with the site.</span></li>
    <li><span>No cookies, analytics or third-party requests.</span></li>
   </ul></section>`;
}
function backupJSON(){ return JSON.stringify({app:"ohmly",v:1,saved:new Date().toISOString(),state:S}); }
function importBackup(txt){
  try{ const o=JSON.parse(txt); const st=o&&o.app==="ohmly"?o.state:o; if(!st||typeof st!=="object"||typeof st.xp!=="number") throw new Error("bad");
    Object.keys(S).forEach(k=>delete S[k]); Object.assign(S,{done:{},quiz:{},xp:0,badges:{},labs:{},hi:{},cards:{},streak:{last:null,n:0},sound:true},st); BC.save(); applyTheme(); render();
    const m=$("#impMsg"); if(m){m.className="note good"; m.textContent=`Backup imported: ${S.xp} XP, ${Object.keys(S.badges).length} badges.`;} }
  catch(e){ const m=$("#impMsg"); if(m){m.className="note bad"; m.textContent="That doesn't look like a Ohmly backup. Check that you copied the whole text, starting with { and ending with }.";} }
}

/* ---------- router ---------- */
function render(){
  BC.leave.forEach(f=>{try{f();}catch(e){}}); BC.leave.length=0; BC.clearAnims();
  const h=location.hash.replace("#","")||"home"; const v=$("#view"); let m, title="Ohmly";
  if((m=/^m-(\d+)$/.exec(h)) && M[+m[1]-1]){
    const c=M[+m[1]-1]; currentKey=c.n; S.lastCh=c.n; BC.save(); v.innerHTML=moduleView(c); title=`${c.title} · Ohmly`;
    if(c.labs.length){const host=$("#labs"); c.labs.forEach(k=>BC.mountLab(k,host));}
    $$(".labJump").forEach(a=>a.addEventListener("click",e=>{e.preventDefault(); const t=$(a.getAttribute("href")); if(t){t.scrollIntoView({behavior:BC.reduced?"auto":"smooth",block:"start"}); t.setAttribute("tabindex","-1"); t.focus({preventScroll:true});}}));
    $("#doneBtn").addEventListener("click",e=>{const was=!!S.done[c.n]; S.done[c.n]=!was; BC.save(); const b=e.currentTarget;
      b.classList.toggle("isdone",!was); b.setAttribute("aria-pressed",!was); b.textContent=!was?"✓ Module powered up":"Mark done · +50 XP";
      if(!was){ const r=b.getBoundingClientRect(); BC.beep("level"); BC.confetti(r.left+r.width/2,r.top); S.xpDone ||= {}; if(!S.xpDone[c.n]){S.xpDone[c.n]=1; BC.addXP(50,"module "+c.n+" finished");}
        const n=M.filter(x=>S.done[x.n]).length; if(n>=3) BC.badge("roll"); if(n>=9) BC.badge("half"); if(n>=M.length) BC.badge("graduate"); }
      rail(c.n);});
    $("#quiz").addEventListener("click",e=>{
      if(e.target.id==="resetQuiz"){S.quiz[c.n]={}; BC.save(); render(); return;}
      const b=e.target.closest(".opts button"); if(!b||b.disabled) return;
      const qd=b.closest(".q"), i=+qd.dataset.i, j=+b.dataset.j, q=c.quiz[i], ok=j===q.a;
      const qs=(S.quiz[c.n] ||= {}); S.xpQ ||= {}; const first=!S.xpQ[c.n+"-"+i]; S.xpQ[c.n+"-"+i]=1; qs[i]=ok; qs["p"+i]=j; BC.save();
      qd.querySelectorAll(".opts button").forEach((x,k)=>{x.disabled=true; if(k===q.a){x.classList.add("right"); x.insertAdjacentHTML("beforeend",' <span class="sr">(correct answer)</span>');} else if(k===j){x.classList.add("wrong"); x.insertAdjacentHTML("beforeend",' <span class="sr">(your answer)</span>');}});
      const w=qd.querySelector(".why"); w.hidden=false; w.innerHTML=`<b>${ok?"Correct.":"Not quite."}</b> ${esc(q.w)}`;
      if(ok){ BC.beep("good"); if(first) BC.addXP(10,"correct answer"); BC.badge("first-light"); const r=b.getBoundingClientRect(); BC.confetti(r.left+r.width/2,r.top+10,24); }
      else { BC.beep("bad"); qd.classList.add("shake"); setTimeout(()=>qd.classList.remove("shake"),400); }
      const rc=countRight(c); $("#score").textContent=`${rc}/${c.quiz.length} correct · +10 XP each`;
      if(realKeys(qs).length===c.quiz.length && rc===c.quiz.length){ BC.badge("flawless"); BC.confetti(); }
      rail(c.n);
    });
  } else if((m=/^game-(\w+)$/.exec(h)) && BC.GAMES[m[1]]){
    currentKey="game"; v.innerHTML=gameView(m[1]); BC.GAMES[m[1]].mount($("#gameHost")); title=`${BC.GAMES[m[1]].title} · Ohmly`;
  } else if(h==="arcade"){ currentKey="arcade"; v.innerHTML=arcade(); title="Arcade · Ohmly"; }
  else if(h==="formulas"){ currentKey="formulas"; v.innerHTML=formulas(); title="Formula sheet · Ohmly";
    $("#fsearch").addEventListener("input",e=>{const q=e.target.value.trim().toLowerCase(); $$(".formula[data-k]").forEach(f=>f.hidden=!!q&&!f.dataset.k.includes(q)); let any=false; $$(".fgroup").forEach(g=>{const vis=$$(".formula",g).some(f=>!f.hidden); g.hidden=!vis; any=any||vis;}); $("#fnone").hidden=any;});
  } else if(h==="about"){ currentKey="about"; v.innerHTML=about(); title="About · Ohmly";
    $("#setTheme").addEventListener("change",e=>{S.theme=e.target.value; BC.save(); applyTheme(); header(); rerun();});
    $("#setSound").addEventListener("change",e=>{S.sound=e.target.checked; BC.save(); header();});
    $("#exp").addEventListener("click",()=>{ try{ const blob=new Blob([backupJSON()],{type:"application/json"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`ohmly-backup-${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},500); $("#impMsg").className="note good"; $("#impMsg").textContent="Backup downloaded."; }catch(e){ $("#impMsg").className="note bad"; $("#impMsg").textContent="Your browser blocked the download. Use Copy backup as text instead."; } });
    $("#expCopy").addEventListener("click",()=>{ const t=backupJSON(); const done=()=>{$("#impMsg").className="note good"; $("#impMsg").textContent="Backup copied. Paste it into a note or a file to keep it.";};
      if(navigator.clipboard) navigator.clipboard.writeText(t).then(done,()=>{ $("#impText").value=t; $("#impText").closest("details").open=true; $("#impText").select(); $("#impMsg").className="note"; $("#impMsg").textContent="Copying was blocked, so the backup is in the box below. Select it and copy it yourself."; });
      else { $("#impText").value=t; $("#impText").closest("details").open=true; $("#impText").select(); } });
    $("#impFile").addEventListener("change",e=>{const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>importBackup(r.result); r.readAsText(f);});
    $("#impGo").addEventListener("click",()=>importBackup($("#impText").value));
    $("#reset").addEventListener("click",()=>{$("#resetConfirm").hidden=false; $("#resetNo").focus();});
    $("#resetNo").addEventListener("click",()=>{$("#resetConfirm").hidden=true; $("#reset").focus();});
    $("#resetYes").addEventListener("click",()=>{const keep={sound:S.sound,theme:S.theme,welcomed:true}; Object.keys(S).forEach(k=>delete S[k]); Object.assign(S,{done:{},quiz:{},lastCh:null,xp:0,badges:{},labs:{},hi:{},cards:{},streak:{last:null,n:0}},keep); BC.save(); render(); $("#impMsg").className="note good"; $("#impMsg").textContent="All progress erased. Fresh start.";});
  } else { currentKey="home"; v.innerHTML=home(); title="Ohmly · An interactive platform for learning electronics";
    const w=$("#welcome"); if(w){ const close=()=>{S.welcomed=true; BC.save(); w.remove();}; $("#wClose").addEventListener("click",close); $("#wGo").addEventListener("click",()=>{S.welcomed=true; BC.save();}); }
  }
  document.title=title; rail(currentKey); header(); window.scrollTo(0,0);
  const h1=$("#view h1"); if(h1&&routed){ h1.setAttribute("tabindex","-1"); h1.focus({preventScroll:true}); }
  routed=true;
  $("#rail").classList.remove("open"); $("#railToggle").setAttribute("aria-expanded","false");
}
let routed=false;
const rerun=()=>$$(".lab").forEach(l=>l._run&&l._run());

$("#railToggle").addEventListener("click",()=>{const r=$("#rail"),o=!r.classList.contains("open"); r.classList.toggle("open",o); $("#railToggle").setAttribute("aria-expanded",o);});
$("#soundBtn").addEventListener("click",()=>{S.sound=!S.sound; BC.save(); header(); if(S.sound) BC.beep("good");});
$("#themeBtn").addEventListener("click",()=>{const order=["system","light","dark"]; S.theme=order[(order.indexOf(S.theme||"system")+1)%3]; BC.save(); applyTheme(); header(); rerun(); BC.toast("Theme: "+({system:"match my device",light:"light",dark:"dark"})[S.theme]);});
window.addEventListener("hashchange",render);
let rt; window.addEventListener("resize",()=>{clearTimeout(rt); rt=setTimeout(()=>{rerun(); const p=$("#pcb"); if(p&&+p.dataset.cols!==(innerWidth<700?3:6)) p.outerHTML=pcbMap();},150);});
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change",rerun);
BC.tickStreak();
render();
})();
