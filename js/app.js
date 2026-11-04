/* Ohmly: views and routing */
(function(){
const BC=window.BC, {$,$$,esc,S}=BC;
const D=window.SB_DATA; const M=D.M;
BC.DATA={M};
const realKeys=o=>Object.keys(o||{}).filter(k=>!k.startsWith("p"));
const countRight=c=>{const q=S.quiz[c.n]||{}; return realKeys(q).filter(k=>q[k]).length;};
const answeredIn=c=>realKeys(S.quiz[c.n]).length;
const prog=c=>S.done[c.n]?1:(c.quiz.length?Math.min(.9,.9*answeredIn(c)/c.quiz.length):0);
const pad=n=>String(n).padStart(2,"0");
const partOf=c=>D.PARTS[c.part];
/* parts in D.PARTS order, only those that have modules */
const partKeys=()=>Object.keys(D.PARTS).filter(p=>M.some(c=>c.part===p));
const labTotal=()=>new Set(M.flatMap(c=>c.labs)).size;
const WORDS=["Zero","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
const TENS=["","","Twenty","Thirty","Forty"];
const word=n=>n<20?WORDS[n]:n<50?TENS[Math.floor(n/10)]+(n%10?"-"+WORDS[n%10].toLowerCase():""):String(n);

/* ---------- theme ---------- */
function applyTheme(){ const t=S.theme||"system"; if(t==="system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme",t); }
applyTheme();

/* ---------- header ---------- */
function header(){
  const L=BC.level(S.xp);
  $("#lvLink").innerHTML=`Lv <b>${L.i+1}</b> · <b>${S.xp}</b> XP`;
  $("#lvLink").setAttribute("aria-label",`Logbook: level ${L.i+1}, ${S.xp} XP`);
  const sb=$("#soundBtn"); sb.setAttribute("aria-pressed",S.sound); sb.title=S.sound?"Sound on":"Sound off";
  sb.innerHTML=`<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/>${S.sound?'<path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>':'<path d="M17 9l5 6M22 9l-5 6"/>'}</svg>`;
  const tb=$("#themeBtn"), t=S.theme||"system"; tb.title="Theme: "+t; tb.setAttribute("aria-label","Theme: "+t+". Click to change.");
  tb.innerHTML=t==="dark"?'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>':t==="light"?'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/></svg>':'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>';
  const nk=navKey(); $$(".topnav a").forEach(a=>{ if(a.getAttribute("href").slice(1)===nk) a.setAttribute("aria-current","page"); else a.removeAttribute("aria-current"); });
}
/* which top-menu entry a view belongs to */
const navKey=()=>typeof currentKey==="number"||currentKey==="home"?"home":currentKey==="formulas"?"reference":currentKey==="arcade"||currentKey==="game"?"practice":currentKey;
BC.onXP=()=>{header(); rail(currentKey);};

/* ---------- rail ---------- */
let currentKey="home";
function rail(cur){
  let html="";
  partKeys().forEach(p=>{
    html+=`<div class="grp">${esc(D.PARTS[p].name)}</div>`+
     M.filter(c=>c.part===p).map(c=>{const done=S.done[c.n], n=answeredIn(c);
       return `<a href="#m-${c.n}" class="${cur===c.n?"on":""}"${cur===c.n?' aria-current="page"':""}><span class="n">${pad(c.n)}</span><span>${esc(c.title)}</span><span class="st ${done?"done":""}">${done?"✓":n?"·":""}</span></a>`;}).join("");
  });
  html+=`<div class="more"><div class="grp">More</div>${[["teardown","Teardown"],["reference","Reference"],["practice","Practice"],["log","Logbook · Lv "+(BC.level(S.xp).i+1)]].map(([k,t])=>`<a href="#${k}" class="${navKey()===k?"on":""}"><span class="n">›</span><span>${esc(t)}</span><span class="st"></span></a>`).join("")}</div>`;
  $("#rail").innerHTML=html;
}

/* ---------- PCB progress board ---------- */
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
  const deco=`<path class="tr thin" d="M20 30H${W-20}M20 30V${H-30}M${W-20} 30V${H-30}M20 ${H-30}H${W-20}"/>`;
  const holes=[[20,30],[W-20,30],[20,H-30],[W-20,H-30]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="9" class="hole"/>`).join("");
  const chips=pos.map(({c,x,y})=>{const p=prog(c), done=p>=1; const pins=[0,1,2,3,4].map(k=>`<rect x="${x+14+k*22}" y="${y-6}" width="10" height="6" class="pin"/><rect x="${x+14+k*22}" y="${y+ch}" width="10" height="6" class="pin"/>`).join("");
    return `<a href="#m-${c.n}" class="chipLink" aria-label="Module ${c.n}: ${esc(c.title)}${done?", finished":""}">${pins}<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="3" class="chip ${done?"done":p>0?"part":""}"/><circle cx="${x+10}" cy="${y+10}" r="3" class="notch"/>
     <text x="${x+cw/2}" y="${y+28}" class="silk small">U${pad(c.n)}</text><text x="${x+cw/2}" y="${y+50}" class="silk">${esc(c.short)}</text>
     <circle cx="${x+cw-12}" cy="${y+12}" r="5" class="led ${done?"on":p>0?"dim":""}"/>
     ${p>0&&!done?`<rect x="${x+8}" y="${y+ch-8}" width="${(cw-16)*p/0.9}" height="3" class="prog"/>`:""}</a>`;}).join("");
  const n=M.filter(c=>S.done[c.n]).length;
  return `<div class="pcbWrap" id="pcb" data-cols="${cols}"><svg class="pcb${narrow?" narrow":""}" viewBox="0 0 ${W} ${H}" role="group" aria-label="Progress board. Each chip is a module; finished modules light up.">
   <rect x="0" y="0" width="${W}" height="${H}" rx="14" class="board"/>${deco}${traces}${lit}${holes}${chips}
   <text x="40" y="${H-8}" class="silk tiny l">OHMLY · REV 1.0</text><text x="${W-40}" y="${H-8}" class="silk tiny r">${n}/${M.length} POWERED</text></svg></div>`;
}

/* ---------- home ---------- */
/* ull-pocket's outline and largest top-side parts, in mm, from data/ull-pocket.json */
const BOARD_RECTS="26,0,13,11 26.7,11.8,5.8,16.6 15.2,36.7,9.6,7.8 1,2.1,9.2,8.2 16.9,14.6,4.6,4 29.1,32.6,3.8,3.8 34.8,28.1,3.6,2.9 18.6,31.6,2.9,3.6 .9,12.6,3.3,2.9 20.9,18.9,1.8,4.2 15.5,23.5,4.2,1.8 15.5,26.1,4.2,1.8 31.3,42.6,3.5,1.9 23.5,13.6,2,2.7 5.4,12.4,2,2.3 14.9,15.2,1.4,2.9 21.8,.8,2.9,1.4 18.3,18.9,1.4,2.9 13,33.3,2,2".split(" ");
const boardArt=()=>`<svg viewBox="-1 -1 42 46.5" width="58" height="64" aria-hidden="true"><rect x="0" y="0" width="40" height="44.5" rx="1" class="mapBd"/>${BOARD_RECTS.map(r=>{const [x,y,w,h]=r.split(",");return `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="mapPt"/>`;}).join("")}${[[2.8,41.3],[37.2,41.3]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="1.4" class="mapHole"/>`).join("")}</svg>`;
function courseMap(next){
  const tile=c=>{ const p=prog(c), done=S.done[c.n];
    return `<a class="mapT${done?" done":""}${c===next?" next":""}" href="#m-${c.n}" title="${esc(c.title)}" aria-label="Module ${c.n}: ${esc(c.title)}${done?", finished":""}"><span class="n">${done?"✓":pad(c.n)}</span><span class="s">${esc(c.short)}</span>${p>0&&!done?`<i style="width:${p/.9*100}%"></i>`:""}</a>`; };
  return `<section class="map" aria-labelledby="mapH"><h2 id="mapH" class="sr">Course map</h2>
    ${partKeys().map(p=>`<div class="mapRow"><h3><span class="mono">${p}</span> ${esc(D.PARTS[p].name)}</h3><div class="mapTiles">${M.filter(c=>c.part===p).map(tile).join("")}</div></div>`).join("")}
    <div class="mapRow"><h3><span class="mono">›</span> Board</h3><div class="mapTiles"><a class="mapBoard" href="#teardown" aria-label="Teardown: one real board, part by part">${boardArt()}<span>Teardown</span></a></div></div>
  </section>`;
}
function home(){
  const next=M.find(c=>!S.done[c.n])||M[0];
  const started=S.xp>0||Object.keys(S.done).length, fin=M.filter(c=>S.done[c.n]).length, lp=BC.lessonProgress(next.n);
  const where=lp&&lp.started&&!lp.done?`Lesson, step ${Math.min(lp.step+1,lp.total)} of ${lp.total}`:`${fin} of ${M.length} finished`;
  return (started?`<header class="cont"><div><p class="label">Continue · module ${next.n} · ${esc(where)}</p><h1 tabindex="-1">${esc(next.title)}</h1></div><a class="btn primary big" href="#m-${next.n}">Continue →</a></header>`
    :`<div class="heroL"><h1 tabindex="-1">Electronics, at the bench.</h1><div id="lessonHost"></div></div>`)+courseMap(next);
}

/* ---------- logbook ---------- */
function logbook(){
  const L=BC.level(S.xp), fin=M.filter(c=>S.done[c.n]).length;
  const answered=Object.values(S.quiz).reduce((s,q)=>s+realKeys(q).length,0), right=M.reduce((s,c)=>s+countRight(c),0);
  const pct=L.next?((S.xp-L.from)/(L.to-L.from)*100):100;
  const icon={"first-light":"✦","flawless":"★","knob":"◐","labrat":"⚗","roll":"→","half":"◑","graduate":"▲","smoke":"☁","probe":"∿","rainbow":"▥","divider":"÷","detective":"?","habit":"☀","cards":"▤","roulette":"◎","fuse":"✕","meter":"✓"};
  return `<header><h1 tabindex="-1">Logbook</h1><p class="lede muted" style="margin-top:12px">Your progress, saved in this browser.</p></header>
  <section><div class="sectionHead"><h2>Level</h2></div>
   <div class="lvRow"><div><div class="big">${L.i+1} · ${esc(L.name)}</div><div class="meterbar" role="progressbar" aria-valuemin="${L.from}" aria-valuemax="${L.to}" aria-valuenow="${S.xp}" aria-label="XP toward next level"><i style="width:${pct}%"></i></div></div>
   <p class="muted">${S.xp} XP${L.next?`. ${L.to-S.xp} more to reach ${esc(L.next)}.`:". Top level."}</p></div></section>
  <section><div class="sectionHead"><h2>Summary</h2></div>
   <table class="spec"><tbody>
    <tr><td>Modules finished</td><td>${fin} / ${M.length}</td></tr>
    <tr><td>Quiz answers</td><td>${right} right of ${answered}</td></tr>
    <tr><td>Labs tried</td><td>${Object.keys(S.labs).filter(k=>BC.LABS[k]).length} / ${labTotal()}</td></tr>
    <tr><td>Days in a row</td><td>${S.streak.n||0}</td></tr>
    ${Object.entries(BC.GAMES).map(([id,g])=>`<tr><td>${esc(g.title)}, best</td><td>${S.hi[id]!==undefined?S.hi[id]:"—"}</td></tr>`).join("")}
   </tbody></table></section>
  <section><div class="sectionHead"><h2>Board</h2><span class="label">finished modules light up</span></div>${pcbMap()}</section>
  <section><div class="sectionHead spread"><h2>Badges</h2><span class="label">${Object.keys(S.badges).length} of ${Object.keys(BC.BADGES).length}</span></div>
   <table class="badgeT"><tbody>${Object.entries(BC.BADGES).map(([id,b])=>`<tr class="${S.badges[id]?"got":""}"><td class="m" aria-hidden="true">${icon[id]||"●"}</td><td><b>${esc(b[0])}</b><br><span class="muted">${esc(b[1])}</span></td><td class="s">${S.badges[id]?new Date(S.badges[id]).toLocaleDateString():"—"}</td></tr>`).join("")}</tbody></table></section>
  <p class="muted">Back up or move your progress from <a href="#about">About and settings</a>.</p>`;
}

/* ---------- module ---------- */
/* tabs that have content, in order: [key, label, count] */
const tabsOf=c=>[["lesson","Lesson",BC.lessonFor(c.n)?1:0,""],["notes","Notes",1,""],["labs","Labs",c.labs.length,c.labs.length],["practice","Practice",BC.probCount(c.n),BC.probCount(c.n)],["quiz","Quiz",c.quiz.length,c.quiz.length]].filter(t=>t[2]);
const defaultTab=c=>BC.lessonFor(c.n)?"lesson":"notes";
function moduleView(c,tab){
  const right=countRight(c), prev=M[c.n-2], next=M[c.n], tabs=tabsOf(c), has=k=>tabs.some(t=>t[0]===k);
  const panel=(k,body)=>has(k)?`<div class="tabPanel" role="tabpanel" id="panel-${k}" aria-labelledby="tab-${k}" tabindex="0"${k===tab?"":" hidden"}>${body}</div>`:"";
  return `
  <header class="modHead">
    <div class="modNo" aria-hidden="true">${pad(c.n)}</div>
    <div class="modTi"><p class="partName">Module ${c.n} · Part ${c.part}, ${esc(partOf(c).name)}</p><h1 tabindex="-1">${esc(c.title)}</h1></div>
    <button class="btn ${S.done[c.n]?"":"primary"}" id="doneBtn" type="button" aria-pressed="${!!S.done[c.n]}">${S.done[c.n]?"✓ Finished":"Mark as finished"}</button>
    <div class="modTabs" role="tablist" aria-label="Module sections">${tabs.map(t=>`<a role="tab" id="tab-${t[0]}" href="#m-${c.n}/${t[0]}" aria-controls="panel-${t[0]}" aria-selected="${t[0]===tab}" tabindex="${t[0]===tab?0:-1}">${t[1]}${t[3]?`<small>${t[3]}</small>`:""}</a>`).join("")}</div>
  </header>
  ${panel("lesson",`<div id="lessonHost"></div>`)}
  ${panel("notes",`<div class="tabStack">
  <section class="prose"><p class="lede">${esc(c.big)}</p></section>
  <section><div class="sectionHead"><h2>Key points</h2></div><ul class="ideas">${c.ideas.map(i=>`<li><span>${esc(i)}</span></li>`).join("")}</ul></section>
  ${c.formulas.length?`<section><div class="sectionHead spread"><h2>Formulas</h2><a class="label" href="#game-cards">practice as flashcards</a></div><div class="formulas">${c.formulas.map(f=>`<div class="formula"><div class="eq">${esc(f[0])}</div><div class="what">${esc(f[1])}</div></div>`).join("")}</div></section>`:""}
  ${(c.ex||[]).length?`<section id="ex"><div class="sectionHead"><h2>Worked examples</h2></div>${c.ex.map((e,i)=>`<div class="ex"><p class="exq"><span class="label">Example ${c.n}.${i+1}</span>${esc(e.q)}</p><ol class="steps">${e.steps.map(t=>`<li>${esc(t)}</li>`).join("")}</ol><p class="exa"><span class="label">Answer</span>${esc(e.ans)}</p></div>`).join("")}</section>`:""}
  ${(c.deep||[]).length?`<section id="deep"><div class="sectionHead spread"><h2>Going deeper</h2><span class="label">optional · not needed to finish the module</span></div>${c.deep.map(d=>`<details class="dd"><summary>${esc(d.t)}</summary><div class="ddb">${deepBody(d.body)}</div></details>`).join("")}</section>`:""}
  ${c.tip?`<p class="tip"><b>Note</b>${esc(c.tip)}</p>`:""}
  ${c.reading?`<p class="reading">Further reading: <i>${esc(D.BOOK.title)}</i>, ${esc(D.BOOK.ed)}, ${esc(c.reading)}. Ohmly isn't affiliated with the book or its publisher.</p>`:""}
  </div>`)}
  ${panel("labs",`<section>${c.labs.length>1?`<nav class="labNav" aria-label="Labs in this module">${c.labs.map((k,i)=>`<a href="#lab-${k}" class="labJump">Fig. ${c.n}.${i+1} ${esc(BC.LABS[k].title)}</a>`).join("")}</nav>`:""}<div id="labs"></div></section>`)}
  ${panel("practice",`<section id="probs"><div class="sectionHead spread"><h2>Practice problems</h2><span class="label">new numbers each time · 4.7k, 15m, 2.2u</span></div><div id="probList"></div></section>`)}
  ${panel("quiz",`<section id="quiz"><div class="sectionHead spread"><h2>Check</h2><span class="score" id="score" aria-live="polite">${right} of ${c.quiz.length} right</span></div>
    ${c.quiz.map((q,i)=>quizItem(c,q,i)).join("")}
    ${answeredIn(c)?`<button class="btn" id="resetQuiz" type="button">Clear answers</button>`:""}
  </section>`)}
  <nav class="pager" aria-label="Module navigation">${prev?`<a href="#m-${prev.n}"><span>← ${pad(prev.n)}</span>${esc(prev.title)}</a>`:`<a href="#home"><span>←</span>Contents</a>`}${next?`<a href="#m-${next.n}" class="r"><span>${pad(next.n)} →</span>${esc(next.title)}</a>`:`<a href="#arcade" class="r"><span>→</span>Arcade</a>`}</nav>`;
}
/* #m-1, #m-1/quiz, #lab-ohm -> {c, tab, lab} */
function modRoute(h){
  let m=/^m-(\d+)(?:\/(\w+))?$/.exec(h);
  if(m){ const c=M[+m[1]-1]; if(!c) return null; return {c,tab:tabsOf(c).some(t=>t[0]===m[2])?m[2]:defaultTab(c)}; }
  m=/^lab-(\w+)$/.exec(h); if(!m) return null;
  const c=M.find(x=>x.labs.includes(m[1])); return c?{c,tab:"labs",lab:m[1]}:null;
}
/* panels mount on first view: a lab canvas has no size while its panel is hidden */
function showTab(c,tab){
  $$(".tabPanel").forEach(p=>p.hidden=p.id!=="panel-"+tab);
  $$(".modTabs [role=tab]").forEach(t=>{ const on=t.id==="tab-"+tab; t.setAttribute("aria-selected",on); t.tabIndex=on?0:-1; });
  if(tab==="labs"){ const host=$("#labs"); if(host&&!host.children.length) c.labs.forEach((k,i)=>BC.mountLab(k,host,`${c.n}.${i+1}`)); }
  if(tab==="lesson"){ const host=$("#lessonHost"); if(host&&!host.children.length) BC.mountLesson(host,c.n); }
  rerun();
}
const scrollToLab=lab=>{ const t=$("#lab-"+lab); if(!t) return; t.scrollIntoView({behavior:"auto",block:"start"}); t.setAttribute("tabindex","-1"); t.focus({preventScroll:true}); };
/* deep body: blocks split by a blank line; "= " lines are formulas, "- " lines a list, anything else a paragraph */
function deepBody(b){ return b.split("\n\n").map(k=>{ const ln=k.split("\n");
  return ln.every(x=>x.startsWith("= "))?`<div class="dform">${ln.map(x=>`<div>${esc(x.slice(2))}</div>`).join("")}</div>`:ln.every(x=>x.startsWith("- "))?`<ul class="ideas">${ln.map(x=>`<li><span>${esc(x.slice(2))}</span></li>`).join("")}</ul>`:`<p>${esc(k)}</p>`; }).join(""); }
let qperm=[]; // shuffled option order per question, fresh each render; stored answers use the original index
function quizItem(c,q,i){
  const qs=S.quiz[c.n]||{}, st=qs[i], ans=qs["p"+i];
  return `<fieldset class="q" data-i="${i}"><legend class="qt">${c.n}.${i+1}  ${esc(q.q)}</legend><div class="opts">${(qperm[i]=BC.shuffle(q.o.map((o,j)=>j))).map(j=>{
    let cls=""; if(st!==undefined){ if(j===q.a) cls="right"; else if(ans===j) cls="wrong"; }
    return `<button type="button" data-j="${j}" class="${cls}" ${st!==undefined?"disabled":""}>${esc(q.o[j])}${cls==="right"?' <span class="sr">(correct answer)</span>':cls==="wrong"?' <span class="sr">(your answer)</span>':""}</button>`;}).join("")}</div>
    <div class="why" ${st===undefined?"hidden":""} aria-live="polite"><b>${st?"Right.":"Not quite."}</b> ${esc(q.w)}</div></fieldset>`;
}

/* ---------- arcade ---------- */
const gameList=()=>`<div class="gameList">${Object.entries(BC.GAMES).map(([id,g])=>`<a class="gameRow" href="#game-${id}"><div class="art">${g.art}</div><div><h3>${esc(g.title)}</h3><p>${esc(g.desc)}</p></div><span class="best">${S.hi[id]!==undefined?"best "+S.hi[id]:esc(g.tag)}</span></a>`).join("")}</div>`;
function arcade(){
  return `<header class="stack"><a class="back" href="#practice">← Practice</a><h1 tabindex="-1">Arcade</h1><p class="lede muted">Short games for the skills you use most at the bench. Each one takes a few minutes.</p></header>${gameList()}`;
}

/* ---------- reference index: add an entry here for each new reference section ---------- */
function reference(){
  const nf=M.reduce((s,c)=>s+c.formulas.length,0);
  const idx=[["formulas","Formulas","Every formula in the course, grouped by module, with a filter.",`${nf} formulas`]];
  return `<header class="stack"><h1 tabindex="-1">Reference</h1><p class="lede muted">Sheets and tables to look things up in.</p></header>
  <section><div class="sectionHead"><h2>Index</h2></div><div class="gameList">${idx.map(([k,t,d,n],i)=>`<a class="gameRow idx" href="#${k}"><span class="no">${pad(i+1)}</span><div><h3>${esc(t)}</h3><p>${esc(d)}</p></div><span class="best">${esc(n)}</span></a>`).join("")}</div></section>`;
}

/* ---------- practice: mixed drill + arcade ---------- */
function practice(){
  const parts=BC.probParts();
  return `<header class="stack"><h1 tabindex="-1">Practice</h1><p class="lede muted">Problems with fresh numbers every time, then games for speed.</p></header>
  <section id="drill"><div class="sectionHead spread"><h2>Problems</h2><span class="label">each problem pays XP once · 4.7k, 15m, 2.2u</span></div>
   <div class="ctrl drillSel"><label for="drillPart"><span>Draw from</span></label><select id="drillPart"><option value="">All parts</option>${parts.map(p=>`<option value="${p}">Part ${p}, ${esc(D.PARTS[p].name)}</option>`).join("")}</select></div>
   <div id="drillHost"></div></section>
  <section><div class="sectionHead"><h2>Arcade</h2></div>${gameList()}</section>`;
}
function mountDrill(){
  const sel=$("#drillPart"); let last="";
  const draw=()=>{ const pool=BC.probPool(sel.value), alt=pool.filter(x=>x.join("-")!==last), [n,i]=BC.pick(alt.length?alt:pool); last=n+"-"+i; return {n,i,label:`Module ${n} · Problem ${n}.${i+1}`}; };
  const show=()=>BC.probMount($("#drillHost"),[draw()],draw);
  sel.addEventListener("change",show); show();
}

function gameView(id){const g=BC.GAMES[id]; return `<header class="stack"><a class="back" href="#practice">← Practice</a><h1 tabindex="-1">${esc(g.title)}</h1><p class="lede muted">${esc(g.desc)}</p></header><div id="gameHost"></div>`;}

/* ---------- formulas ---------- */
function formulas(){
  return `<header class="stack"><a class="back" href="#reference">← Reference</a><h1 tabindex="-1">Formula sheet</h1><p class="lede muted">Every formula in the course, by module.</p>
  <div class="ctrl" style="max-width:420px"><label for="fsearch"><span>Filter</span></label><input type="search" id="fsearch" placeholder="power, 555, filter, dB…" autocomplete="off"></div></header>
  <div id="flist">${M.filter(c=>c.formulas.length).map(c=>`<section class="fgroup"><div class="sectionHead spread"><h3>${pad(c.n)} ${esc(c.title)}</h3><a class="label" href="#m-${c.n}">open module</a></div><div class="formulas">${c.formulas.map(f=>`<div class="formula" data-k="${esc((f[0]+" "+f[1]+" "+c.title).toLowerCase())}"><div class="eq">${esc(f[0])}</div><div class="what">${esc(f[1])}</div></div>`).join("")}</div></section>`).join("")}</div>
  <p class="muted" id="fnone" hidden>Nothing matches that.</p>`;
}

/* ---------- about + settings ---------- */
function about(){
  const t=S.theme||"system";
  return `<header><h1 tabindex="-1">About Ohmly</h1></header>
  <section class="prose stack"><p class="lede">Ohmly is a free electronics course that runs in your browser. Every lab does real circuit math, so the numbers you see are the ones you'd measure, within the limits of simple models.</p>
  <p>It's written for people learning on their own: makers, students, and anyone who opened a thousand-page textbook and wanted to turn the knobs instead. It works on its own or next to any good book.</p></section>
  <section><div class="sectionHead"><h2>Settings</h2></div>
   <div class="settings">
    <div class="ctrl"><label for="setTheme"><span>Theme</span></label><select id="setTheme"><option value="system"${t==="system"?" selected":""}>Match my device</option><option value="light"${t==="light"?" selected":""}>Light</option><option value="dark"${t==="dark"?" selected":""}>Dark</option></select></div>
    <label class="check"><input type="checkbox" id="setSound"${S.sound?" checked":""}> Sound effects</label>
   </div></section>
  <section><div class="sectionHead"><h2>Progress</h2></div>
   <p class="muted" style="margin-bottom:14px;max-width:66ch">Progress is saved in this browser and never sent anywhere. To move it to another device, download a backup here and import it there.</p>
   <div class="row2 wrapRow"><button class="btn primary" type="button" id="exp">Download backup</button><button class="btn" type="button" id="expCopy">Copy as text</button><label class="btn" for="impFile">Import file</label><input type="file" id="impFile" accept=".json,application/json" class="visuallyHidden"></div>
   <details class="paste"><summary>Paste a backup instead</summary><div class="ctrl"><label for="impText"><span>Backup text</span></label><textarea id="impText" rows="4" spellcheck="false"></textarea></div><button class="btn" type="button" id="impGo">Import</button></details>
   <p class="note" id="impMsg" aria-live="polite"></p>
   <div class="danger"><button class="btn" type="button" id="reset">Reset all progress</button><span id="resetConfirm" hidden><span class="note bad" style="padding:0">This erases XP, badges, answers and high scores.</span> <button class="btn dangerBtn" type="button" id="resetYes">Erase everything</button> <button class="btn" type="button" id="resetNo">Cancel</button></span></div>
  </section>
  <section><div class="sectionHead"><h2>Other free tools</h2></div>
   <ul class="ideas">
    <li><span><a href="https://www.falstad.com/circuit/" rel="noopener">Falstad Circuit Simulator</a>: draw any circuit and watch it run.</span></li>
    <li><span><a href="https://phet.colorado.edu/en/simulations/circuit-construction-kit-dc" rel="noopener">PhET Circuit Construction Kit</a>: a drag-and-drop circuit sandbox.</span></li>
    <li><span><a href="https://www.tinkercad.com/circuits" rel="noopener">Tinkercad Circuits</a>: a virtual breadboard with an Arduino.</span></li>
    <li><span><a href="https://wokwi.com/" rel="noopener">Wokwi</a>: Arduino, ESP32 and Pico simulation.</span></li>
    <li><span><a href="https://nandgame.com/" rel="noopener">Nandgame</a>: build a computer out of NAND gates.</span></li>
    <li><span><a href="https://www.allaboutcircuits.com/textbook/" rel="noopener">All About Circuits</a>: a free online textbook.</span></li>
   </ul></section>
  <section><div class="sectionHead"><h2>Notes</h2></div>
   <ul class="ideas">
    <li><span>Labs use simple models: ideal sources, typical part values, first-order behavior. Check datasheets before you build.</span></li>
    <li><span>Mains electricity can kill. Nothing here is guidance for working on mains-powered equipment.</span></li>
    <li><span>Book references are suggestions for further reading only and imply no affiliation.</span></li>
    <li><span>Type is set in Barlow Condensed, IBM Plex Sans and IBM Plex Mono, all under the SIL Open Font License and served from this site.</span></li>
    <li><span>No cookies, no analytics, no third-party requests.</span></li>
   </ul></section>`;
}
function backupJSON(){ return JSON.stringify({app:"ohmly",v:1,saved:new Date().toISOString(),state:S}); }
function importBackup(txt){
  try{ const o=JSON.parse(txt); const st=o&&o.app==="ohmly"?o.state:o; if(!st||typeof st!=="object"||typeof st.xp!=="number") throw new Error("bad");
    const px=S.pxmm; Object.keys(S).forEach(k=>delete S[k]); Object.assign(S,BC.sanitize(st)); if(px) S.pxmm=px; else delete S.pxmm; BC.save(); applyTheme(); render();
    const m=$("#impMsg"); if(m){m.className="note good"; m.textContent=`Imported: ${S.xp} XP, ${Object.keys(S.badges).length} badges.`;} }
  catch(e){ const m=$("#impMsg"); if(m){m.className="note bad"; m.textContent="That isn't an Ohmly backup. Make sure you copied all of it, from the first { to the last }.";} }
}

/* ---------- router ---------- */
function render(){
  BC.leave.forEach(f=>{try{f();}catch(e){}}); BC.leave.length=0; BC.clearAnims();
  const h=location.hash.replace("#","")||"home"; const v=$("#view"); let m, title="Ohmly", lab=null;
  const rt=modRoute(h), cm=rt&&rt.c; if(rt) lab=rt.lab||null;
  if(cm){
    const c=cm; currentKey=c.n; S.lastCh=c.n; BC.save(); v.innerHTML=moduleView(c,rt.tab); title=`${pad(c.n)} ${c.title} · Ohmly`;
    showTab(c,rt.tab);
    if(BC.probCount(c.n)) BC.probMount($("#probList"),Array.from({length:BC.probCount(c.n)},(_,i)=>({n:c.n,i,label:`Problem ${c.n}.${i+1}`})));
    $$(".labJump").forEach(a=>a.addEventListener("click",e=>{e.preventDefault(); const t=$(a.getAttribute("href")); if(t){t.scrollIntoView({behavior:BC.reduced?"auto":"smooth",block:"start"}); t.setAttribute("tabindex","-1"); t.focus({preventScroll:true});}}));
    $(".modTabs").addEventListener("keydown",e=>{ const tabs=$$(".modTabs [role=tab]"), i=tabs.indexOf(document.activeElement); if(i<0) return;
      const to=e.key==="ArrowRight"?(i+1)%tabs.length:e.key==="ArrowLeft"?(i-1+tabs.length)%tabs.length:e.key==="Home"?0:e.key==="End"?tabs.length-1:null;
      if(to!==null){ e.preventDefault(); tabs[to].focus(); location.hash=tabs[to].getAttribute("href"); }
      else if(e.key===" "){ e.preventDefault(); location.hash=tabs[i].getAttribute("href"); } });
    $("#doneBtn").addEventListener("click",e=>{const was=!!S.done[c.n]; S.done[c.n]=!was; BC.save(); const b=e.currentTarget;
      b.classList.toggle("primary",was); b.setAttribute("aria-pressed",!was); b.textContent=!was?"✓ Finished":"Mark as finished";
      if(!was){ BC.beep("level"); S.xpDone ||= {}; if(!S.xpDone[c.n]){S.xpDone[c.n]=1; BC.addXP(50,"module "+c.n+" finished");}
        const n=M.filter(x=>S.done[x.n]).length; if(n>=3) BC.badge("roll"); if(n>=Math.ceil(M.length/2)) BC.badge("half"); if(n>=M.length) BC.badge("graduate"); }
      rail(c.n);});
    $("#quiz").addEventListener("click",e=>{
      if(e.target.id==="resetQuiz"){S.quiz[c.n]={}; BC.save(); render(); setTimeout(()=>$("#quiz")?.scrollIntoView(),0); return;}
      const b=e.target.closest(".opts button"); if(!b||b.disabled) return;
      const qd=b.closest(".q"), i=+qd.dataset.i, j=+b.dataset.j, q=c.quiz[i], ok=j===q.a;
      const qs=(S.quiz[c.n] ||= {}); S.xpQ ||= {}; const first=!S.xpQ[c.n+"-"+i]; S.xpQ[c.n+"-"+i]=1; qs[i]=ok; qs["p"+i]=j; BC.save();
      qd.querySelectorAll(".opts button").forEach(x=>{const k=+x.dataset.j; x.disabled=true; if(k===q.a){x.classList.add("right"); x.insertAdjacentHTML("beforeend",' <span class="sr">(correct answer)</span>');} else if(k===j){x.classList.add("wrong"); x.insertAdjacentHTML("beforeend",' <span class="sr">(your answer)</span>');}});
      const w=qd.querySelector(".why"); w.hidden=false; w.innerHTML=`<b>${ok?"Right.":"Not quite."}</b> ${esc(q.w)}`;
      if(ok){ BC.beep("good"); if(first) BC.addXP(10,"correct answer"); BC.badge("first-light"); }
      else { BC.beep("bad"); qd.classList.add("shake"); setTimeout(()=>qd.classList.remove("shake"),400); }
      const rc=countRight(c); $("#score").textContent=`${rc} of ${c.quiz.length} right`;
      if(realKeys(qs).length===c.quiz.length && rc===c.quiz.length) BC.badge("flawless");
      rail(c.n);
    });
  } else if((m=/^game-(\w+)$/.exec(h)) && BC.GAMES[m[1]]){
    currentKey="game"; v.innerHTML=gameView(m[1]); BC.GAMES[m[1]].mount($("#gameHost")); title=`${BC.GAMES[m[1]].title} · Ohmly`;
  } else if(h==="arcade"){ currentKey="arcade"; v.innerHTML=arcade(); title="Arcade · Ohmly"; }
  else if((m=/^teardown(?:\/(.+))?$/.exec(h))){ currentKey="teardown"; v.innerHTML=BC.TD.page(); title="Teardown · Ohmly"; BC.TD.mount(m[1]); }
  else if(h==="reference"){ currentKey="reference"; v.innerHTML=reference(); title="Reference · Ohmly"; }
  else if(h==="practice"){ currentKey="practice"; v.innerHTML=practice(); title="Practice · Ohmly"; mountDrill(); }
  else if(h==="log"){ currentKey="log"; v.innerHTML=logbook(); title="Logbook · Ohmly"; }
  else if(h==="formulas"){ currentKey="formulas"; v.innerHTML=formulas(); title="Formula sheet · Ohmly";
    $("#fsearch").addEventListener("input",e=>{const q=e.target.value.trim().toLowerCase(); $$(".formula[data-k]").forEach(f=>f.hidden=!!q&&!f.dataset.k.includes(q)); let any=false; $$(".fgroup").forEach(g=>{const vis=$$(".formula",g).some(f=>!f.hidden); g.hidden=!vis; any=any||vis;}); $("#fnone").hidden=any;});
  } else if(h==="about"){ currentKey="about"; v.innerHTML=about(); title="About · Ohmly";
    $("#setTheme").addEventListener("change",e=>{S.theme=e.target.value; BC.save(); applyTheme(); header(); rerun();});
    $("#setSound").addEventListener("change",e=>{S.sound=e.target.checked; BC.save(); header();});
    $("#exp").addEventListener("click",()=>{ try{ const blob=new Blob([backupJSON()],{type:"application/json"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`ohmly-backup-${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},500); $("#impMsg").className="note good"; $("#impMsg").textContent="Backup downloaded."; }catch(e){ $("#impMsg").className="note bad"; $("#impMsg").textContent="The download was blocked. Use Copy as text instead."; } });
    $("#expCopy").addEventListener("click",()=>{ const t=backupJSON(); const done=()=>{$("#impMsg").className="note good"; $("#impMsg").textContent="Copied. Paste it into a note or file to keep it.";};
      const fallback=()=>{ $("#impText").value=t; $("#impText").closest("details").open=true; $("#impText").select(); $("#impMsg").className="note"; $("#impMsg").textContent="Copying was blocked, so the backup is in the box below. Select it and copy it yourself."; };
      if(navigator.clipboard) navigator.clipboard.writeText(t).then(done,fallback); else fallback(); });
    $("#impFile").addEventListener("change",e=>{const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>importBackup(r.result); r.readAsText(f);});
    $("#impGo").addEventListener("click",()=>importBackup($("#impText").value));
    $("#reset").addEventListener("click",()=>{$("#resetConfirm").hidden=false; $("#resetNo").focus();});
    $("#resetNo").addEventListener("click",()=>{$("#resetConfirm").hidden=true; $("#reset").focus();});
    $("#resetYes").addEventListener("click",()=>{const keep={sound:S.sound,theme:S.theme}; if(S.pxmm) keep.pxmm=S.pxmm; Object.keys(S).forEach(k=>delete S[k]); Object.assign(S,BC.defaults(),keep); BC.save(); render(); $("#impMsg").className="note good"; $("#impMsg").textContent="All progress erased.";});
  } else if(h==="home"||h==="view"){ currentKey="home"; v.innerHTML=home(); title="Ohmly · An interactive platform for learning electronics"; const lh=$("#lessonHost"); if(lh) BC.mountLesson(lh,1); }
  else { currentKey="404"; v.innerHTML=`<header class="stack"><h1 tabindex="-1">Not found</h1><p class="lede muted">There is nothing at this address. <a href="#home">Back to the contents</a>.</p></header>`; title="Not found · Ohmly"; }
  document.title=title; document.body.classList.toggle("tdWide",currentKey==="teardown"); document.body.classList.toggle("homeV",currentKey==="home"); rail(currentKey); header(); window.scrollTo(0,0);
  if(lab&&$("#lab-"+lab)) scrollToLab(lab);
  else { const h1=$("#view h1"); if(h1&&routed) h1.focus({preventScroll:true}); }
  routed=true;
  $("#rail").classList.remove("open"); $("#railToggle").setAttribute("aria-expanded","false");
}
let routed=false;
const rerun=()=>{$$(".lab").forEach(l=>l._run&&l._run()); BC.redraw();};

$("#railToggle").addEventListener("click",()=>{const r=$("#rail"),o=!r.classList.contains("open"); r.classList.toggle("open",o); $("#railToggle").setAttribute("aria-expanded",o);});
$("#soundBtn").addEventListener("click",()=>{S.sound=!S.sound; BC.save(); header(); if(S.sound) BC.beep("good");});
$("#themeBtn").addEventListener("click",()=>{const order=["system","light","dark"]; S.theme=order[(order.indexOf(S.theme||"system")+1)%3]; BC.save(); applyTheme(); header(); rerun(); BC.toast("Theme: "+({system:"match my device",light:"light",dark:"dark"})[S.theme]);});
window.addEventListener("hashchange",()=>{ if(location.hash==="#view"){ $("#view").focus(); return; }
  /* a tab change inside the open module keeps the page: no remount, no focus jump */
  const rt=modRoute(location.hash.replace("#",""));
  if(rt&&rt.c.n===currentKey&&$(".modTabs")){ showTab(rt.c,rt.tab); const tl=$(".modTabs");
    if(rt.lab) scrollToLab(rt.lab); else if(scrollY>tl.getBoundingClientRect().top+scrollY-64) tl.scrollIntoView({block:"start"});
    return; }
  render(); });
let rt; window.addEventListener("resize",()=>{clearTimeout(rt); rt=setTimeout(()=>{rerun(); const p=$("#pcb"); if(p&&+p.dataset.cols!==(innerWidth<700?3:6)) p.outerHTML=pcbMap();},150);});
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change",rerun);
BC.tickStreak();
try{ render(); }catch(e){ console.error(e); const keep=S.theme; Object.keys(S).forEach(k=>delete S[k]); Object.assign(S,BC.defaults()); if(keep) S.theme=keep; BC.save(); history.replaceState(null,"",location.pathname); render(); }
})();
