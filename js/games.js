/* Arcade mini-games */
(function(){
const BC=window.BC, {$,$$,fmt,esc,clamp,S}=BC;
const G=BC.GAMES={};
const hi=(id,score,better="max")=>{const prev=S.hi[id]; const isNew=prev===undefined||(better==="max"?score>prev:score<prev); if(isNew){S.hi[id]=score; BC.save();} return {isNew,best:S.hi[id]};};

/* ---------- Color Code Rush ---------- */
G.rush={title:"Color Code Rush",tag:"60 seconds",desc:"Read as many resistors as you can. Wrong answers cost 3 seconds.",
 art:`<svg viewBox="0 0 120 50" aria-hidden="true"><line x1="0" y1="25" x2="120" y2="25" stroke="currentColor" stroke-width="3"/><rect x="28" y="10" width="64" height="30" rx="12" fill="#D9C49A"/><rect x="38" y="10" width="6" height="30" fill="#ef7a12"/><rect x="50" y="10" width="6" height="30" fill="#7a4a1f"/><rect x="62" y="10" width="6" height="30" fill="#d0281c"/><rect x="78" y="10" width="6" height="30" fill="#c9a227"/></svg>`,
 mount(host){
  host.innerHTML=`<div class="game"><div class="gameBar"><span class="mono" id="gr-t">60.0 s</span><span class="mono" id="gr-s">Score 0</span><span class="mono" id="gr-c"></span></div>
   <div class="gameStage">${BC.resistorSVG("gr-svg")}<div class="opts grid2" id="gr-o"></div></div>
   <div class="gameEnd" id="gr-end" hidden></div>
   <button class="btn primary big" type="button" id="gr-go">Start</button></div>`;
  let t=60, score=0, combo=0, live=false, cur=null;
  const newQ=()=>{if(!$("#gr-svg")) return; const a=1+Math.floor(Math.random()*9), b=Math.floor(Math.random()*10), m=Math.floor(Math.random()*6); const v=(a*10+b)*Math.pow(10,m);
   BC.paintResistor($("#gr-svg"),a,b,m,5); const set=new Set([v]);
   const cands=[(b*10+a)*Math.pow(10,m),(a*10+b)*Math.pow(10,m+1),(a*10+b)*Math.pow(10,Math.max(-1,m-1)),(a*10+((b+1)%10))*Math.pow(10,m),(((a%9)+1)*10+b)*Math.pow(10,m)];
   for(const c of BC.shuffle(cands)){ if(set.size>=4) break; if(c>0) set.add(c); }
   cur=v; $("#gr-o").innerHTML=BC.shuffle([...set]).map(x=>`<button type="button" data-v="${x}">${fmt(x,"Ω")}</button>`).join("");};
  const end=()=>{live=false; $("#gr-o").innerHTML=""; const h=hi("rush",score); const e=$("#gr-end"); e.hidden=false;
   e.innerHTML=`<h3>${score} resistors read</h3><p>${h.isNew?"New personal best!":"Best: "+h.best}</p>`; $("#gr-go").hidden=false; $("#gr-go").textContent="Play again";
   if(score>0) BC.addXP(score*3,"Color Code Rush"); if(score>=15) BC.badge("rainbow"); if(h.isNew&&score>5) BC.confetti();};
  $("#gr-go").addEventListener("click",()=>{t=60;score=0;combo=0;live=true;$("#gr-end").hidden=true;$("#gr-go").hidden=true;$("#gr-s").textContent="Score 0";$("#gr-c").textContent="";newQ();});
  $("#gr-o").addEventListener("click",e=>{const b=e.target.closest("button"); if(!b||!live) return;
   if(+b.dataset.v===cur){score++;combo++;BC.beep("good");b.classList.add("right");$("#gr-c").textContent=combo>=3?`🔥 ×${combo}`:"";if(combo%5===0)t+=2;}
   else{combo=0;t-=3;BC.beep("bad");b.classList.add("wrong");$("#gr-c").textContent="−3 s";}
   $("#gr-s").textContent="Score "+score; setTimeout(()=>live&&newQ(),220);});
  BC.anim(dt=>{ if(!live) return; t-=dt; const el=$("#gr-t"); if(!el) return; el.textContent=Math.max(0,t).toFixed(1)+" s"; el.classList.toggle("hot",t<10); if(t<=0) end(); });
 }};

/* ---------- Divider Designer ---------- */
G.divider={title:"Divider Designer",tag:"5 rounds",desc:"Pick two standard resistors to hit a target voltage. Later rounds add a current budget.",
 art:`<svg viewBox="0 0 120 50" aria-hidden="true"><path d="M20 5v8l6 3-12 4 12 4-12 4 6 3v6l6 3-12 4 12 4-6 2" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="20" cy="27" r="3" fill="var(--accent)"/><path d="M20 27h40" stroke="var(--accent)" stroke-width="2"/><text x="64" y="31" font-family="IBM Plex Mono" font-size="12" fill="var(--accent)">3.3 V</text></svg>`,
 mount(host){
  const R=BC.e12List(100,1e6);
  host.innerHTML=`<div class="game"><div class="gameBar"><span class="mono" id="gd-r">Round 1 / 5</span><span class="mono" id="gd-s">Score 0</span></div>
   <div class="gameStage"><div class="targetBox"><span class="label">Target</span><b class="mono" id="gd-tg"></b><span id="gd-rule" class="note"></span></div>
   <div class="row3">${["1","2"].map(k=>`<div class="ctrl"><label for="gd-r${k}"><span>R${k}</span><output id="gd-r${k}-o"></output></label><input type="range" id="gd-r${k}" min="0" max="${R.length-1}" step="1" value="${R.indexOf(10000)}"></div>`).join("")}</div>
   <div class="readout"><div class="ro hl"><div class="k">Your Vout</div><div class="v" id="gd-v">—</div></div><div class="ro"><div class="k">Error</div><div class="v" id="gd-e">—</div></div><div class="ro"><div class="k">Current drawn</div><div class="v" id="gd-i">—</div></div></div>
   <button class="btn primary big" type="button" id="gd-lock">Lock it in</button><p class="note" id="gd-n"></p></div>
   <div class="gameEnd" id="gd-end" hidden></div></div>`;
  let round=0, score=0, errs=[], tgt=null;
  const newRound=()=>{if(!$("#gd-r")) return; round++; const vin=BC.pick([5,9,12,24]), vo=+BC.pick([1.2,1.8,2.5,3.3,(vin*BC.rand(0.15,0.85)).toFixed(2)]); tgt={vin,vo:Math.min(vo,vin*0.9),imax:round>=4?BC.pick([0.001,0.0005,0.0002]):null};
   $("#gd-r").textContent=`Round ${round} / 5`; $("#gd-tg").textContent=`${tgt.vo} V from ${vin} V`; $("#gd-rule").textContent=tgt.imax?`and draw no more than ${fmt(tgt.imax,"A")}`:"no current limit"; $("#gd-n").textContent=""; upd();};
  const upd=()=>{const r1=R[+$("#gd-r1").value], r2=R[+$("#gd-r2").value]; $("#gd-r1-o").textContent=fmt(r1,"Ω"); $("#gd-r2-o").textContent=fmt(r2,"Ω");
   const v=tgt.vin*r2/(r1+r2), I=tgt.vin/(r1+r2), err=Math.abs(v-tgt.vo)/tgt.vo*100; $("#gd-v").textContent=v.toFixed(3)+" V"; $("#gd-e").textContent=err.toFixed(2)+"%";
   const ie=$("#gd-i"); ie.textContent=fmt(I,"A"); ie.style.color=tgt.imax&&I>tgt.imax?"var(--bad)":""; return {v,I,err};};
  host.addEventListener("input",()=>{ if(tgt) upd(); });
  $("#gd-lock").addEventListener("click",()=>{const {I,err}=upd(); let pts=Math.max(0,Math.round(100-err*15)); let msg=`${err.toFixed(2)}% off: ${pts} points.`;
   if(tgt.imax&&I>tgt.imax){pts=Math.round(pts/3); msg+=" Over the current budget, so points cut to a third. Scale both resistors up by the same factor; the ratio stays the same."; BC.beep("bad");} else BC.beep(pts>80?"good":"xp");
   score+=pts; errs.push(err); $("#gd-s").textContent="Score "+score; $("#gd-n").textContent=msg;
   if(round>=5){ setTimeout(()=>{if(!$("#gd-end")) return; const avg=errs.reduce((a,b)=>a+b,0)/errs.length; const h=hi("divider",score); const e=$("#gd-end"); e.hidden=false;
     e.innerHTML=`<h3>${score} / 500</h3><p>Average error ${avg.toFixed(2)}%. ${h.isNew?"New best!":"Best: "+h.best}</p><button class="btn primary" type="button" id="gd-again">Play again</button>`;
     BC.addXP(Math.round(score/10),"Divider Designer"); if(avg<2) BC.badge("divider"); if(h.isNew) BC.confetti();
     $("#gd-again").addEventListener("click",()=>{round=0;score=0;errs=[];e.hidden=true;$("#gd-s").textContent="Score 0";newRound();});},700); }
   else setTimeout(newRound,1300);});
  newRound();
 }};

/* ---------- Gate Detective ---------- */
G.gates={title:"Gate Detective",tag:"6 mystery boxes",desc:"A logic gate is hidden in a box. Flip the inputs, watch the output, and name the gate in as few probes as you can.",
 art:`<svg viewBox="0 0 120 50" aria-hidden="true"><rect x="34" y="6" width="52" height="38" rx="4" fill="currentColor" opacity=".9"/><text x="60" y="32" text-anchor="middle" font-family="Bricolage Grotesque" font-size="22" fill="var(--surface)">?</text><path d="M4 18h30M4 32h30M86 25h30" stroke="currentColor" stroke-width="2.5"/></svg>`,
 mount(host){
  const names=["AND","OR","NAND","NOR","XOR","XNOR"];
  host.innerHTML=`<div class="game"><div class="gameBar"><span class="mono" id="gg-r">Box 1 / 6</span><span class="mono" id="gg-s">Score 0</span><span class="mono" id="gg-p">Probes 0</span></div>
   <div class="gameStage"><div class="toggles big"><div class="sw"><button type="button" id="gg-a" aria-pressed="false" aria-label="Input A"></button>A</div><div class="sw"><button type="button" id="gg-b" aria-pressed="false" aria-label="Input B"></button>B</div>
   <div class="mysteryBox">?</div><div class="sw"><div class="led big" id="gg-o"></div>OUT</div></div>
   <div class="probeLog mono" id="gg-log"></div>
   <div class="gates center" id="gg-g">${names.map(n=>`<button type="button" data-g="${n}">${n}</button>`).join("")}</div><p class="note center" id="gg-n">Every input combination you try is logged. Guess when you're sure.</p></div>
   <div class="gameEnd" id="gg-end" hidden></div></div>`;
  let round=0, score=0, right=0, gate=null, probes=new Set();
  const A=$("#gg-a"),B=$("#gg-b");
  const val=()=>[+(A.getAttribute("aria-pressed")==="true"),+(B.getAttribute("aria-pressed")==="true")];
  const show=()=>{const [a,b]=val(); const o=BC.GATES[gate](a,b); $("#gg-o").classList.toggle("on",!!o); probes.add(a+""+b); $("#gg-p").textContent="Probes "+probes.size;
   $("#gg-log").innerHTML=[...probes].sort().map(k=>`<span>${k[0]}${k[1]} → ${BC.GATES[gate](+k[0],+k[1])}</span>`).join("");};
  const next=()=>{if(!$("#gg-r")) return; round++; gate=BC.pick(names); probes=new Set(); A.setAttribute("aria-pressed","false"); B.setAttribute("aria-pressed","false"); $("#gg-r").textContent=`Box ${round} / 6`; $("#gg-n").textContent="Every input combination you try is logged. Guess when you're sure."; $$("#gg-g button").forEach(b=>{b.disabled=false;b.className="";}); show();};
  [A,B].forEach(el=>el.addEventListener("click",()=>{el.setAttribute("aria-pressed",el.getAttribute("aria-pressed")!=="true"); BC.beep("click"); show();}));
  $("#gg-g").addEventListener("click",e=>{const b=e.target.closest("button"); if(!b||b.disabled) return; const ok=b.dataset.g===gate;
   $$("#gg-g button").forEach(x=>{x.disabled=true; if(x.dataset.g===gate) x.className="right"; else if(x===b) x.className="wrong";});
   if(ok){const pts=Math.max(1,6-probes.size)+ (probes.size<=3?2:0); score+=pts; right++; BC.beep("good"); $("#gg-n").textContent=`Correct, it's ${gate}. +${pts} points.${probes.size<4?" Bold guess with fewer than 4 probes.":""}`;}
   else{BC.beep("bad"); $("#gg-n").textContent=`It was ${gate}. Its truth table: ${["00","01","10","11"].map(k=>k+"→"+BC.GATES[gate](+k[0],+k[1])).join("  ")}`;}
   $("#gg-s").textContent="Score "+score;
   if(round>=6) setTimeout(()=>{if(!$("#gg-end")) return; const h=hi("gates",score); const e=$("#gg-end"); e.hidden=false; e.innerHTML=`<h3>${right} of 6 identified · ${score} points</h3><p>${h.isNew?"New best!":"Best: "+h.best}</p><button class="btn primary" type="button" id="gg-again">Play again</button>`;
     BC.addXP(score*2,"Gate Detective"); if(right===6) BC.badge("detective"); if(h.isNew) BC.confetti();
     $("#gg-again").addEventListener("click",()=>{round=0;score=0;right=0;e.hidden=true;$("#gg-s").textContent="Score 0";next();});},900);
   else setTimeout(next,1500);});
  next();
 }};

/* ---------- Formula Flashcards (Leitner boxes) ---------- */
G.cards={title:"Formula Flashcards",tag:"spaced repetition",desc:"Every formula in the course. Cards you know move up a box and come back less often.",
 art:`<svg viewBox="0 0 120 50" aria-hidden="true"><rect x="30" y="10" width="54" height="34" rx="4" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(-8 57 27)"/><rect x="36" y="8" width="54" height="34" rx="4" fill="var(--surface)" stroke="currentColor" stroke-width="2.5"/><text x="63" y="30" text-anchor="middle" font-family="IBM Plex Mono" font-size="11" fill="currentColor">V=IR</text></svg>`,
 mount(host){
  const deck=[]; BC.DATA.M.forEach(c=>c.formulas.forEach((f,i)=>deck.push({id:c.n+"-"+i,front:f[1],back:f[0],ch:c})));
  host.innerHTML=`<div class="game"><div class="boxes" id="fc-b"></div>
   <div class="flip" id="fc-card" tabindex="0" role="button" aria-label="Flip card"><div class="face front"><span class="label" id="fc-ch"></span><b id="fc-f"></b><span class="note">What's the formula? Tap to flip.</span></div><div class="face back"><span class="label">Answer</span><b class="mono" id="fc-bk"></b><span class="note" id="fc-bn"></span></div></div>
   <div class="row2 center"><button class="btn" type="button" id="fc-again">Again</button><button class="btn primary" type="button" id="fc-got">Got it</button></div>
   <p class="note center" id="fc-n"></p></div>`;
  let cur=null, flipped=false, session=0;
  const box=id=>S.cards[id]||1;
  const bars=()=>{const cnt=[0,0,0,0,0]; deck.forEach(c=>cnt[box(c.id)-1]++); $("#fc-b").innerHTML=cnt.map((n,i)=>`<div class="bx"><div class="bxbar"><i style="height:${n/deck.length*100}%"></i></div><span class="mono">${n}</span><span class="label">Box ${i+1}</span></div>`).join(""); return cnt;};
  const next=()=>{const w=deck.map(c=>({c,w:Math.pow(0.35,box(c.id)-1)*Math.random()})).filter(x=>x.c!==cur).sort((a,b)=>b.w-a.w); cur=w[0].c; flipped=false; $("#fc-card").classList.remove("flipped");
   $("#fc-ch").textContent=`Module ${cur.ch.n} · ${cur.ch.short} · box ${box(cur.id)}`; $("#fc-f").textContent=cur.front; setTimeout(()=>{$("#fc-bk").textContent=cur.back; $("#fc-bn").textContent="";},150);};
  const flip=()=>{flipped=!flipped; $("#fc-card").classList.toggle("flipped",flipped); BC.beep("click");};
  $("#fc-card").addEventListener("click",flip); $("#fc-card").addEventListener("keydown",e=>{if(e.key===" "||e.key==="Enter"){e.preventDefault();flip();}});
  $("#fc-got").addEventListener("click",()=>{ if(!flipped){flip();return;} S.cards[cur.id]=Math.min(5,box(cur.id)+1); BC.save(); session++; BC.beep("good"); if(session%5===0) BC.addXP(10,"5 cards reviewed"); const cnt=bars(); if(cnt[4]>=10) BC.badge("cards"); next();});
  $("#fc-again").addEventListener("click",()=>{ if(!flipped){flip();return;} S.cards[cur.id]=1; BC.save(); session++; BC.beep("xp"); bars(); next();});
  bars(); next();
 }};

/* ---------- Pop Quiz Roulette ---------- */
G.quiz={title:"Pop Quiz Roulette",tag:"10 random questions",desc:"Questions from every module, shuffled. Streaks multiply your points.",
 art:`<svg viewBox="0 0 120 50" aria-hidden="true"><circle cx="60" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M60 5v40M40 25h40M46 11l28 28M74 11L46 39" stroke="currentColor" stroke-width="1.2" opacity=".6"/><circle cx="60" cy="25" r="4" fill="var(--accent)"/></svg>`,
 mount(host){
  host.innerHTML=`<div class="game"><div class="gameBar"><span class="mono" id="gq-r"></span><span class="mono" id="gq-s">Score 0</span><span class="mono" id="gq-k"></span></div><div class="gameStage left" id="gq-q"></div><div class="gameEnd" id="gq-end" hidden></div></div>`;
  let qs, i, score, streak, best;
  const start=()=>{const all=[]; BC.DATA.M.forEach(c=>c.quiz.forEach(q=>all.push({...q,ch:c}))); qs=BC.shuffle(all).slice(0,10); i=0; score=0; streak=0; best=0; $("#gq-end").hidden=true; show();};
  const show=()=>{const q=qs[i]; $("#gq-r").textContent=`Question ${i+1} / 10`; $("#gq-k").textContent=streak>=2?`streak ×${Math.min(streak,5)}`:"";
   $("#gq-q").innerHTML=`<span class="label">Module ${q.ch.n} · ${esc(q.ch.title)}</span><div class="qt big">${esc(q.q)}</div><div class="opts">${q.o.map((o,j)=>`<button type="button" data-j="${j}">${esc(o)}</button>`).join("")}</div><div class="why" hidden></div>`;};
  host.addEventListener("click",e=>{const b=e.target.closest("#gq-q .opts button"); if(b&&!b.disabled){const q=qs[i], j=+b.dataset.j, ok=j===q.a;
    $$("#gq-q .opts button").forEach((x,k)=>{x.disabled=true; if(k===q.a) x.classList.add("right"); else if(k===j) x.classList.add("wrong");});
    if(ok){streak++; best=Math.max(best,streak); const m=Math.min(streak,5); score+=10*m; BC.beep("good");} else {streak=0; BC.beep("bad");}
    $("#gq-s").textContent="Score "+score; const w=$("#gq-q .why"); w.hidden=false; w.innerHTML=`<b>${ok?"Correct.":"Not quite."}</b> ${esc(q.w)} <a href="#m-${q.ch.n}">Review module ${q.ch.n}</a><div><button class="btn primary" type="button" id="gq-next">${i<9?"Next question":"See results"}</button></div>`; return;}
   if(e.target.id==="gq-next"){ i++; if(i<10) show(); else { $("#gq-q").innerHTML=""; const h=hi("quiz",score); const el=$("#gq-end"); el.hidden=false; el.innerHTML=`<h3>${score} points</h3><p>Longest streak ${best}. ${h.isNew?"New best!":"Best: "+h.best}</p><button class="btn primary" type="button" id="gq-again">Spin again</button>`; BC.addXP(Math.round(score/5),"Pop Quiz Roulette"); if(best>=8) BC.badge("roulette"); if(h.isNew) BC.confetti(); } }
   if(e.target.id==="gq-again") start();});
  start();
 }};

/* ---------- Meter Madness ---------- */
G.meter={title:"Meter Madness",tag:"6 bench jobs",desc:"Set the dial, plug in the leads, connect the meter and measure. Get it wrong and you'll find out why meters have fuses.",
 art:`<svg viewBox="0 0 120 50" aria-hidden="true"><rect x="40" y="2" width="40" height="46" rx="6" fill="var(--accent)"/><rect x="45" y="7" width="30" height="12" rx="2" fill="var(--surface)"/><text x="60" y="16.5" text-anchor="middle" font-family="IBM Plex Mono" font-size="8" fill="currentColor">9.02</text><circle cx="60" cy="32" r="8" fill="var(--surface)"/><path d="M60 32l4-5" stroke="currentColor" stroke-width="2"/></svg>`,
 mount(host){
  const JOBS=[
   {t:"Check the 9 V battery's voltage.",want:{dial:"dcv",jack:"vo",conn:"across",pwr:"on"},read:"9.12 V",kind:"v",I:0},
   {t:"Measure the current through an indicator LED (about 15 mA).",want:{dial:"ma",jack:"ma",conn:"series",pwr:"on"},read:"14.8 mA",kind:"i",I:0.015},
   {t:"Measure the current drawn by a small motor (about 2 A).",want:{dial:"a",jack:"a10",conn:"series",pwr:"on"},read:"1.96 A",kind:"i",I:2},
   {t:"Find the value of a resistor on the board.",want:{dial:"ohm",jack:"vo",conn:"across",pwr:"off"},read:"4.68 kΩ",kind:"r",I:0},
   {t:"Measure the 12 V AC output of a transformer secondary.",want:{dial:"acv",jack:"vo",conn:"across",pwr:"on"},read:"12.4 V~",kind:"vac",I:0},
   {t:"Check whether a glass fuse is blown.",want:{dial:"cont",jack:"vo",conn:"across",pwr:"off"},read:"0.3 Ω · BEEP",kind:"c",I:0}];
  const OPT={dial:[["dcv","V ⎓ (DC volts)"],["acv","V ~ (AC volts)"],["ohm","Ω (resistance)"],["cont","Continuity ♪"],["ma","mA ⎓"],["a","10 A ⎓"]],jack:[["vo","VΩ jack"],["ma","mA jack"],["a10","10 A jack"]],conn:[["across","Probes across the part"],["series","Break the circuit, meter in series"]],pwr:[["on","Circuit powered"],["off","Circuit off"]]};
  host.innerHTML=`<div class="game"><div class="gameBar"><span class="mono" id="mm-r"></span><span class="mono" id="mm-s">Score 0</span><span class="mono" id="mm-f">Fuses blown 0</span></div>
   <div class="gameStage"><div class="job" id="mm-job"></div>
    <div class="meterBody"><div class="lcd mono" id="mm-lcd">----</div><div class="meterGrid">${Object.entries(OPT).map(([k,o])=>`<div class="ctrl"><label for="mm-${k}"><span>${{dial:"Dial",jack:"Red lead",conn:"Connection",pwr:"Power"}[k]}</span></label><select id="mm-${k}">${o.map(x=>`<option value="${x[0]}">${x[1]}</option>`).join("")}</select></div>`).join("")}</div>
    <button class="btn primary big" type="button" id="mm-go">Measure</button></div>
    <p class="note center" id="mm-n"></p></div><div class="gameEnd" id="mm-end" hidden></div></div>`;
  let i=0, score=0, tries=0, fuses=0;
  const show=()=>{const j=JOBS[i]; $("#mm-r").textContent=`Job ${i+1} / ${JOBS.length}`; $("#mm-job").innerHTML=`<span class="label">The job</span><b>${esc(j.t)}</b>`; $("#mm-lcd").textContent="----"; $("#mm-lcd").className="lcd mono"; $("#mm-n").textContent=""; tries=0;};
  const judge=(j,s)=>{
   const ammeterJack=s.jack!=="vo";
   if(ammeterJack && s.conn==="across" && s.pwr==="on") return {fuse:true,msg:"BANG. In a current jack the meter is nearly a short circuit. Placed across a powered part, it shorted the supply and blew its fuse. Current is always measured in series."};
   if(s.jack==="ma" && j.I>0.4 && s.conn==="series" && s.pwr==="on") return {fuse:true,msg:"POP. About 2 A through the mA jack, which is usually fused at 200–400 mA. Big currents go through the 10 A jack."};
   if(s.dial==="ma"&&s.jack!=="ma" || s.dial==="a"&&s.jack!=="a10" || ["dcv","acv","ohm","cont"].includes(s.dial)&&s.jack!=="vo") return {msg:"The meter reads 0 or nonsense. The dial and the red lead's jack don't match. Each dial range only works with its own jack."};
   if(s.conn==="series" && !ammeterJack && s.pwr==="on") return {msg:"Reading: almost the full supply voltage, and the circuit stopped working. In voltage mode the meter has a very high resistance, so putting it in series breaks the circuit."};
   if((s.dial==="ohm"||s.dial==="cont") && s.pwr==="on") return {msg:"The reading jumps around and could damage the meter. Resistance and continuity need the power off, because the meter supplies its own small test current."};
   if(s.pwr==="off" && ["dcv","acv","ma","a"].includes(s.dial)) return {msg:"Reads 0. Nothing is powered, so there's no voltage or current to measure."};
   if(j.kind==="vac"&&s.dial==="dcv") return {msg:"Reads close to 0 V. The DC range averages the AC wave to almost nothing. Use V ~."};
   if(j.kind==="v"&&s.dial==="acv") return {msg:"Reads 0 V or a meaningless number. A battery is DC. Use V ⎓."};
   const w=j.want; if(s.dial===w.dial&&s.jack===w.jack&&s.conn===w.conn&&s.pwr===w.pwr) return {ok:true};
   if(j.kind==="i"&&s.dial==="a"&&j.I<0.1) return {ok:true,soft:"Works, but on the 10 A range 15 mA shows as 0.01 A. The mA range gives a much better reading."};
   if(j.kind==="r"&&s.dial==="cont") return {msg:"It beeps or stays silent, but continuity doesn't give you a value. Use Ω."};
   if(j.kind==="c"&&s.dial==="ohm") return {ok:true,soft:"Works: a good fuse reads near 0 Ω. Continuity mode is quicker because it beeps."};
   return {msg:"That setup doesn't measure what the job asks for. Think about what quantity you need, then where the meter has to sit."};};
  $("#mm-go").addEventListener("click",()=>{const j=JOBS[i]; const s={dial:$("#mm-dial").value,jack:$("#mm-jack").value,conn:$("#mm-conn").value,pwr:$("#mm-pwr").value}; tries++;
   const r=judge(j,s), lcd=$("#mm-lcd"), n=$("#mm-n");
   if(r.fuse){fuses++; $("#mm-f").textContent="Fuses blown "+fuses; lcd.textContent="FUSE"; lcd.className="lcd mono dead"; n.className="note center bad"; n.textContent=r.msg; BC.beep("pop"); BC.badge("fuse"); host.querySelector(".meterBody").classList.add("shake"); setTimeout(()=>host.querySelector(".meterBody")?.classList.remove("shake"),400); return;}
   if(!r.ok){lcd.textContent=s.pwr==="on"&&s.conn==="series"&&s.jack==="vo"?"8.97 V":"0.00"; lcd.className="lcd mono"; n.className="note center warn"; n.textContent=r.msg; BC.beep("bad"); return;}
   const pts=Math.max(1,4-tries); score+=pts; lcd.textContent=j.read; lcd.className="lcd mono good"; n.className="note center good"; n.textContent=(r.soft||"Correct setup.")+` +${pts} points.`; BC.beep("good"); $("#mm-s").textContent="Score "+score;
   setTimeout(()=>{ if(!$("#mm-r")) return; i++; if(i<JOBS.length) show(); else { const h=hi("meter",score); const e=$("#mm-end"); e.hidden=false; e.innerHTML=`<h3>${score} / ${JOBS.length*3} points</h3><p>${fuses?`${fuses} fuse${fuses>1?"s":""} blown along the way.`:"No fuses blown. Safe hands."} ${h.isNew?"New best!":"Best: "+h.best}</p><button class="btn primary" type="button" id="mm-again">Play again</button>`; BC.addXP(score*3,"Meter Madness"); if(!fuses) BC.badge("meter"); if(h.isNew) BC.confetti(); $("#mm-again").addEventListener("click",()=>{i=0;score=0;fuses=0;e.hidden=true;$("#mm-s").textContent="Score 0";$("#mm-f").textContent="Fuses blown 0";show();}); } },1500);});
  show();
 }};
/* ---------- Scope Sleuth ---------- */
G.scope={title:"Scope Sleuth",tag:"oscilloscope",desc:"A mystery signal is on the screen. Turn the knobs, count divisions, and report its frequency and peak-to-peak voltage.",
 art:`<svg viewBox="0 0 120 50" aria-hidden="true"><rect x="10" y="4" width="100" height="42" rx="4" fill="#0b1a12"/><path d="M14 25q8-16 16 0t16 0 16 0 16 0 16 0 16 0" fill="none" stroke="#7CFFB2" stroke-width="2"/></svg>`,
 mount(host){ host.innerHTML=""; BC.mountLab("scope",host); setTimeout(()=>{const b=$("#sc-myst"); if(b) b.click();},50); }};
})();
