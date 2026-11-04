/* Core engine: state, XP, badges, sound, toasts, confetti, plotting, animation loop. */
(function(){
const BC = window.BC = window.BC || {};
const KEY = "ohmly-v1";

/* ---------- state ---------- */
const isO=v=>!!v&&typeof v==="object"&&!Array.isArray(v), isN=v=>typeof v==="number"&&isFinite(v);
const nn=v=>isN(v)&&v>=0?v:undefined, bn=v=>typeof v==="boolean"||isN(v)?v:undefined;
const map=f=>v=>{ if(!isO(v)) return; const o={}; for(const k of Object.keys(v)){ const x=f(v[k]); if(x!==undefined) o[k]=x; } return o; };
const lesson=v=>{ if(!isO(v)) return; const int=x=>Number.isInteger(x)&&x>=0?x:0; return {step:int(v.step),max:int(v.max),done:v.done?1:0,vals:map(nn)(v.vals)||{},pred:map(v=>typeof v==="boolean"?v:undefined)(v.pred)||{}}; };
const FIX={done:map(bn), lessons:map(lesson), quiz:map(v=>map(bn)(v)), lastCh:v=>v===null||isN(v)?v:undefined, xp:nn, badges:map(nn), labs:map(bn), hi:map(nn), cards:map(nn),
  streak:v=>isO(v)?{last:typeof v.last==="string"?v.last:null,n:nn(v.n)||0}:undefined, sound:v=>typeof v==="boolean"?v:undefined, fried:nn, scoped:nn,
  theme:v=>["system","light","dark"].includes(v)?v:undefined, xpDone:map(bn), xpQ:map(bn), xpMax:map(nn), xpOnce:map(bn), xpCard:map(bn), probs:map(bn),
  pxmm:v=>isN(v)&&v>=2&&v<=9?v:undefined};   /* screen scale for the true-size lab, CSS px per mm; absent until calibrated */
BC.defaults = ()=>({done:{}, quiz:{}, lastCh:null, xp:0, badges:{}, labs:{}, hi:{}, cards:{}, streak:{last:null,n:0}, sound:true, fried:0, scoped:0, xpDone:{}, xpQ:{}, xpMax:{}, xpOnce:{}, xpCard:{}, probs:{}, lessons:{}});
/* type-check every field of untrusted state (storage or import) and merge the valid ones into the defaults */
BC.sanitize = o=>{ const r=BC.defaults(); if(isO(o)) for(const k of Object.keys(FIX)){ const v=FIX[k](o[k]); if(v!==undefined) r[k]=v; } return r; };
const S = BC.S = BC.defaults();
try{
  const raw = localStorage.getItem(KEY);
  if(raw) Object.assign(S, BC.sanitize(JSON.parse(raw)));
}catch(e){}
BC.KEY=KEY;
BC.save = () => { try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} };

/* ---------- helpers ---------- */
BC.$ = (s,r=document)=>r.querySelector(s);
BC.$$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
BC.esc = s=>String(s).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
BC.css = n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
BC.clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
BC.rand = (a,b)=>a+Math.random()*(b-a);
BC.pick = arr=>arr[Math.floor(Math.random()*arr.length)];
BC.shuffle = arr=>{const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
BC.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
BC.fmt = function(v,unit,d=3){
  if(!isFinite(v)) return "—";
  const a=Math.abs(v), P=[[1e9,"G"],[1e6,"M"],[1e3,"k"],[1,""],[1e-3,"m"],[1e-6,"µ"],[1e-9,"n"],[1e-12,"p"]];
  if(a===0) return "0 "+unit;
  for(const [m,p] of P){ if(a>=m*0.9995) return (+(v/m).toPrecision(d))+" "+p+unit; }
  return (+(v/1e-12).toPrecision(d))+" p"+unit;
};
BC.E12=[10,12,15,18,22,27,33,39,47,56,68,82];
BC.e12List = (lo,hi)=>{const out=[];for(let d=1;d<=1e7;d*=10)for(const e of BC.E12){const v=e*d/10;if(v>=lo&&v<=hi)out.push(v);}return out;};
BC.e12Up = r=>{ if(!(r>0)) return NaN; const L=BC.e12List(0.1,1e8); return L.find(v=>v>=r*0.999)||L[L.length-1]; };
BC.e12Down = r=>{ if(!(r>0)) return NaN; const L=BC.e12List(0.1,1e8); let b=L[0]; for(const v of L) if(v<=r*1.001) b=v; return b; };
BC.today = ()=>{const d=new Date();return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate();};

/* ---------- canvas helpers ---------- */
BC.fit = function(cv){
  const dpr=window.devicePixelRatio||1, W=cv.clientWidth||300, H=cv.clientHeight||200;
  if(cv.width!==Math.round(W*dpr) || cv.height!==Math.round(H*dpr)){ cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr); }
  const g=cv.getContext("2d"); g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,W,H);
  return {g,W,H};
};
/* plot(canvas, {x:[x0,x1], y:[y0,y1], logx, xt:[[v,label]], yt, series:[{pts,color,width,dash,fill}], marks:[[x,y,label,align]], bands:[[y0,y1,color]] }) */
BC.plot = function(cv,opt){
  const {g,W,H}=BC.fit(cv), css=BC.css;
  const pad={l:opt.padL||48,r:14,t:14,b:28}, w=W-pad.l-pad.r, h=H-pad.t-pad.b;
  const [x0,x1]=opt.x, [y0,y1]=opt.y;
  const X=v=>pad.l+(opt.logx?(Math.log10(v)-Math.log10(x0))/(Math.log10(x1)-Math.log10(x0)):(v-x0)/(x1-x0))*w;
  const Y=v=>pad.t+(1-(v-y0)/(y1-y0))*h;
  g.font="11px 'IBM Plex Mono', monospace"; g.lineWidth=1;
  (opt.bands||[]).forEach(b=>{g.fillStyle=css(b[2]);g.globalAlpha=.14;g.fillRect(pad.l,Y(b[1]),w,Y(b[0])-Y(b[1]));g.globalAlpha=1;});
  g.strokeStyle=css("--line"); g.fillStyle=css("--muted");
  (opt.xt||[]).forEach(t=>{g.beginPath();g.moveTo(X(t[0]),pad.t);g.lineTo(X(t[0]),pad.t+h);g.stroke(); g.textAlign="center"; g.fillText(t[1],X(t[0]),H-9);});
  (opt.yt||[]).forEach(t=>{g.beginPath();g.moveTo(pad.l,Y(t[0]));g.lineTo(pad.l+w,Y(t[0]));g.stroke(); g.textAlign="right"; g.fillText(t[1],pad.l-6,Y(t[0])+4);});
  g.save(); g.beginPath(); g.rect(pad.l,pad.t-2,w,h+4); g.clip();
  (opt.series||[]).forEach(s=>{
    const col=css(s.color||"--trace");
    if(s.fill){ g.beginPath(); s.pts.forEach((p,i)=>{const px=X(p[0]),py=Y(p[1]); i?g.lineTo(px,py):g.moveTo(px,py);}); g.lineTo(X(s.pts[s.pts.length-1][0]),Y(Math.max(y0,0))); g.lineTo(X(s.pts[0][0]),Y(Math.max(y0,0))); g.closePath(); g.fillStyle=col; g.globalAlpha=.12; g.fill(); g.globalAlpha=1; }
    g.strokeStyle=col; g.lineWidth=s.width||2; g.setLineDash(s.dash||[]); g.beginPath();
    s.pts.forEach((p,i)=>{const px=X(p[0]),py=Y(BC.clamp(p[1],y0-(y1-y0),y1+(y1-y0))); i?g.lineTo(px,py):g.moveTo(px,py);}); g.stroke(); g.setLineDash([]);
  });
  g.restore();
  (opt.marks||[]).forEach(m=>{g.fillStyle=css(m[4]||"--accent"); g.beginPath(); g.arc(X(m[0]),Y(m[1]),4.5,0,7); g.fill(); if(m[2]){g.fillStyle=css("--ink"); g.textAlign=m[3]||"left"; g.fillText(m[2],X(m[0])+(m[3]==="right"?-8:8),Y(m[1])-8);} });
  (opt.legend||[]).forEach((l,i)=>{g.fillStyle=css(l[1]); g.fillRect(pad.l+10+i*120,pad.t+6,14,3); g.fillStyle=css("--muted"); g.textAlign="left"; g.fillText(l[0],pad.l+28+i*120,pad.t+10);});
  return {X,Y,g,W,H,pad};
};

/* ---------- animation loop (per view) ---------- */
/* live(): optional; under reduced motion the loop only runs while some anim reports live (user-started motion), else one static frame per BC.redraw() */
const anims=new Map(); let last=0, running=false;
const go=()=>{ if(!running){running=true; last=performance.now(); requestAnimationFrame(tick);} };
const runAll=(dt,t)=>anims.forEach((live,fn)=>{ try{ fn(dt,t/1000); }catch(e){ console.error(e); anims.delete(fn);} });
BC.anim = (fn,live)=>{anims.set(fn,live); if(BC.reduced) BC.redraw(); else go(); return ()=>anims.delete(fn);};
BC.clearAnims = ()=>anims.clear();
BC.redraw = ()=>{ if(!BC.reduced) return; requestAnimationFrame(t=>{ runAll(0,t); if([...anims.values()].some(l=>l&&l())) go(); }); };
function tick(t){
  const dt=Math.min(0.05,(t-last)/1000); last=t; runAll(dt,t);
  if(BC.reduced?[...anims.values()].some(l=>l&&l()):anims.size) requestAnimationFrame(tick); else running=false;
}

/* ---------- sound ---------- */
let AC=null;
BC.audio = ()=>{ if(!S.sound){ BC.toast("Sound is off. Turn it on with the speaker button."); return null; } if(!AC){ try{ AC=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return null; } } if(AC.state==="suspended") AC.resume(); return AC; };
BC.beep = function(kind){
  if(!S.sound) return; const ac=BC.audio(); if(!ac) return;
  const seq={good:[[660,.07],[990,.12]],bad:[[220,.16]],xp:[[880,.05]],level:[[523,.09],[659,.09],[784,.09],[1047,.2]],click:[[1400,.02]],pop:[[90,.25]]}[kind]||[[600,.05]];
  let t=ac.currentTime;
  seq.forEach(([f,d])=>{const o=ac.createOscillator(),g=ac.createGain(); o.type=kind==="bad"||kind==="pop"?"sawtooth":"triangle"; o.frequency.value=f;
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.12,t+0.01); g.gain.exponentialRampToValueAtTime(0.0001,t+d);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t+d+0.02); t+=d*0.9;});
};

/* ---------- toasts ---------- */
BC.toast = function(html,kind){
  const host=BC.$("#toasts"); if(!host) return;
  const d=document.createElement("div"); d.className="toast "+(kind||""); d.innerHTML=html; host.appendChild(d);
  setTimeout(()=>d.classList.add("out"),2600); setTimeout(()=>d.remove(),3100);
};

/* ---------- confetti ---------- */
const parts=[];
BC.confetti = function(x,y,n=90){
  if(BC.reduced) return;
  const cv=BC.$("#fx"); if(!cv) return;
  const cols=["--trace","--accent","--warn","--good","--ink"].map(BC.css);
  x = x ?? innerWidth/2; y = y ?? innerHeight/3;
  for(let i=0;i<n;i++){const a=BC.rand(0,Math.PI*2),s=BC.rand(150,520); parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-260,r:BC.rand(3,7),c:BC.pick(cols),life:BC.rand(1.2,2.2),rot:BC.rand(0,6),vr:BC.rand(-10,10),shape:Math.random()<.5});}
  if(!fxRunning){fxRunning=true; fxLast=performance.now(); requestAnimationFrame(fxTick);}
};
let fxRunning=false, fxLast=0;
function fxTick(t){
  const cv=BC.$("#fx"), dt=Math.min(.05,(t-fxLast)/1000); fxLast=t;
  const {g}=BC.fit(cv);
  for(let i=parts.length-1;i>=0;i--){const p=parts[i]; p.vy+=900*dt; p.vx*=.99; p.x+=p.vx*dt; p.y+=p.vy*dt; p.rot+=p.vr*dt; p.life-=dt;
    if(p.life<=0||p.y>innerHeight+20){parts.splice(i,1);continue;}
    g.save(); g.translate(p.x,p.y); g.rotate(p.rot); g.globalAlpha=Math.min(1,p.life*1.5); g.fillStyle=p.c;
    if(p.shape) g.fillRect(-p.r,-p.r/2,p.r*2,p.r); else {g.beginPath(); g.arc(0,0,p.r*.6,0,7); g.fill();} g.restore();}
  if(parts.length) requestAnimationFrame(fxTick); else { fxRunning=false; BC.fit(cv); }
}

/* ---------- XP, levels, badges ---------- */
BC.LEVELS=[[0,"Spark"],[100,"Apprentice"],[250,"Breadboarder"],[450,"Solder Jockey"],[700,"Tinkerer"],[1000,"Circuit Wrangler"],[1400,"Engineer"],[1900,"Inventor"],[2600,"Mad Scientist"]];
BC.level = xp=>{let i=0; BC.LEVELS.forEach((l,k)=>{if(xp>=l[0]) i=k;}); const cur=BC.LEVELS[i], nxt=BC.LEVELS[i+1]; return {i,name:cur[1],from:cur[0],to:nxt?nxt[0]:cur[0],next:nxt?nxt[1]:null};};
BC.once = (key,n,why)=>{ if(S.xpOnce[key]) return; S.xpOnce[key]=1; BC.addXP(n,why); };
/* games: pay only the gain over the best XP this key has paid, so replays can't farm */
BC.xpBest = (key,n,why)=>{ const g=n-(S.xpMax[key]||0); if(g>0){ S.xpMax[key]=n; BC.addXP(g,why); } };
BC.addXP = function(n,why){
  const before=BC.level(S.xp).i; S.xp+=n; BC.save();
  BC.toast(`<b class="mono">+${n} XP</b> ${BC.esc(why||"")}`,"xp");
  const L=BC.level(S.xp);
  if(L.i>before){ setTimeout(()=>{BC.beep("level"); BC.confetti(); BC.toast(`<b>Level up!</b> You are now a <b>${L.name}</b>.`,"level");},300); }
  BC.onXP && BC.onXP();
};
BC.BADGES={
  "first-light":["First Light","Answer your first quiz question correctly."],
  "flawless":["Flawless","Get every question right in a module quiz."],
  "knob":["Knob Twiddler","Play with 5 different labs."],
  "labrat":["Lab Rat","Play with 20 different labs."],
  "roll":["On a Roll","Finish 3 modules."],
  "half":["Halfway There","Finish half the modules."],
  "graduate":["Graduate","Finish every module."],
  "smoke":["Magic Smoke","Fry an LED. Everyone does it once."],
  "probe":["Probed","Solve a mystery signal on the oscilloscope."],
  "rainbow":["Color Savant","Score 15+ in Color Code Rush."],
  "divider":["Divide & Conquer","Average under 2% error in Divider Designer."],
  "detective":["Gate Detective","Identify 6 mystery gates in one game."],
  "habit":["Habit Forming","Study on 3 days in a row."],
  "cards":["Card Shark","Move 10 flashcards to the top box."],
  "roulette":["Lucky Streak","Answer 8 in a row in Pop Quiz Roulette."],
  "fuse":["Pop Goes the Fuse","Blow a multimeter fuse in Meter Madness."],
  "meter":["Safe Hands","Finish Meter Madness without blowing a fuse."]
};
BC.badge = function(id){
  if(S.badges[id]) return; S.badges[id]=Date.now(); BC.save();
  const b=BC.BADGES[id]; BC.beep("level"); BC.confetti(innerWidth-120, innerHeight-80, 60);
  BC.toast(`<b>Badge unlocked: ${BC.esc(b[0])}</b><br><span>${BC.esc(b[1])}</span>`,"badge");
};
BC.touchLab = function(id){
  if(S.labs[id]) return; S.labs[id]=1; BC.save(); BC.addXP(5,"new lab explored");
  const n=Object.keys(S.labs).length; if(n>=5) BC.badge("knob"); if(n>=20) BC.badge("labrat");
};
BC.tickStreak = function(){
  const t=BC.today(); if(S.streak.last===t) return;
  const y=new Date(); y.setDate(y.getDate()-1); const ys=y.getFullYear()+"-"+(y.getMonth()+1)+"-"+y.getDate();
  S.streak.n = S.streak.last===ys ? S.streak.n+1 : 1; S.streak.last=t; BC.save();
  if(S.streak.n>=3) BC.badge("habit");
};
})();
