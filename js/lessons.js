/* Lessons: short do-it-first sequences around one live circuit.
   Three layers, top of file to bottom:
   1. Terrain: draws any circuit description as an isometric landscape where height is node voltage, and morphs it flat into a schematic.
   2. The engine: one step at a time (do, hit, predict, probe), fixed layout, saved progress, XP once.
   3. BC.LESSONS: lesson data keyed by module number. */
(function(){
const BC=window.BC, {$,$$,esc,S,css,clamp,fmt}=BC, {txt}=BC.draw;

/* ---------- circuit description ----------
   {gnd:"g", vmax:18, iref:.06, pref?:W, rspan?:[lo,hi], nodes:{id:{at:[u,v], flat:[u,v]?, pad?, tag?, gauge?, was?}}, edges:[{id,t,a,b,...}], walk?:{path,t}}
   at is the plan position; flat overrides it in the schematic. An edge may add via:[[u,v,fu?,fv?]...], label (printed on the floor), lab:[du,dv], labf:[dx,dy], tag (floats above its b node), tagOff:[dx,dy], ghost (not connected yet: a dashed outline on the floor that rises when it connects).
   Height is node voltage on one scale, vmax = the full height of the frame. Add a part by adding one entry to TYPES: g(e) is its conductance (0 = open), solid(c) adds its blocks to the landscape, symbol(c) paints the schematic.
   Parts with memory are companion models: g(e,h) and j(e,h) give a conductance and an injected current for a time step h. A solve with no step reads the circuit at this instant, so a capacitor holds its level (e.v0) and an inductor holds its current (e.i0). timeStep advances them; commit(e,v,I) stores the new state. flip(e,v,I) lets a part change state until the solution agrees with it. */
const WIRE_G=1e5;   /* 10 µΩ: wires drop next to nothing, and their current stays known */
const HOLD_H=1e-9;   /* the step of an instantaneous solve */
const TYPES={
  /* leaks a stray source in through G, drawn as nothing */
  stray:{g:e=>e.G,j:e=>e.G*e.V,solid:()=>{},symbol:()=>{}},
  wire:{g:e=>e.ghost?0:WIRE_G, solid:c=>c.run({hw:c.e.hw}), symbol:c=>c.line()},
  resistor:{g:e=>e.open||e.ghost?0:1/e.R, solid:solidResistor, symbol:symResistor},
  switch:{g:e=>e.closed?WIRE_G:e.Roff?1/e.Roff:0, solid:solidSwitch, symbol:symSwitch},
  fuse:{g:e=>e.blown?0:WIRE_G, solid:solidFuse, symbol:symFuse},
  source:{solid:solidSource, symbol:symSource},
  capacitor:{tall:true, g:(e,h)=>e.C/h, j:(e,h)=>-e.C/h*(e.v0||0), commit:(e,v)=>{ e.v0=v[e.a]-v[e.b]; }, solid:c=>c.tank(), symbol:symCap},
  inductor:{g:(e,h)=>h/e.L, j:e=>e.i0||0, commit:(e,v,I)=>{ e.i0=I[e.id]; }, solid:c=>c.wheel(), symbol:symCoil},
  /* an ideal drop Vf in series with Ron when on; open when off. A part with Vz also breaks down in reverse (on === "z") and holds Vz. dead = burnt open. */
  diode:{hot:1, g:e=>!e.ghost&&!e.dead&&e.on?1/e.Ron:0, j:e=>e.ghost||e.dead||!e.on?0:e.on==="z"?e.Vz/e.Ron:-e.Vf/e.Ron,
    flip:(e,v,I)=>{ if(e.ghost||e.dead) return false; const vd=v[e.a]-v[e.b], was=e.on||false; let on=false;
      if(was===true) on=I[e.id]>0; else if(was==="z") on=I[e.id]<0?"z":false; else if(vd>e.Vf) on=true; else if(e.Vz&&vd<-e.Vz) on="z";
      if(on===was) return false; e.on=on; return true; }, solid:solidDiode, symbol:symDiode, light:e=>e.col?{c:e.col,k:e.k}:null},
  /* an NPN-style gate on the slope: the base current (the flow in edge e.base) sets Ic = hFE x Ib until the gate is wide open (sat) */
  bjt:{hot:1, ctl:1, g:e=>e.sat?1/e.Rsat:0, j:e=>e.sat?-e.Vsat/e.Rsat:(e.Ic||0),
    flip:(e,v,I)=>{ const ic=e.hFE*Math.max(0,I[e.base]); if(Math.abs(ic-(e.Ic||0))>1e-9){ e.Ic=ic; return true; }
      if(!e.sat){ if(ic>0&&v[e.a]-v[e.b]<e.Vsat){ e.sat=true; return true; } return false; }
      if(I[e.id]>ic){ e.sat=false; return true; } return false; },
    gate:(e,I)=>clamp(Math.abs(I)/e.Imax,0,1), solid:solidGate, symbol:symBjt},
  /* a gate by height alone: off below Vth, then a current source k(Vgs-Vth)^2 that falls into a plain channel (2k(Vgs-Vth) siemens) */
  mosfet:{hot:1, ctl:1, g:e=>e.m==="tri"?e.Gon:0, j:e=>e.m==="act"?e.Ic:0,
    flip:(e,v)=>{ const vov=v[e.ctl]-v[e.b]-e.Vth; let m="off", ic=0, gon=0; if(vov>0){ ic=e.k*vov*vov; gon=2*e.k*vov; m=v[e.a]-v[e.b]<vov?"tri":"act"; }
      const ch=m!==e.m||Math.abs(ic-(e.Ic||0))>1e-9; e.m=m; e.Ic=ic; e.Gon=gon; return ch; },
    gate:(e,I)=>clamp(Math.abs(I)/e.Imax,0,1), solid:solidGate, symbol:symMos}
};
/* modified nodal analysis; a tiny leak to ground puts floating nodes on the floor */
function solve(d){
  const flips=d.edges.filter(e=>TYPES[e.t].flip); let r=solveOnce(d);
  for(let k=0;k<8&&flips.length;k++){ let changed=false; flips.forEach(e=>{ if(TYPES[e.t].flip(e,r.v,r.I)) changed=true; }); if(!changed) break; r=solveOnce(d); }
  return r;
}
/* advance the parts with memory by run seconds, in steps of at most hmax (backward Euler) */
function timeStep(d,run,hmax,cap=16){
  const n=clamp(Math.ceil(run/hmax),1,cap), mem=d.edges.filter(e=>TYPES[e.t].commit); d.h=run/n; let o=null;
  for(let i=0;i<n;i++){ o=solve(d); mem.forEach(e=>TYPES[e.t].commit(e,o.v,o.I)); }
  d.h=0; return o;
}
function solveOnce(d){
  const h=d.h||HOLD_H, ids=Object.keys(d.nodes).filter(k=>k!==d.gnd), ix={}; ids.forEach((k,i)=>ix[k]=i);
  const srcs=d.edges.filter(e=>e.t==="source"), n=ids.length, N=n+srcs.length;
  const A=Array.from({length:N},()=>new Array(N+1).fill(0));
  for(let i=0;i<n;i++) A[i][i]=1e-12;
  const gs={}, js={};
  d.edges.forEach(e=>{ if(e.t==="source") return; const P=TYPES[e.t], g=gs[e.id]=P.g(e,h), j=js[e.id]=P.j?P.j(e,h):0, a=ix[e.a], b=ix[e.b];
    if(j){ if(a!==undefined) A[a][N]-=j; if(b!==undefined) A[b][N]+=j; } if(!g) return;
    if(a!==undefined) A[a][a]+=g; if(b!==undefined) A[b][b]+=g; if(a!==undefined&&b!==undefined){ A[a][b]-=g; A[b][a]-=g; } });
  srcs.forEach((e,j)=>{ const r=n+j, a=ix[e.a], b=ix[e.b];
    if(a!==undefined){ A[a][r]+=1; A[r][a]-=1; } if(b!==undefined){ A[b][r]-=1; A[r][b]+=1; } A[r][N]=e.V; });
  for(let c=0;c<N;c++){ let p=c; for(let r=c+1;r<N;r++) if(Math.abs(A[r][c])>Math.abs(A[p][c])) p=r; [A[c],A[p]]=[A[p],A[c]];
    const q=A[c][c]; if(!q) continue; for(let r=0;r<N;r++){ if(r===c) continue; const f=A[r][c]/q; if(f) for(let k=c;k<=N;k++) A[r][k]-=f*A[c][k]; } }
  const x=A.map((row,i)=>row[i]?row[N]/row[i]:0), v={[d.gnd]:0}; ids.forEach((k,i)=>v[k]=x[i]);
  const I={}; d.edges.forEach(e=>{ I[e.id]=e.t==="source"?x[n+srcs.indexOf(e)]:(v[e.a]-v[e.b])*gs[e.id]+js[e.id]; });
  return {v,I};
}
/* a walk along a node path: where it is at t in 0..1, and the rises and falls so far. Lifts count as distance so the climb takes slider travel. */
function walkAt(d,v,w){
  const P=w.path, seg=[]; let L=0;
  for(let i=0;i<P.length-1;i++){ const a=d.nodes[P[i]].at, b=d.nodes[P[i+1]].at, dz=(v[P[i+1]]||0)-(v[P[i]]||0), l=Math.hypot(a[0]-b[0],a[1]-b[1])||Math.abs(dz)/(d.vmax||1)*.9+.05; seg.push({a,b,za:v[P[i]]||0,dz,l}); L+=l; }
  let r=clamp(w.t,0,1)*L, up=0, down=0, at=null;
  for(const s of seg){ const f=at?0:Math.min(1,r/s.l); if(f>0){ if(s.dz>0) up+=s.dz*f; else down-=s.dz*f; } if(!at&&r<=s.l){ at={u:s.a[0]+(s.b[0]-s.a[0])*f,v:s.a[1]+(s.b[1]-s.a[1])*f,z:s.za+s.dz*f}; } r-=s.l; }
  if(!at){ const e=seg[seg.length-1]; at={u:e.b[0],v:e.b[1],z:e.za+e.dz}; }
  return {...at,up,down};
}

/* ---------- colour ---------- */
const hex=s=>{ s=s.replace("#",""); if(s.length===3) s=s.replace(/./g,"$&$&"); return [parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)]; };
const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const rgb=(c,al)=>al===undefined?`rgb(${c[0]|0},${c[1]|0},${c[2]|0})`:`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${al})`;
let PAL=null, palKey="";
function pal(){
  const key=(document.documentElement.getAttribute("data-theme")||"")+matchMedia("(prefers-color-scheme: dark)").matches;
  if(key===palKey) return PAL; palKey=key;
  const cs=getComputedStyle(document.documentElement), h=n=>hex(cs.getPropertyValue(n).trim());
  PAL={key,dark:cs.getPropertyValue("--t-dark").trim()==="1",floor:h("--t-floor"),floor2:h("--t-floor2"),grid:h("--t-grid"),slabU:h("--t-slabu"),slabV:h("--t-slabv"),top:h("--t-top"),u:h("--t-u"),v:h("--t-v"),edge:h("--t-edge"),rampT:h("--t-rampt"),rampU:h("--t-rampu"),rampV:h("--t-rampv"),rib:h("--t-rib"),shadow:h("--t-shadow"),towT:h("--t-towt"),towU:h("--t-towu"),towV:h("--t-towv"),towE:h("--t-towe"),hot:h("--t-hot"),char:h("--t-char"),accent:h("--accent"),ink:h("--ink"),bg:h("--bg"),muted:h("--muted"),line:h("--line")};
  ["accent","ink","bg","muted","line"].forEach(k=>PAL[k+"S"]=rgb(PAL[k]));
  return PAL;
}
/* incandescence: neutral, through the accent, to white-hot past the limit */
const glow=(base,i)=>{ const p=PAL; return i<=1?mix(base,p.accent,i):mix(p.accent,p.hot,Math.min(1,i-1)); };

/* ---------- the parts ---------- */
const HW=.078;   /* half-width of a ledge, in plan units */
function solidResistor(c){
  const {e}=c;
  if(e.open){ const o={style:"ramp",hw:c.chute}; c.stub(0,.34,o); c.stub(.34,.4,{...o,char:1}); c.stub(.6,.66,{...o,char:1}); c.stub(.66,1,o); return; }
  c.run({style:"ramp",hw:c.chute,heat:c.glow,ribs:!e.inner,after:e.inner?c.stream:null});
}
function solidSwitch(c){
  c.stub(0,.28); c.stub(.72,1);
  c.plank(.28,.72,c.swing);
}
function solidFuse(c){
  if(c.e.blown){ c.stub(0,.26); c.stub(.26,.36,{char:1}); c.stub(.64,.74,{char:1}); c.stub(.74,1); return; }
  c.run(); c.capsule(.2,.8);
}
function solidSource(c){ c.tower(); }
/* a gate on the slope: stubs at each level and a blade that lifts as the gate opens; the glow is its own heat */
function solidGate(c){ const o={heat:c.glow*.9}; c.stub(0,.28,o); c.stub(.72,1,o); c.plank(.28,.72,c.swing,c.glow*.9); }
function symBjt(c){
  const {g,p}=c, a=p[0], b=p[p.length-1], x=(a[0]+b[0])/2, y=(a[1]+b[1])/2, r=16, ux=(b[0]-a[0]), uy=(b[1]-a[1]), an=Math.atan2(uy,ux)-Math.PI/2, P=PAL;
  g.strokeStyle=P.inkS; g.lineWidth=2.5; g.lineJoin="round"; g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.stroke();
  g.save(); g.translate(x,y); g.rotate(an); g.fillStyle=P.bgS; g.beginPath(); g.arc(0,0,r,0,7); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(-7,-9); g.lineTo(-7,9); g.moveTo(-7,-4); g.lineTo(0,-11); g.moveTo(-7,4); g.lineTo(0,11); g.stroke();
  g.fillStyle=P.inkS; g.beginPath(); g.moveTo(0,11); g.lineTo(-6,9.5); g.lineTo(-2,5.5); g.closePath(); g.fill(); g.restore();
}
function symMos(c){
  const {g,p}=c, a=p[0], b=p[p.length-1], x=(a[0]+b[0])/2, y=(a[1]+b[1])/2, an=Math.atan2(b[1]-a[1],b[0]-a[0])-Math.PI/2, P=PAL;
  g.strokeStyle=P.inkS; g.lineWidth=2.5; g.lineJoin="round"; g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.stroke();
  g.save(); g.translate(x,y); g.rotate(an); g.fillStyle=P.bgS; g.fillRect(-14,-15,22,30); g.beginPath(); g.moveTo(-9,-10); g.lineTo(-9,10); g.moveTo(-3,-10); g.lineTo(-3,-6); g.moveTo(-3,-3); g.lineTo(-3,3); g.moveTo(-3,6); g.lineTo(-3,10); g.moveTo(-3,-8); g.lineTo(0,-8); g.moveTo(-3,8); g.lineTo(0,8); g.moveTo(-3,0); g.lineTo(0,0); g.stroke(); g.restore();
}
function solidDiode(c){ c.run({hw:c.e.hw||HW*.62}); c.chevron(); }
function symCap(c){
  const {g,p}=c, a=p[0], b=p[p.length-1], x=(a[0]+b[0])/2, y=(a[1]+b[1])/2, P=PAL;
  g.strokeStyle=P.inkS; g.lineWidth=2.5; g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(x,y-5); g.moveTo(x,y+5); g.lineTo(b[0],b[1]); g.moveTo(x-16,y-5); g.lineTo(x+16,y-5); g.moveTo(x-16,y+5); g.lineTo(x+16,y+5); g.stroke();
  if(c.e.capLabel){ g.font=`600 13px ${c.font}`; g.textAlign="right"; g.fillStyle=P.mutedS; g.fillText(c.e.capLabel,x-24,y+4); }
}
function symCoil(c){
  const {g,p}=c, a=p[0], b=p[p.length-1], dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy)||1, ux=dx/L, uy=dy/L, n=4, r=Math.min(11,L/(2*n+2)), an=Math.atan2(dy,dx);
  g.strokeStyle=PAL.inkS; g.lineWidth=2.5; g.beginPath(); g.moveTo(a[0],a[1]); const s=L/2-n*r; g.lineTo(a[0]+ux*s,a[1]+uy*s); for(let i=0;i<n;i++){ const t=s+r*(2*i+1); g.arc(a[0]+ux*t,a[1]+uy*t,r,an+Math.PI,an+2*Math.PI); } g.lineTo(b[0],b[1]); g.stroke();
}
function symDiode(c){
  const {g,p}=c, P=PAL; let a=p[0], b=p[1], best=0; for(let i=0;i<p.length-1;i++){ const l=Math.hypot(p[i][0]-p[i+1][0],p[i][1]-p[i+1][1]); if(l>best){ best=l; a=p[i]; b=p[i+1]; } }
  g.strokeStyle=P.inkS; g.lineWidth=2.5; g.lineJoin="round"; g.beginPath(); p.forEach((q,i)=>i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1])); g.stroke();
  const x=(a[0]+b[0])/2, y=(a[1]+b[1])/2, an=Math.atan2(b[1]-a[1],b[0]-a[0]), s=9; g.save(); g.translate(x,y); g.rotate(an); g.fillStyle=P.bgS; g.fillRect(-s-2,-s-1,2*s+4,2*s+2); g.fillStyle=P.inkS; g.beginPath(); g.moveTo(-s,-s); g.lineTo(s,0); g.lineTo(-s,s); g.closePath(); g.fill(); g.beginPath(); g.moveTo(s,-s); g.lineTo(s,s); if(c.e.Vz){ g.moveTo(s,-s); g.lineTo(s-4,-s-3.5); g.moveTo(s,s); g.lineTo(s+4,s+3.5); } g.stroke();
  if(c.e.col){ g.lineWidth=2; [-3,5].forEach(o=>{ g.beginPath(); g.moveTo(o,-s-5); g.lineTo(o+9,-s-14); g.moveTo(o+9,-s-14); g.lineTo(o+3.5,-s-13.5); g.moveTo(o+9,-s-14); g.lineTo(o+8.5,-s-8.5); g.stroke(); }); } g.restore();
}
function symResistor(c){
  const {g,e,p}=c, a=p[0], b=p[p.length-1], P=PAL;
  if(e.inner) return;
  const col=e.open?P.mutedS:c.glow>.12?rgb(glow(P.ink,c.glow)):P.inkS, n=clamp(Math.round(Math.log10(e.R)*2.2),3,9), amp=7;
  g.strokeStyle=col; g.lineWidth=2.5; g.lineJoin="round";
  const dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy)||1, nx=-dy/L, ny=dx/L;
  if(e.open){ g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(a[0]+dx*.36,a[1]+dy*.36); g.moveTo(a[0]+dx*.64,a[1]+dy*.64); g.lineTo(b[0],b[1]); g.stroke(); return; }
  const N=n*2, lead=.2; g.beginPath(); g.moveTo(a[0],a[1]);
  for(let i=0;i<=N;i++){ const t=lead+(1-2*lead)*i/N, o=(i===0||i===N)?0:(i%2?amp:-amp); g.lineTo(a[0]+dx*t+nx*o,a[1]+dy*t+ny*o); }
  g.lineTo(b[0],b[1]); g.stroke();
}
function terminal(g,x,y){ g.beginPath(); g.arc(x,y,3,0,7); g.fillStyle=PAL.bgS; g.fill(); g.lineWidth=1.5; g.strokeStyle=PAL.inkS; g.stroke(); }
function symSwitch(c){
  const {g,e,p}=c, a=p[0], b=p[p.length-1], dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy)||1, an=c.swing*.6;
  g.strokeStyle=PAL.inkS; g.lineWidth=2.5; g.beginPath(); g.moveTo(a[0],a[1]);
  const cs=Math.cos(an), sn=Math.sin(an), ux=dx/L, uy=dy/L; g.lineTo(a[0]+(ux*cs-uy*sn)*L,a[1]+(uy*cs+ux*sn)*L); g.stroke();
  terminal(g,a[0],a[1]); terminal(g,b[0],b[1]);
}
function symFuse(c){
  const {g,e,p}=c, a=p[0], b=p[p.length-1], dx=b[0]-a[0], dy=b[1]-a[1], P=PAL;
  g.strokeStyle=P.inkS; g.lineWidth=2.5;
  if(e.blown){ g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(a[0]+dx*.36,a[1]+dy*.36); g.moveTo(a[0]+dx*.64,a[1]+dy*.64); g.lineTo(b[0],b[1]); g.stroke(); return; }
  g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.stroke();
  g.save(); g.translate((a[0]+b[0])/2,(a[1]+b[1])/2); g.rotate(Math.atan2(dy,dx)); const hw=Math.hypot(dx,dy)*.34; g.lineWidth=1.5; g.fillStyle=P.bgS; g.beginPath(); g.rect(-hw,-5,hw*2,10); g.fill(); g.stroke(); g.restore();
}
function symSource(c){
  const {g,p}=c, a=p[0], b=p[p.length-1], x=(a[0]+b[0])/2, y=(a[1]+b[1])/2, P=PAL;
  g.strokeStyle=P.inkS; g.lineWidth=2.5; g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(x,y+6); g.moveTo(x,y-6); g.lineTo(b[0],b[1]); g.stroke();
  g.fillStyle=P.bgS; g.fillRect(x-20,y-5,40,10); g.lineWidth=3; g.beginPath(); g.moveTo(x-16,y-6); g.lineTo(x+16,y-6); g.stroke(); g.lineWidth=5; g.beginPath(); g.moveTo(x-8,y+6); g.lineTo(x+8,y+6); g.stroke();
}

/* ---------- Terrain: the live picture ---------- */
let viewPref="height";   /* survives step and page changes */
function Terrain(stage){
  const cv=document.createElement("canvas"); cv.className="lsCv"; cv.setAttribute("role","img"); stage.appendChild(cv);
  const shadowCv=document.createElement("canvas"), floorCv=document.createElement("canvas"), wallCv=document.createElement("canvas");
  const T={cv,desc:null,sol:null,zs:{},zv:{},heat:{},flow:{},phi:{},pres:{},swing:{},m:viewPref==="height"?0:1,leads:[],smoke:[],sparks:[],rings:[],pts:[],hot:null,ring:null,flash:0,shake:0,clock:0,prev:{},spin:{},gripEls:[],vm:null,plume:null};
  let geo=null, floorKey="", wallKey="", order=null, orderKey="", layout=null, layoutKey="", dprNow=1;
  const smooth=x=>x*x*(3-2*x);
  /* the view: the floor gets a bit over half the frame, and heights get what is left above the back corner, one scale for the whole frame */
  function fit(W,H){
    const D=T.desc; let U=0,V=0; Object.values(D.nodes).forEach(n=>{ U=Math.max(U,n.at[0]); V=Math.max(V,n.at[1]); });
    const E=.18, k=.3, c=.866, pad=6, span=U+V+2*E, slab=clamp(H*.022,5,13), room=34;
    const sc=Math.min((W-2*pad)/((U+V+4*E)*c),(H*.5)/(span*k));
    /* the frame's scale eases when a circuit asks for a new one; nothing but heights depends on it */
    const vm=T.vm||D.vmax||18; let oy=H-pad-slab-(U+V+2*E)*sc*k, hs=(oy-room-pad)/vm; const cap=sc*.105*18/vm;
    if(hs>cap){ oy-=(hs-cap)*vm*.42; hs=cap; }
    geo={W,H,U,V,E,k,c,sc,oy,hs,slab,ox:W/2-(U-V)*sc*c/2,flatM:[Math.max(44,W*.11),60,Math.max(30,W*.08),40]};
  }
  const iso=(u,v,z)=>[geo.ox+(u-v)*geo.sc*geo.c, geo.oy+(u+v)*geo.sc*geo.k-z*geo.hs];
  const flat=(fu,fv)=>[geo.flatM[0]+fu/geo.U*(geo.W-geo.flatM[0]-geo.flatM[2]), geo.flatM[1]+fv/geo.V*(geo.H-geo.flatM[1]-geo.flatM[3])];
  const nodeF=n=>n.flat||n.at;
  const fromN=(n,z)=>({u:n.at[0],v:n.at[1],fu:nodeF(n)[0],fv:nodeF(n)[1],z});
  const lerpP=(A,B,t)=>({u:A.u+(B.u-A.u)*t,v:A.v+(B.v-A.v)*t,z:A.z+(B.z-A.z)*t,fu:A.fu+(B.fu-A.fu)*t,fv:A.fv+(B.fv-A.fv)*t});
  T.project=(pt,m)=>{ const a=iso(pt.u,pt.v,pt.z); if(m<=0) return a; const b=flat(pt.fu,pt.fv); return [a[0]+(b[0]-a[0])*m,a[1]+(b[1]-a[1])*m]; };
  T.nodeAt=(id,m=smooth(T.m))=>T.project(fromN(T.desc.nodes[id],T.zs[id]||0),m);
  T.set=desc=>{ T.desc=desc; T.sol=solve(desc); if(T.vm===null||!desc.live) T.vm=desc.vmax||18; if(BC.reduced||!Object.keys(T.zs).length) settle();
    desc.edges.forEach(e=>{ if(e.t==="switch"){ const was=T.prev[e.id]; if(was===false&&e.closed&&!BC.reduced) T.rings.push({a:e.a,b:e.b,t:0,dur:.45,r:.34}); T.prev[e.id]=!!e.closed; } });
    return T.sol; };
  const swing0=e=>{ const P=TYPES[e.t]; return P.gate?1-P.gate(e,T.sol.I[e.id]||0):e.closed?0:1; };
  const settle=()=>{ const D=T.desc; T.vm=D.vmax||18; for(const k in T.sol.v){ T.zs[k]=D.clip?Math.max(0,T.sol.v[k]):T.sol.v[k]; T.zv[k]=0; } for(const e of D.edges){ T.heat[e.id]=heatTarget(e); T.flow[e.id]=Math.abs(T.sol.I[e.id]||0); T.pres[e.id]=e.ghost?0:1; T.swing[e.id]=swing0(e); } };
  const heatTarget=e=>{ if(e.open||e.ghost||e.dead) return 0; const I=T.sol.I[e.id]; if(e.t==="resistor") return I*I*e.R/(e.rating||T.desc.pref||2); if(TYPES[e.t].hot){ const v=T.sol.v; return Math.abs(I*(v[e.a]-v[e.b]))/(e.rating||T.desc.pref||2); } return 0; };
  /* everything comes up out of the floor when the picture first appears */
  T.rise=()=>{ if(!BC.reduced) T.pres={}; };
  T.setView=v=>{ viewPref=v; T.target=v==="height"?0:1; if(BC.reduced) T.m=T.target; };
  T.target=T.m;
  T.moving=()=>T.m!==T.target||T.shake>0||T.flash>0;
  /* a part failing: flash, shock ring, sparks, smoke, a kick to the frame */
  T.burst=(id,noSmoke)=>{ const e=T.desc.edges.find(x=>x.id===id); if(!e||BC.reduced) return; const a=T.nodeAt(e.a), b=T.nodeAt(e.b), x=(a[0]+b[0])/2, y=(a[1]+b[1])/2;
    if(!noSmoke){ T.plume={x,y:y-4,age:0,spread:Math.min(46,Math.abs(a[0]-b[0])*.22),debt:22}; }
    for(let i=0;i<46;i++){ const an=BC.rand(-Math.PI*.95,-Math.PI*.05), sp=BC.rand(80,420); T.sparks.push({x:x+BC.rand(-14,14),y,vx:Math.cos(an)*sp,vy:Math.sin(an)*sp,life:BC.rand(.35,.9)}); }
    T.rings.push({a:e.a,b:e.b,t:0,dur:.7,r:1}); T.flash=1; T.shake=1; T.flashId=id; };
  /* grips: pieces of the picture that drive a slider directly */
  T.grips=[];
  T.gripAt=g=>{ if(g.node){ const q=T.nodeAt(g.node), bx=(T.desc.edges.find(x=>x.b===g.node&&x.box)||{}).box||0; return [q[0],q[1]-bx*geo.sc*geo.k*1.45]; } if(g.walk){ const w=walkAt(T.desc,T.zs,T.desc.walk); return T.project({u:w.u,v:w.v,z:w.z,fu:0,fv:0},smooth(T.m)); } const e=T.desc.edges.find(x=>x.id===g.edge); if(!e) return null; const a=T.nodeAt(e.a), b=T.nodeAt(e.b); return [(a[0]+b[0])/2,(a[1]+b[1])/2]; };
  T.walkNear=(x,y,t0)=>{ let best=t0, bd=1e12; for(let i=-24;i<=24;i++){ const t=clamp(t0+i*.005,0,1), w=walkAt(T.desc,T.zs,{path:T.desc.walk.path,t}), p=iso(w.u,w.v,w.z), d=(p[0]-x)*(p[0]-x)+(p[1]-y)*(p[1]-y); if(d<bd){ bd=d; best=t; } } return best; };
  T.scale=()=>geo;
  /* probe points and hot zones are real buttons laid over the picture */
  T.overlay=()=>{ const place=(el,x,y)=>{ const t=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`; if(el._t!==t){ el._t=t; el.style.transform=t; } };
    T.pts.forEach(p=>{ const q=T.nodeAt(p.node); place(p.el,q[0],q[1]); });
    if(T.hot){ const a=T.nodeAt(T.hot.a), b=T.nodeAt(T.hot.b); place(T.hot.el,(a[0]+b[0])/2,(a[1]+b[1])/2); }
    T.gripEls.forEach(({el,grip})=>{ const q=M<.5&&T.grips.includes(grip)?T.gripAt(grip):null, on=q?"":"none"; if(el.style.display!==on) el.style.display=on; if(q) place(el,q[0],q[1]); }); };

  /* which nodes get a flat landing: corners, junctions, or any node that asks; ledges through a straight node stay one surface. Plan geometry only, so it is cached. */
  function index(){
    const D=T.desc, key=D.edges.map(e=>e.id+(e.ghost?"-":"")+(TYPES[e.t].tall?e.box:"")).join();
    if(key===layoutKey) return layout; layoutKey=key;
    const dirs={}, tower={}, add=(id,x,y)=>{ const L=Math.hypot(x,y); if(L<1e-6) return; (dirs[id]=dirs[id]||[]).push([x/L,y/L]); };
    D.edges.forEach(e=>{ if(e.t==="source"||TYPES[e.t].tall){ if(e.box){ tower[e.a]=e.box; tower[e.b]=e.box; } return; } if(e.ghost) return;
      const A=D.nodes[e.a].at, B=D.nodes[e.b].at, w0=(e.via&&e.via[0])||B, w1=(e.via&&e.via[e.via.length-1])||A;
      add(e.a,w0[0]-A[0],w0[1]-A[1]); add(e.b,w1[0]-B[0],w1[1]-B[1]); });
    const pad={}; Object.keys(D.nodes).forEach(id=>{ if(tower[id]){ pad[id]=tower[id]; return; } const n=D.nodes[id], d=dirs[id]||[]; const bent=d.length===2&&Math.abs(d[0][0]*d[1][0]+d[0][1]*d[1][1]+1)>1e-3; if(n.pad||d.length>=3||bent) pad[id]=HW; });
    return layout={pad,tower};
  }
  /* an edge's centre line, node to node, with flat runs across the landings at each end */
  function polyOf(e){
    const D=T.desc, na=D.nodes[e.a], nb=D.nodes[e.b], p=T.pres[e.id]===undefined?1:T.pres[e.id], A=fromN(na,(T.zs[e.a]||0)*p), B=fromN(nb,(T.zs[e.b]||0)*p), L=Math.hypot(A.u-B.u,A.v-B.v);
    if(e.via){ const list=[A]; e.via.forEach((w,i,all)=>{ const t=(i+1)/(all.length+1); list.push({u:w[0],v:w[1],fu:w.length>2?w[2]:w[0],fv:w.length>2?w[3]:w[1],z:A.z+(B.z-A.z)*t}); }); list.push(B); return {poly:list,run:list,full:list}; }
    if(L<1e-6) return {poly:[A,B],run:[A,B],full:[A,B]};
    const ta=(layout.pad[e.a]||0)/L, tb=(layout.pad[e.b]||0)/L, S=ta?{...lerpP(A,B,ta),z:A.z}:A, E=tb?{...lerpP(A,B,1-tb),z:B.z}:B;
    const poly=[]; if(!layout.tower[e.a]) poly.push(A); if(ta) poly.push(S); if(tb) poly.push(E); if(!layout.tower[e.b]) poly.push(B);
    return {poly:poly.length>1?poly:[S,E],run:[S,E],full:[A,B]};
  }
  let boxes=[], M=0, solidA=1;
  const mkBox=(id,A,B,o={})=>{ const hw=o.hw||HW, du=B.u-A.u, dv=B.v-A.v, L=Math.hypot(du,dv)||1e-6, nu=-dv/L*hw, nv=du/L*hw;
    return {id,A,B,hw,base:o.base||0,style:o.style||"ledge",heat:o.heat||0,ribs:o.ribs,char:o.char,after:o.after,alpha:o.alpha===undefined?1:o.alpha,
      umin:Math.min(A.u,B.u)-Math.abs(nu),umax:Math.max(A.u,B.u)+Math.abs(nu),vmin:Math.min(A.v,B.v)-Math.abs(nv),vmax:Math.max(A.v,B.v)+Math.abs(nv)}; };
  /* the per-edge handle that TYPES draw through */
  function context(e,polyInfo,g){
    const {poly,run}=polyInfo, pr=T.pres[e.id]===undefined?1:T.pres[e.id], D=T.desc;
    const c={e,g,poly,font:FONT.display,pres:pr,swing:T.swing[e.id]===undefined?swing0(e):T.swing[e.id],glow:0,chute:HW};
    c.at=id=>T.nodeAt(id);
    if(e.t==="resistor"||TYPES[e.t].hot){ const h=T.heat[e.id]||0; c.glow=Math.sqrt(h)*(h>1?1+.09*Math.sin(T.clock*34):1); if(T.flash>0&&T.flashId===e.id) c.glow=Math.max(c.glow,1+T.flash);
      if(e.t==="resistor"&&D.rspan&&!e.inner){ const [lo,hi]=D.rspan, f=clamp(Math.log(e.R/lo)/Math.log(hi/lo),0,1); c.chute=HW*(1-.56*f); } }
    c.stream=gg=>streamOf(gg,e,polyInfo);
    c.run=o=>{ for(let i=0;i<run.length-1;i++) boxes.push(mkBox(e.id+":"+i,run[i],run[i+1],o)); if(e.via) for(let i=1;i<run.length-1;i++){ const q=run[i], w=(o&&o.hw)||HW; boxes.push(mkBox(e.id+":c"+i,{...q,u:q.u-w},{...q,u:q.u+w},{...o,hw:w})); } };
    c.stub=(t0,t1,o={})=>{ const A=run[0], B=run[run.length-1], z=t0<.5?A.z:B.z; boxes.push(mkBox(e.id+":s"+t0,{...lerpP(A,B,t0),z},{...lerpP(A,B,t1),z},o)); };
    /* the blade hangs from the live side when open and swings up to meet the far side when closed */
    c.plank=(t0,t1,sw,heat)=>{ const A=run[0], B=run[run.length-1], zh=A.z, P0={...lerpP(A,B,t0),z:zh}, full=lerpP(A,B,t1), an=sw*1.25, L=Math.hypot(full.u-P0.u,full.v-P0.v), cosA=Math.cos(an), P1={...lerpP(P0,full,cosA),z:0};
      P1.z=Math.max(0,zh+(B.z-zh)*(1-sw)-Math.sin(an)*L*geo.sc/geo.hs); boxes.push(mkBox(e.id+":p",P0,P1,{style:"tower",hw:HW*.72,heat:heat||0})); };
    c.capsule=(t0,t1)=>{ const A=lerpP(run[0],run[run.length-1],t0), B=lerpP(run[0],run[run.length-1],t1), lift=9/geo.hs*pr; boxes.push(mkBox(e.id+":f",{...A,z:A.z+lift},{...B,z:B.z+lift},{style:"tower",hw:HW*.62,base:A.z})); };
    c.tower=()=>{ const n=D.nodes[e.a].at, s=e.box||HW, z=(T.zs[e.b]||0)*pr, Fa=nodeF(D.nodes[e.a]), Fb=nodeF(D.nodes[e.b]);
      const mkP=(u)=>({u,v:n[1],z,fu:(Fa[0]+Fb[0])/2,fv:(Fa[1]+Fb[1])/2});
      const inner=D.edges.find(x=>x.inner), hot=inner?Math.sqrt(T.heat[inner.id]||0):0; boxes.push(mkBox(e.id+":t",mkP(n[0]-s),mkP(n[0]+s),{style:"tower",hw:s,heat:hot>.25?hot*.8:0,after:(gg)=>towerMarks(gg,e,n,s,z)})); };
    /* a tank is a glass box on the floor: its footprint is its capacitance, its water level its voltage */
    c.tank=()=>{ const n=D.nodes[e.a].at, s=e.box||.2, z=Math.max(0,(T.zs[e.a]||0)-(T.zs[e.b]||0))*pr, Fa=nodeF(D.nodes[e.a]), Fb=nodeF(D.nodes[e.b]), mkP=u=>({u,v:n[1],z,fu:(Fa[0]+Fb[0])/2,fv:(Fa[1]+Fb[1])/2});
      boxes.push(mkBox(e.id+":w",mkP(n[0]-s),mkP(n[0]+s),{style:"water",hw:s,after:gg=>glass(gg,e,n,s,z)})); };
    c.wheel=()=>{ c.run({hw:e.hw,after:gg=>wheel(gg,e,run)}); };
    /* the diode's arrow, once, on its longest run */
    c.chevron=()=>{ let box=null, best=0; boxes.forEach(b=>{ if(b.id.startsWith(e.id+":")){ const l=Math.hypot(b.A.u-b.B.u,b.A.v-b.B.v); if(l>best){ best=l; box=b; } } }); if(!box) return;
      box.after=gg=>{ const mid=lerpP(box.A,box.B,.5), du=box.B.u-box.A.u, dv=box.B.v-box.A.v, L=Math.hypot(du,dv)||1, X=du/L, Y=dv/L, S=HW*.55, q=(f,s)=>iso(mid.u+X*f*S-Y*s*S,mid.v+Y*f*S+X*s*S,mid.z), a=q(-1,-1), m=q(1,0), b=q(-1,1), a2=q(1,-1), b2=q(1,1); gg.fillStyle=PAL.inkS; gg.beginPath(); gg.moveTo(a[0],a[1]); gg.lineTo(m[0],m[1]); gg.lineTo(b[0],b[1]); gg.closePath(); gg.fill(); gg.strokeStyle=PAL.inkS; gg.lineWidth=2.5; gg.beginPath(); gg.moveTo(a2[0],a2[1]); gg.lineTo(b2[0],b2[1]); gg.stroke(); }; };
    return c;
  }
  function glass(g,e,n,s,z){
    const P=PAL, rim=Math.max(e.rim||0,z), u0=n[0]-s, u1=n[0]+s, v0=n[1]-s, v1=n[1]+s, q=(u,v,zz)=>iso(u,v,zz), glassC=P.dark?"rgba(255,255,255,":"rgba(40,50,60,";
    /* the front panes, then the frame; heights marked on the panes read against the water */
    g.fillStyle=glassC+(P.dark?".07)":".06)"); [[u0,v1,u1,v1],[u1,v1,u1,v0]].forEach(([a,b,c,d])=>{ poly4(g,q(a,b,z),q(c,d,z),q(c,d,rim),q(a,b,rim)); g.fill(); });
    g.lineWidth=1.5; g.strokeStyle=glassC+(P.dark?".6)":".55)"); g.beginPath(); const line=(p,r)=>{ g.moveTo(p[0],p[1]); g.lineTo(r[0],r[1]); }; [[u0,v0],[u1,v0],[u1,v1],[u0,v1]].forEach(([a,b])=>line(q(a,b,0),q(a,b,rim))); line(q(u0,v0,rim),q(u1,v0,rim)); line(q(u1,v0,rim),q(u1,v1,rim)); line(q(u1,v1,rim),q(u0,v1,rim)); line(q(u0,v1,rim),q(u0,v0,rim)); line(q(u0,v1,0),q(u1,v1,0)); line(q(u1,v1,0),q(u1,v0,0)); g.stroke();
    if(e.capLabel){ const p=q(n[0],n[1],rim); tag(g,e.capLabel,p[0],p[1]-s*geo.sc*geo.k-8,P.inkS,labelPx(clamp(geo.sc*.05,13,16)),"center",600); }
    (e.marks||[]).forEach(mk=>{ g.strokeStyle=P.inkS; g.lineWidth=1.5; g.setLineDash([4,3]); g.beginPath(); line(q(u0,v1,mk.z),q(u1,v1,mk.z)); line(q(u1,v1,mk.z),q(u1,v0,mk.z)); g.stroke(); g.setLineDash([]); if(mk.t){ const p=q(u1,v1,mk.z); tag(g,mk.t,p[0],p[1]-7,P.inkS,labelPx(13),"center",600); } });
  }
  /* a flywheel standing in the stream; spin follows the current */
  function wheel(g,e,run){
    const P=PAL, mid=lerpP(run[0],run[run.length-1],.5), R=clamp(geo.sc*.15,18,44), c0=iso(mid.u,mid.v,mid.z), lift=R*.62, th=R*.3, cx=c0[0], cy=c0[1]-lift, ex=geo.c*.82, ey=geo.k*.82, dx=-geo.c*th*.62, dy=geo.k*th*.62, an=T.spin[e.id]||0;
    const disc=(x,y)=>{ g.save(); g.translate(x,y); g.transform(R*ex,R*ey,0,-R,0,0); g.beginPath(); g.arc(0,0,1,0,7); g.restore(); };
    disc(cx-dx,cy-dy); g.fillStyle=rgb(P.towV); g.fill();
    /* tread */
    g.save(); g.lineCap="round"; g.strokeStyle=rgb(P.towU); g.lineWidth=th*.5; g.beginPath(); for(let i=0;i<=26;i++){ const a=i/26*Math.PI*2, x=cx+Math.cos(a)*R*ex, y=cy+Math.cos(a)*R*ey-Math.sin(a)*R; const f=.5; i?g.lineTo(x-dx*f,y-dy*f):g.moveTo(x-dx*f,y-dy*f); } g.stroke(); g.restore();
    disc(cx,cy); g.fillStyle=rgb(P.towT); g.fill(); g.lineWidth=2; g.strokeStyle=rgb(P.towE); g.stroke();
    const pt=(r,a)=>[cx+Math.cos(a)*r*R*ex, cy+Math.cos(a)*r*R*ey-Math.sin(a)*r*R];
    g.strokeStyle=P.accentS; g.lineWidth=clamp(R*.11,2,4.5); g.lineCap="round"; g.beginPath(); for(let i=0;i<6;i++){ const a=an+i*Math.PI/3, q=pt(.14,a), r=pt(.84,a); g.moveTo(q[0],q[1]); g.lineTo(r[0],r[1]); } g.stroke();
    g.fillStyle=rgb(P.towE); for(let i=0;i<6;i++){ const q=pt(.84,an+i*Math.PI/3); g.beginPath(); g.arc(q[0],q[1],clamp(R*.11,2,5),0,7); g.fill(); }
    const h=pt(0,0); g.beginPath(); g.arc(h[0],h[1],clamp(R*.14,3,6),0,7); g.fillStyle=P.inkS; g.fill(); g.lineCap="butt";
  }
  /* the battery's face: one notch per volt, chevrons climbing as fast as the current */
  function towerMarks(g,e,n,s,z){
    const P=PAL, hs=geo.hs, u=n[0]+s, H=z*hs; if(H<3) return;
    if(e.tag){ const q=iso(n[0],n[1],z), skew=geo.k/geo.c, size=clamp(geo.sc*s*.62,12,30); g.save(); g.translate(q[0],q[1]); g.transform(1,skew,-1,skew,0,0); g.font=`700 ${size}px ${FONT.display}`; g.textAlign="center"; g.textBaseline="middle"; g.fillStyle=rgb(mix(P.towT,P.bg,.9)); g.fillText(e.tag,0,0); g.restore(); g.textBaseline="alphabetic"; }
    const fx=(v,zz)=>iso(u,v,zz);
    /* notches on the left face */
    const uL=n[0]-s, vF=n[1]+s; g.lineWidth=1; g.strokeStyle=rgb(P.towE,.55); g.beginPath();
    for(let k=1;k<z-.02;k++){ const a=iso(uL+s*.22,vF,k), b=iso(n[0]+s,vF,k); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); } g.stroke();
    /* chevrons on the right face */
    const fl=T.flow[e.id]||0, x=fl/(T.desc.iref||.05), on=fl>1e-6, wid=on?clamp(.35+.65*Math.sqrt(x),.35,1)*s*.78:s*.36, spacing=Math.max(11,geo.sc*.06);
    const ph=on&&!BC.reduced?(T.phi[e.id]||0)%spacing:spacing*.4;
    g.lineWidth=clamp(geo.sc*.009,1.6,3.2); g.lineCap="round"; g.lineJoin="round"; g.strokeStyle=on?P.accentS:rgb(P.muted,.55); g.beginPath();
    const rise=clamp(geo.sc*.03,4,10);
    for(let y=ph;y<H-2;y+=spacing){ const zc=y/hs, zl=Math.max(0,(y-rise)/hs), a=fx(n[1]-wid,zl), b=fx(n[1],zc), c=fx(n[1]+wid,zl); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.lineTo(c[0],c[1]); } g.stroke(); g.lineCap="butt";
  }
  /* painter's order from plan overlap: a box is behind another if it ends before the other starts along u or v */
  function orderBoxes(){
    const key=boxes.map(b=>b.id).join(); if(key===orderKey&&order&&order.length===boxes.length) return order;
    orderKey=key; const n=boxes.length, eps=1e-4, after=boxes.map(()=>0), blocks=boxes.map(()=>[]);
    for(let i=0;i<n;i++) for(let j=0;j<n;j++){ if(i===j) continue; const a=boxes[i], b=boxes[j], aB=a.umax<=b.umin+eps||a.vmax<=b.vmin+eps, bB=b.umax<=a.umin+eps||b.vmax<=a.vmin+eps; if(aB&&!bB){ blocks[i].push(j); after[j]++; } }
    const res=[], done=new Array(n).fill(false);
    for(let c=0;c<n;c++){ let best=-1, bd=1e9; for(let i=0;i<n;i++){ if(done[i]) continue; const d=(boxes[i].umin+boxes[i].umax+boxes[i].vmin+boxes[i].vmax)+(after[i]?1e4*after[i]:0); if(d<bd){ bd=d; best=i; } } done[best]=true; res.push(best); blocks[best].forEach(j=>after[j]--); }
    return order=res;
  }
  const corner=(q,du,dv,z)=>{ const a=iso(q.u+du,q.v+dv,z); if(M<=0) return a; const b=flat(q.fu,q.fv); return [a[0]+(b[0]-a[0])*M,a[1]+(b[1]-a[1])*M]; };
  const poly4=(g,a,b,c,d)=>{ g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.lineTo(c[0],c[1]); g.lineTo(d[0],d[1]); g.closePath(); };
  function colours(b){
    const P=PAL; let top,u,v,edge=P.edge;
    if(b.style==="tower"){ top=P.towT; u=P.towU; v=P.towV; edge=P.towE; }
    else if(b.style==="ramp"){ const L=Math.hypot(b.B.u-b.A.u,b.B.v-b.A.v)*geo.sc||1, tilt=Math.min(1,Math.abs(b.A.z-b.B.z)*geo.hs/L*1.5); top=mix(P.rampT,P.rampV,tilt*.75); u=P.rampU; v=P.rampV; }
    else if(b.style==="water"){ const f=clamp(b.A.z*geo.hs/6,0,1); top=mix(P.floor,mix(P.accent,[255,255,255],.28),f); u=P.accent; v=mix(P.accent,P.shadow,.25); edge=P.accent; }
    else { top=P.top; u=P.u; v=P.v; }
    if(b.char){ top=mix(top,P.char,.45); u=mix(u,P.char,.55); v=mix(v,P.char,.55); }
    if(b.heat>.01){ const i=b.heat, wall=Math.min(i*1.15,i>1?i:1); top=glow(top,Math.min(i*.62,i>1?i:1)); u=glow(u,wall); v=glow(v,wall); }
    return {top,u,v,edge};
  }
  function drawBox(g,b){
    const {A,B,hw}=b, du=B.u-A.u, dv=B.v-A.v, L=Math.hypot(du,dv); if(L<1e-6) return;
    const tu=du/L, tv=dv/L, nu=-tv*hw, nv=tu*hw, w=1-M, C=colours(b), base=b.base*1;
    const a1=corner(A,nu*w,nv*w,A.z), b1=corner(B,nu*w,nv*w,B.z), b2=corner(B,-nu*w,-nv*w,B.z), a2=corner(A,-nu*w,-nv*w,A.z);
    const fa1=corner(A,nu*w,nv*w,base), fb1=corner(B,nu*w,nv*w,base), fb2=corner(B,-nu*w,-nv*w,base), fa2=corner(A,-nu*w,-nv*w,base);
    const wall=(p,q,fq,fp,ox,oy)=>{ if(ox+oy<1e-3) return; const col=oy>=ox?C.v:C.u, ymin=Math.min(p[1],q[1]), ymax=Math.max(fp[1],fq[1]); if(ymax-ymin<.4) return;
      poly4(g,p,q,fq,fp); if(ymax-ymin>5){ const gr=g.createLinearGradient(0,ymin,0,ymax); gr.addColorStop(0,rgb(col)); gr.addColorStop(1,rgb(mix(col,PAL.shadow,PAL.dark?.45:.28))); g.fillStyle=gr; g.strokeStyle=gr; } else { g.fillStyle=rgb(col); g.strokeStyle=rgb(col); } g.lineWidth=.6; g.fill(); g.stroke(); };
    wall(a1,b1,fb1,fa1,nu,nv); wall(b2,a2,fa2,fb2,-nu,-nv); wall(b1,b2,fb2,fb1,tu,tv); wall(a2,a1,fa1,fa2,-tu,-tv);
    poly4(g,a1,b1,b2,a2); g.fillStyle=rgb(C.top); g.fill(); g.strokeStyle=rgb(C.top); g.lineWidth=.6; g.stroke(); g.strokeStyle=rgb(C.edge,PAL.dark?.5:.75); g.lineWidth=1; g.beginPath(); g.moveTo(a1[0],a1[1]); g.lineTo(b1[0],b1[1]); g.moveTo(b2[0],b2[1]); g.lineTo(a2[0],a2[1]); if(b.style==="tower"||b.caps){ g.moveTo(b1[0],b1[1]); g.lineTo(b2[0],b2[1]); g.moveTo(a2[0],a2[1]); g.lineTo(a1[0],a1[1]); } g.stroke();
    if(b.ribs&&w>.2){ const step=.085, n=Math.floor(L/step); g.strokeStyle=b.heat>.5?rgb(PAL.hot,.35):rgb(PAL.rib,.75); g.lineWidth=1; g.beginPath(); for(let i=1;i<n;i++){ const t=i/n, q=lerpP(A,B,t), p=corner(q,nu*w*.86,nv*w*.86,q.z), r=corner(q,-nu*w*.86,-nv*w*.86,q.z); g.moveTo(p[0],p[1]); g.lineTo(r[0],r[1]); } g.stroke(); }
    if(b.after&&M<.6) b.after(g);
  }
  /* soft shadows: drawn small and scaled up, which blurs them for free. Light comes from behind, so shadows fall toward the viewer and tie each height to the floor. */
  function drawShadows(g,W,H){
    if(M>=1) return; const f=3.2, sw=Math.ceil(W/f), sh=Math.ceil(H/f); if(shadowCv.width!==sw||shadowCv.height!==sh){ shadowCv.width=sw; shadowCv.height=sh; }
    const s=shadowCv.getContext("2d"); s.setTransform(1,0,0,1,0,0); s.clearRect(0,0,sw,sh); s.setTransform(1/f,0,0,1/f,0,0); s.fillStyle="#000";
    const vm=T.vm||18, off=(z)=>Math.max(0,z)/vm*.34;
    boxes.forEach(b=>{ const {A,B,hw}=b, du=B.u-A.u, dv=B.v-A.v, L=Math.hypot(du,dv); if(L<1e-6) return; const nu=-dv/L*hw, nv=du/L*hw, oA=off(A.z), oB=off(B.z);
      const f0=(q,x,y)=>iso(q.u+x,q.v+y,0), s0=(q,x,y,o)=>iso(q.u+x+o,q.v+y+o,0), g1=[f0(A,nu,nv),f0(B,nu,nv),f0(B,-nu,-nv),f0(A,-nu,-nv)], g2=[s0(A,nu,nv,oA),s0(B,nu,nv,oB),s0(B,-nu,-nv,oB),s0(A,-nu,-nv,oA)];
      s.beginPath(); g1.forEach((p,i)=>i?s.lineTo(p[0],p[1]):s.moveTo(p[0],p[1])); s.closePath(); s.fill();
      s.beginPath(); g2.forEach((p,i)=>i?s.lineTo(p[0],p[1]):s.moveTo(p[0],p[1])); s.closePath(); s.fill();
      for(let i=0;i<4;i++){ const j=(i+1)%4; s.beginPath(); s.moveTo(g1[i][0],g1[i][1]); s.lineTo(g1[j][0],g1[j][1]); s.lineTo(g2[j][0],g2[j][1]); s.lineTo(g2[i][0],g2[i][1]); s.closePath(); s.fill(); } });
    g.save(); slabPath(g); g.clip(); g.globalAlpha=(PAL.dark?.62:.2)*(1-M); g.imageSmoothingEnabled=true; g.imageSmoothingQuality="high"; g.drawImage(shadowCv,0,0,W,H); g.restore();
  }
  const slabCorners=()=>{ const {U,V,E}=geo; return [iso(-E,-E,0),iso(U+E,-E,0),iso(U+E,V+E,0),iso(-E,V+E,0)]; };
  const slabPath=g=>{ const q=slabCorners(); g.beginPath(); q.forEach((a,i)=>i?g.lineTo(a[0],a[1]):g.moveTo(a[0],a[1])); g.closePath(); };
  /* the base is a slab on the page: cached, since it only changes with size and theme */
  function drawFloor(g,W,H,dpr){
    if(M>=1) return; const key=[W,H,dpr,geo.U,geo.V,geo.sc,geo.oy,PAL.key].join();
    if(key!==floorKey){ floorKey=key; floorCv.width=Math.round(W*dpr); floorCv.height=Math.round(H*dpr); const f=floorCv.getContext("2d"); f.setTransform(dpr,0,0,dpr,0,0); const P=PAL,{U,V,E,slab}=geo, q=slabCorners();
      /* contact shadow under the slab */
      f.save(); f.filter="blur(10px)"; f.fillStyle=rgb(P.shadow,P.dark?.7:.22); f.beginPath(); f.moveTo(q[3][0]+6,q[3][1]+slab+2); f.lineTo(q[2][0],q[2][1]+slab+8); f.lineTo(q[1][0]-6,q[1][1]+slab+2); f.lineTo(q[2][0],q[2][1]); f.closePath(); f.fill(); f.restore();
      f.fillStyle=rgb(P.slabV); f.beginPath(); f.moveTo(q[3][0],q[3][1]); f.lineTo(q[2][0],q[2][1]); f.lineTo(q[2][0],q[2][1]+slab); f.lineTo(q[3][0],q[3][1]+slab); f.closePath(); f.fill();
      f.fillStyle=rgb(P.slabU); f.beginPath(); f.moveTo(q[2][0],q[2][1]); f.lineTo(q[1][0],q[1][1]); f.lineTo(q[1][0],q[1][1]+slab); f.lineTo(q[2][0],q[2][1]+slab); f.closePath(); f.fill();
      const gr=f.createLinearGradient(q[0][0],q[0][1],q[2][0],q[2][1]); gr.addColorStop(0,rgb(P.floor2)); gr.addColorStop(1,rgb(P.floor)); f.fillStyle=gr; slabPath(f); f.fill();
      f.strokeStyle=rgb(P.grid); f.lineWidth=1; f.beginPath();
      for(let u=-E+.04+((E-.04)%.2);u<U+E-.01;u+=.2){ const a=iso(u,-E,0), b=iso(u,V+E,0); f.moveTo(a[0],a[1]); f.lineTo(b[0],b[1]); }
      for(let v=-E+.04+((E-.04)%.2);v<V+E-.01;v+=.2){ const a=iso(-E,v,0), b=iso(U+E,v,0); f.moveTo(a[0],a[1]); f.lineTo(b[0],b[1]); } f.stroke();
      f.strokeStyle=rgb(P.edge,.5); slabPath(f); f.stroke();
      const z=iso(U+E-.18,V+E-.06,0); f.font=`500 ${labelPx(11)}px ${FONT.mono}`; f.fillStyle=rgb(P.muted); f.textAlign="right"; f.fillText("0 V",z[0]+2,z[1]+2);
    }
    /* the room's back walls carry the height scale, so the empty air above a low ledge still measures something. Cached apart from the floor: they alone follow the scale. */
    const vm=T.vm||18, wk=[key,vm.toFixed(1)].join();
    if(wk!==wallKey){ wallKey=wk; wallCv.width=Math.round(W*dpr); wallCv.height=Math.round(H*dpr); const f=wallCv.getContext("2d"), P=PAL, q=slabCorners(); f.setTransform(dpr,0,0,dpr,0,0);
      const wallH=vm*geo.hs, wall=(a,b)=>{ const gr=f.createLinearGradient(0,a[1]-wallH,0,a[1]); gr.addColorStop(0,rgb(P.floor2,0)); gr.addColorStop(1,rgb(P.floor2,P.dark?.7:.9)); f.fillStyle=gr; f.beginPath(); f.moveTo(a[0],a[1]); f.lineTo(b[0],b[1]); f.lineTo(b[0],b[1]-wallH); f.lineTo(a[0],a[1]-wallH); f.closePath(); f.fill(); };
      wall(q[0],q[1]); wall(q[0],q[3]);
      const stepV=vm<=10?1:vm<=40?5:vm<=120?20:vm<=400?50:100; f.lineWidth=1; f.font=`500 ${labelPx(11)}px ${FONT.mono}`; f.textAlign="right";
      const top=vm>40?vm*2.2:vm;   /* past the back corner a tall spike still has lines to read against */
      for(let z=stepV;z<top;z+=stepV){ const y=z*geo.hs; f.strokeStyle=rgb(P.grid,P.dark?.9:1); f.beginPath(); f.moveTo(q[3][0],q[3][1]-y); f.lineTo(q[0][0],q[0][1]-y); f.lineTo(q[1][0],q[1][1]-y); f.stroke(); f.fillStyle=rgb(P.muted,.8); f.fillText(z+" V",q[1][0]-3,q[1][1]-y-5); } }
    g.save(); g.globalAlpha=1-M; g.setTransform(1,0,0,1,0,0); g.drawImage(wallCv,0,0); g.drawImage(floorCv,0,0); g.restore();
  }
  /* power lights the floor around a hot slope */
  function drawGlows(g,items){
    if(M>=1) return; const P=PAL;
    items.forEach(({e,info})=>{ if(e.t!=="resistor"&&!TYPES[e.t].hot||e.open||e.ghost||e.dead) return; const h=T.heat[e.id]||0, i=Math.min(1.3,Math.sqrt(h)*(T.flash>0&&T.flashId===e.id?2:1)); if(i<.08) return;
      const A=info.run[0], B=info.run[info.run.length-1], mid=lerpP(A,B,.5), c=iso(mid.u+.1,mid.v+.1,0), a=iso(A.u,A.v,0), b=iso(B.u,B.v,0), L=Math.hypot(a[0]-b[0],a[1]-b[1])*.72+24, an=Math.atan2(b[1]-a[1],b[0]-a[0]);
      g.save(); g.globalCompositeOperation=P.dark?"lighter":"source-over"; g.translate(c[0],c[1]); g.rotate(an); g.scale(L,Math.max(26,geo.sc*.16));
      const gr=g.createRadialGradient(0,0,0,0,0,1), col=i>1?mix(P.accent,P.hot,Math.min(1,i-1)):P.accent; gr.addColorStop(0,rgb(col,Math.min(.55,i*(P.dark?.5:.36))*(1-M))); gr.addColorStop(1,rgb(col,0)); g.fillStyle=gr; g.beginPath(); g.arc(0,0,1,0,7); g.fill(); g.restore(); });
  }
  /* floor print: a label lying on the base, standing up as the picture morphs flat */
  function drawPrint(g,items){
    const P=PAL, {c,k,sc}=geo, size=clamp(sc*.115,sc<200?19:15,34), sz=size+(13-size)*M, skew=k/c;
    g.textAlign="center"; g.textBaseline="middle"; g.font=`600 ${sz}px ${FONT.display}`;
    items.forEach(({e,info})=>{ if(!e.label) return; const lines=Array.isArray(e.label)?e.label:[e.label], lab=e.lab||[0,.25], P0=info.poly[0], P1=info.poly[info.poly.length-1], q={u:(P0.u+P1.u)/2+lab[0],v:(P0.v+P1.v)/2+lab[1],z:0,fu:(P0.fu+P1.fu)/2,fv:(P0.fv+P1.fv)/2}, f=e.labf||[0,-22];
      const pos=T.project(q,M); pos[0]+=f[0]*M; pos[1]+=f[1]*M;
      g.save(); g.translate(pos[0],pos[1]); g.transform(1,skew*(1-M),-1*(1-M),skew+(1-skew)*M,0,0); g.fillStyle=e.labc?rgb(P[e.labc]):rgb(P.muted);
      lines.forEach((t,i)=>g.fillText(t,0,(i-(lines.length-1)/2)*sz*1.12)); g.restore(); });
    g.textBaseline="alphabetic";
  }
  const FONT={};
  /* picture labels: a phone-sized frame gets larger ones */
  const labelPx=px=>geo.sc<200?Math.max(px+2,14.5):px;
  const tag=(g,t,x,y,col,size=13,al="center",w=500)=>{ g.font=`${w} ${size}px ${FONT.mono}`; g.textAlign=al; g.lineJoin="round"; g.lineWidth=4; g.strokeStyle=PAL.bgS; g.strokeText(t,x,y); g.fillStyle=col; g.fillText(t,x,y); };

  /* the stream. Width and speed each go as the square root of current, over a fixed grain of charge,
     so charge per second = width x speed x grain is proportional to current on every edge, and streams conserve flow at a junction. */
  const LANES=[0,1,-1,2,-2,3,-3], LANE=HW*.3, JIT=Array.from({length:64},(_,i)=>{ const x=Math.sin(i*127.1+311.7)*43758.5453; return x-Math.floor(x); });
  const offs={};
  function moveStreams(items,dt){
    const D=T.desc, sc=geo.sc, Iref=D.iref||.05; let off=0;
    items.forEach(({e,info})=>{ let L=0; const poly=info.full; for(let i=0;i<poly.length-1;i++) L+=Math.hypot(poly[i].u-poly[i+1].u,poly[i].v-poly[i+1].v)*sc; offs[e.id]=off; off+=L;
      const x=(T.flow[e.id]||0)/Iref; if(dt>0&&!BC.reduced&&x>0) T.phi[e.id]=(T.phi[e.id]||0)+sc*.6*clamp(Math.sqrt(x),0,3.2)*dt; });
  }
  function streamOf(g,e,info){
    const P=PAL, D=T.desc, sc=geo.sc, Iref=D.iref||.05, lw=clamp(sc*.0072,1.4,2.3)+M*1.1, spacing=clamp(sc*.062,9,19), fade=1-M*.25, poly=info.poly, f=T.flow[e.id]||0, I=T.sol.I[e.id]||0, pl=[];
    for(let i=0;i<poly.length-1;i++) pl.push(Math.hypot(poly[i].u-poly[i+1].u,poly[i].v-poly[i+1].v)*sc);
    const x=f/Iref, pr=T.pres[e.id]===undefined?1:T.pres[e.id];
    if(x<.002||pr<.6||e.t==="source") return;
    if(e.t==="resistor"&&e.open||e.t==="fuse"&&e.blown||e.t==="switch"&&!e.closed||TYPES[e.t].tall) return;
    const vel=sc*.6*clamp(Math.sqrt(x),0,3.2), sgn=I<0?-1:1, offHere=offs[e.id]||0;
    const hw=(e.t==="resistor"&&D.rspan&&!e.inner)?HW*(1-.56*clamp(Math.log(e.R/D.rspan[0])/Math.log(D.rspan[1]/D.rspan[0]),0,1)):(e.hw||HW), w=Math.min(hw*.94,HW*.98*Math.sqrt(x)), hot=Math.sqrt(T.heat[e.id]||0);
    const col=hot>.45?rgb(mix(P.accent,P.dark?P.hot:[255,255,255],clamp((hot-.45)*1.6,0,1))):P.accentS, streak=clamp(vel*.055,1,spacing*.8);
    /* the water under the grains */
    const shrink=1-M*.75, walk=sgn>0?poly:poly.slice().reverse(), lens=sgn>0?pl:pl.slice().reverse();
    const small=sc<200; g.fillStyle=rgb(P.accent,(small?(P.dark?.5:.4):(P.dark?.3:.2))*fade);
    for(let i=0;i<walk.length-1;i++){ const a=walk[i], b=walk[i+1], l=lens[i]/sc; if(l<1e-6) continue; const nu=-(b.v-a.v)/l*w*shrink, nv=(b.u-a.u)/l*w*shrink, p1=corner(a,nu,nv,a.z), p2=corner(b,nu,nv,b.z), p3=corner(b,-nu,-nv,b.z), p4=corner(a,-nu,-nv,a.z); poly4(g,p1,p2,p3,p4); g.fill(); }
    /* the grains: each lane a fixed row, so changing the current never scrambles them */
    g.strokeStyle=col; g.lineCap="round"; g.lineWidth=lw;
    /* too small for separate grains to read: long streaks on a solid body, the same lanes at the same speed */
    if(small){ const dash=spacing*1.5, gap=spacing*.7; g.lineCap="butt"; g.lineWidth=Math.max(lw,2)+.3; g.setLineDash([dash,gap]);
      LANES.forEach((j,ix)=>{ if(j%2) return; const l=j*LANE, al=Math.abs(l); if(al>w+LANE*.35) return; g.globalAlpha=clamp((w-al)/(LANE*.7)+.7,.35,1)*fade; g.lineDashOffset=-((T.phi[e.id]||0)*(1-.06*Math.abs(j))+ix*spacing*.53-(sgn>0?offHere:0)); g.beginPath(); let first=true;
        for(let i=0;i<walk.length-1;i++){ const A=walk[i], B=walk[i+1], d=lens[i]; if(d<.5) continue; const nu=-(B.v-A.v)/(d/sc)*l*shrink, nv=(B.u-A.u)/(d/sc)*l*shrink, p=corner(A,nu,nv,A.z), q=corner(B,nu,nv,B.z); if(first){ g.moveTo(p[0],p[1]); first=false; } else g.lineTo(p[0],p[1]); g.lineTo(q[0],q[1]); }
        g.stroke(); }); g.setLineDash([]); g.lineDashOffset=0; }
    else LANES.forEach((j,ix)=>{ const l=j*LANE, al=Math.abs(l); if(al>w+LANE*.35) return; const a=clamp((w-al)/(LANE*.7)+.6,.25,1); g.globalAlpha=a*fade;
      const prof=1-.06*Math.abs(j), ph=(T.phi[e.id]||0)*prof+ix*spacing*.37-(sgn>0?offHere:0);
      let carry=0; g.beginPath();
      for(let i=0;i<walk.length-1;i++){ const A=walk[i], B=walk[i+1], d=lens[i]; if(d<.5) continue;
        const nu=-(B.v-A.v)/(d/sc)*l*shrink, nv=(B.u-A.u)/(d/sc)*l*shrink, p=corner(A,nu,nv,A.z), q=corner(B,nu,nv,B.z), dx=(q[0]-p[0])/d, dy=(q[1]-p[1])/d, jx=(-(B.v-A.v)-(B.u-A.u))/(d/sc)*LANE*.6*sc*geo.c*(1-M), jy=((B.u-A.u)-(B.v-A.v))/(d/sc)*LANE*.6*sc*geo.k*(1-M);
        let s=((ph-carry)%spacing+spacing)%spacing;
        for(;s<d;s+=spacing){ const id=Math.floor((s+carry-ph)/spacing+1e-3)+ix*17, jr=JIT[((id%64)+64)%64], so=s+(jr-.5)*spacing*.6, X=p[0]+dx*so+jx*(jr-.5), Y=p[1]+dy*so+jy*(jr-.5); g.moveTo(X,Y); const bk=Math.min(streak*(.5+jr),Math.max(0,so)); g.lineTo(X-dx*bk,Y-dy*bk+.01); }
        carry+=d; }
      g.stroke(); });
    g.globalAlpha=1; g.lineCap="butt";
    /* no motion to read direction from: arrows */
    if(BC.reduced&&walk.length>1){ const a=walk[0], b=walk[walk.length-1], mid=lerpP(a,b,.5), p=T.project(mid,M), q=T.project(b,M), an=Math.atan2(q[1]-p[1],q[0]-p[0]), s=clamp(4+w*sc*.7,5,16); g.save(); g.translate(p[0],p[1]); g.rotate(an); g.fillStyle=P.accentS; g.strokeStyle=P.bgS; g.lineWidth=1.5; g.beginPath(); g.moveTo(s,0); g.lineTo(-s*.7,-s*.7); g.lineTo(-s*.7,s*.7); g.closePath(); g.stroke(); g.fill(); g.restore(); }
  }
  /* a dashed line from the control node, at its own height, to the gate on the slope */
  function drawTies(g,items){
    items.forEach(({e,info})=>{ if(!TYPES[e.t].ctl||e.ghost) return; const A=info.run[0], B=info.run[info.run.length-1], q=T.nodeAt(e.ctl), m=T.project(lerpP(A,B,.5),M); g.save(); g.strokeStyle=PAL.mutedS; g.lineWidth=1.8; g.setLineDash([5,4]); g.beginPath(); g.moveTo(q[0],q[1]); g.lineTo(m[0],m[1]); g.stroke(); g.restore(); });
  }
  /* an LED's light: a bulb on the ledge and a halo that follows the flow */
  function drawLights(g,items){
    const P=PAL; items.forEach(({e,info})=>{ const L=TYPES[e.t].light&&TYPES[e.t].light(e); if(!L||e.ghost||(T.pres[e.id]===undefined?1:T.pres[e.id])<.5) return;
      const A=info.run[0], B=info.run[info.run.length-1], mid=lerpP(A,B,.5), p=T.project({...mid,z:mid.z+(1-M)*0},M), I=Math.abs(T.sol.I[e.id]||0), lit=e.dead?0:clamp(I/.02,0,1.4)*(L.k===undefined?1:L.k), R=clamp(geo.sc*.045,8,13), cy=p[1]-(1-M)*(R+HW*geo.sc*.5);
      if(lit>.03){ const H=R*(3+5*Math.min(lit,1.2)); g.save(); g.globalCompositeOperation=P.dark?"lighter":"source-over"; const gr=g.createRadialGradient(p[0],cy,0,p[0],cy,H); gr.addColorStop(0,rgb(L.c,Math.min(.75,.25+lit*.5))); gr.addColorStop(1,rgb(L.c,0)); g.fillStyle=gr; g.beginPath(); g.arc(p[0],cy,H,0,7); g.fill(); g.restore(); }
      g.beginPath(); g.arc(p[0],cy,R,0,7); g.fillStyle=lit>.03?rgb(mix(P.dark?[40,40,40]:[235,235,235],L.c,Math.min(1,.35+lit*.8))):P.bgS; g.fill(); g.lineWidth=2; g.strokeStyle=lit>.03?rgb(L.c):P.mutedS; g.stroke(); });
  }
  function drawGhosts(g,items){
    const P=PAL; items.forEach(({e,info})=>{ const pr=T.pres[e.id]===undefined?1:T.pres[e.id]; if(pr>=.98||e.t==="source") return; const a=info.run[0], b=info.run[info.run.length-1], du=b.u-a.u, dv=b.v-a.v, L=Math.hypot(du,dv); if(L<1e-6) return; const nu=-dv/L*HW, nv=du/L*HW, q=[[a,nu,nv],[b,nu,nv],[b,-nu,-nv],[a,-nu,-nv]].map(([p,x,y])=>corner({...p,z:0},x,y,0));
      g.save(); g.globalAlpha=1-pr; g.strokeStyle=P.mutedS; g.lineWidth=1.5; g.setLineDash([5,5]); poly4(g,q[0],q[1],q[2],q[3]); g.stroke(); g.restore(); });
  }
  /* node marks: a measuring post, a floating value, the height a node used to have */
  function drawNodeMarks(g){
    const D=T.desc, P=PAL, a1=1-M;
    Object.keys(D.nodes).forEach(id=>{ const n=D.nodes[id], z=T.zs[id]||0, q=T.nodeAt(id,M);
      if(n.gauge&&M<1){ g.save(); g.globalAlpha=a1; const top=Math.max(...n.gauge), f=iso(n.at[0],n.at[1],0), t=iso(n.at[0],n.at[1],top); g.strokeStyle=P.accentS; g.lineWidth=1.5; g.setLineDash([3,4]); g.beginPath(); g.moveTo(f[0],f[1]); g.lineTo(t[0],t[1]); g.stroke(); g.setLineDash([]);
        n.gauge.forEach(v=>{ const p=iso(n.at[0],n.at[1],v); g.strokeStyle=P.accentS; g.lineWidth=1.5; g.beginPath(); g.moveTo(p[0]-7,p[1]); g.lineTo(p[0]+7,p[1]); g.stroke(); tag(g,v+" V",p[0]+12,p[1]+4,P.accentS,labelPx(12),"left"); }); g.restore(); }
      if(n.was!==undefined&&M<1&&Math.abs(n.was-z)>.02){ const w=iso(n.at[0],n.at[1],n.was), p=iso(n.at[0],n.at[1],z); g.save(); g.globalAlpha=a1; g.strokeStyle=P.accentS; g.lineWidth=1.5; g.setLineDash([3,4]); g.beginPath(); g.moveTo(p[0],p[1]); g.lineTo(w[0],w[1]); g.stroke(); g.setLineDash([]); g.beginPath(); g.ellipse(w[0],w[1],HW*geo.sc*.9,HW*geo.sc*.34,0,0,7); g.stroke(); if((n.was-z)*geo.hs>30) tag(g,n.wasLabel||"",w[0],w[1]-HW*geo.sc*.34-6,P.mutedS,labelPx(12)); g.restore(); }
      if(n.tag) tag(g,n.tag,q[0]+(n.tagOff?n.tagOff[0]:0),q[1]+(n.tagOff?n.tagOff[1]:-14),n.tagc?P[n.tagc+"S"]:P.inkS,labelPx(clamp(geo.sc*.05,13,16)));
    });
    if(D.walk){ const w=walkAt(D,T.zs,D.walk), f=iso(w.u,w.v,0), p=iso(w.u,w.v,w.z), r=clamp(geo.sc*.032,6,10);
      g.save(); g.globalAlpha=a1; g.strokeStyle=P.inkS; g.lineWidth=1.5; g.setLineDash([2,3]); g.beginPath(); g.moveTo(f[0],f[1]); g.lineTo(p[0],p[1]-r); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.ellipse(f[0],f[1],r*.9,r*.32,0,0,7); g.fillStyle=rgb(P.shadow,.25); g.fill();
      g.beginPath(); g.arc(p[0],p[1]-r,r,0,7); g.fillStyle=P.inkS; g.fill(); g.lineWidth=2; g.strokeStyle=P.bgS; g.stroke();
      tag(g,w.z.toFixed(1)+" V",p[0],p[1]-r*2-6,P.inkS,labelPx(14)); g.restore(); }
  }
  /* meter leads, and the height difference they read */
  function drawLeads(g){
    const [r,b]=T.leads, P=PAL; const pin=(p,col)=>{ if(!p) return; const q=T.nodeAt(p.node,M); g.beginPath(); g.arc(q[0],q[1],7,0,7); g.fillStyle=col; g.fill(); g.lineWidth=2; g.strokeStyle=P.bgS; g.stroke(); };
    if(r&&b){ const a=T.nodeAt(r.node,M), c=T.nodeAt(b.node,M), za=T.zs[r.node]||0, zb=T.zs[b.node]||0, dz=Math.abs(za-zb);
      if(dz>.05&&M<1){ const low=za<zb?a:c, hi=za<zb?c:a; g.save(); g.globalAlpha=1-M; g.setLineDash([3,3]); g.lineWidth=1.5; g.strokeStyle=P.accentS; g.beginPath(); g.moveTo(low[0],low[1]); g.lineTo(low[0],low[1]-dz*geo.hs); g.lineTo(hi[0],hi[1]); g.stroke(); g.restore(); } }
    pin(r,P.accentS); pin(b,P.inkS);
  }
  function drawGapMarks(g,items){
    const P=PAL; if(M>=1) return; items.forEach(({e,info})=>{ const gap=(e.t==="switch"&&!e.closed)||(e.t==="resistor"&&e.open)||(e.t==="fuse"&&e.blown); if(!gap) return; const A=info.poly[0], B=info.poly[info.poly.length-1], dz=Math.abs(A.z-B.z); if(dz<.12) return;
      const hi=A.z>B.z?A:B, lo=A.z>B.z?B:A, t=e.t==="switch"?(A.z>B.z?.78:.22):(A.z>B.z?.62:.38), run0=info.run[0], run1=info.run[info.run.length-1], q=lerpP(run0,run1,t), p0=iso(q.u,q.v,hi.z), p1=iso(q.u,q.v,lo.z);
      g.save(); g.globalAlpha=1-M; g.strokeStyle=P.accentS; g.lineWidth=1.5; g.setLineDash([3,4]); g.beginPath(); g.moveTo(p0[0],p0[1]); g.lineTo(p1[0],p1[1]); g.stroke(); g.setLineDash([]); tag(g,fmt(dz,"V",T.desc.live?3:2),p1[0]+(p1[0]>geo.W*.7?-9:9),(p0[1]+p1[1])/2+4,P.accentS,labelPx(12),p1[0]>geo.W*.7?"right":"left"); g.restore(); });
  }
  function drawFx(g,dt){
    const P=PAL;
    for(let i=T.rings.length-1;i>=0;i--){ const r=T.rings[i]; r.t+=dt/r.dur; if(r.t>=1){ T.rings.splice(i,1); continue; } const a=T.nodeAt(r.a,0), b=T.nodeAt(r.b,0), za=T.zs[r.a]||0, zb=T.zs[r.b]||0, x=(a[0]+b[0])/2, y=(a[1]+b[1])/2+(za+zb)/2*geo.hs, e=1-(1-r.t)*(1-r.t), R=e*r.r*geo.sc;
      g.save(); g.globalAlpha=(1-r.t)*.8; g.strokeStyle=P.accentS; g.lineWidth=2+3*(1-r.t); g.beginPath(); g.ellipse(x,y,R*.95,R*.95*geo.k/geo.c,0,0,7); g.stroke(); g.restore(); }
    if(T.sparks.length){ g.lineCap="round"; g.lineWidth=2; for(let i=T.sparks.length-1;i>=0;i--){ const s=T.sparks[i]; s.life-=dt; if(s.life<=0){ T.sparks.splice(i,1); continue; } s.vy+=760*dt; const x0=s.x, y0=s.y; s.x+=s.vx*dt; s.y+=s.vy*dt; g.strokeStyle=rgb(mix(P.accent,P.hot,clamp(s.life*1.6,0,1)),clamp(s.life*2.2,0,1)); g.beginPath(); g.moveTo(x0-s.vx*.012,y0-s.vy*.012); g.lineTo(s.x,s.y); g.stroke(); } g.lineCap="butt"; }
    drawPlume(g,dt);
  }
  /* burn-out: a bite of fire, then a billowing column that keeps smouldering. Soft sprites, drawn small and cheap. */
  let puffKey="", puff=null, fire=null;
  const sprite=(col,inner)=>{ const c=document.createElement("canvas"); c.width=c.height=64; const f=c.getContext("2d"), gr=f.createRadialGradient(32,32,2,32,32,32); gr.addColorStop(0,rgb(col,inner)); gr.addColorStop(.55,rgb(col,inner*.55)); gr.addColorStop(1,rgb(col,0)); f.fillStyle=gr; f.fillRect(0,0,64,64); return c; };
  function drawPlume(g,dt){
    const P=PAL, pl=T.plume; if(!pl&&!T.smoke.length) return;
    if(puffKey!==P.key){ puffKey=P.key; puff=sprite(P.dark?[176,176,170]:[52,48,46],.95); fire=sprite(P.hot,1); }
    const S=clamp(geo.sc/300,.6,1.15);
    if(pl){ pl.age+=dt; const rate=pl.age<.5?70:pl.age<2.4?26:pl.age<8?5:0; pl.debt+=rate*dt; if(!rate&&!T.smoke.length) T.plume=null;
      while(pl.debt>=1&&T.smoke.length<130){ pl.debt-=1; const hot=pl.age<.45, life=BC.rand(1.5,3)*(pl.age<2.4?1:.8); T.smoke.push({x:pl.x+BC.rand(-pl.spread,pl.spread),y:pl.y-BC.rand(0,10),vx:BC.rand(-22,22)*S,vy:-BC.rand(55,125)*S*(pl.age<2.4?1:.55),r:BC.rand(9,20)*S*(pl.age<2.4?1:.5),grow:BC.rand(26,48)*S*(pl.age<2.4?1:.5),life,max:life,seed:BC.rand(0,6.3),hot:hot?BC.rand(.25,.55):0}); } }
    for(let i=T.smoke.length-1;i>=0;i--){ const p=T.smoke[i]; p.life-=dt; if(p.life<=0){ T.smoke.splice(i,1); continue; }
      p.vx+=Math.sin(T.clock*1.7+p.seed)*46*S*dt; p.vy*=1-.22*dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.r+=p.grow*dt; const f=p.life/p.max;
      g.globalAlpha=Math.min(1,(1-f)*7)*f*(P.dark?.5:.55); g.drawImage(puff,p.x-p.r,p.y-p.r,p.r*2,p.r*2);
      if(p.hot>0){ p.hot-=dt; if(p.hot>0){ const was=g.globalCompositeOperation; if(P.dark) g.globalCompositeOperation="lighter"; g.globalAlpha=Math.min(1,p.hot*3.4); const r=p.r*.8; g.drawImage(fire,p.x-r,p.y-r,r*2,r*2); g.globalCompositeOperation=was; } } }
    g.globalAlpha=1;
  }
  /* flow forced across an open gap: an arc, as wide as the current */
  function drawArcs(g,items){
    if(M>=.6) return; const P=PAL, Iref=T.desc.iref||.05;
    items.forEach(({e,info})=>{ if(e.t!=="switch"||e.closed||!e.Roff) return; const A=info.poly[0], B=info.poly[info.poly.length-1], dz=Math.abs(A.z-B.z), x=Math.abs((T.sol.I[e.id]||0))/Iref; if(x<.08||dz<20) return;
      const hi=A.z>B.z?A:B, lo=A.z>B.z?B:A, q=lerpP(info.run[0],info.run[info.run.length-1],A.z>B.z?.78:.22), p0=iso(q.u,q.v,hi.z), p1=iso(q.u,q.v,lo.z), n=Math.max(6,Math.floor((p1[1]-p0[1])/16)), amp=clamp(geo.sc*.05,5,14);
      const path=()=>{ g.beginPath(); g.moveTo(p0[0],p0[1]); for(let i=1;i<n;i++) g.lineTo(p0[0]+BC.rand(-amp,amp),p0[1]+(p1[1]-p0[1])*i/n); g.lineTo(p1[0],p1[1]); };
      g.save(); g.lineJoin="round"; g.lineCap="round"; path(); g.strokeStyle=rgb(P.accent,.5); g.lineWidth=2+7*Math.sqrt(x); g.stroke(); path(); g.strokeStyle=P.dark?"#fff":rgb(P.hot); g.lineWidth=1+2.4*Math.sqrt(x); g.stroke(); g.restore();
      if(!BC.reduced) for(let i=0;i<3;i++) if(Math.random()<x*1.2&&T.sparks.length<120){ const an=BC.rand(0,6.3), sp=BC.rand(40,240), f=Math.random(); T.sparks.push({x:p0[0]+BC.rand(-amp,amp),y:p0[1]+(p1[1]-p0[1])*f,vx:Math.cos(an)*sp,vy:Math.sin(an)*sp,life:BC.rand(.2,.6)}); } });
  }
  /* the time on the clock, and the honest scale of it */
  function drawClock(g,W,H){
    const ck=T.desc.clock; if(!ck) return; const P=PAL, big=clamp(geo.sc*.075,18,26), small=labelPx(12.5), y=H-10-M*38, x=10+M*geo.flatM[0];
    tag(g,ck.scale,x,y,P.mutedS,small,"left"); tag(g,ck.t,x,y-small-5,P.inkS,big,"left",600);
  }
  /* the last run, plotted: time across, one quantity up, drawn by the same steps that move the picture */
  function drawTrace(g,W,H){
    const tr=T.desc.trace; if(!tr) return; const P=PAL, w=clamp(W*.36,118,250), h=clamp(H*.24,62,130), left=tr.side==="left", x=(left?8:W-w-8)*(1-M)+(W*.58-w/2)*M, y=(left?48:8)*(1-M)+(H*.52-h/2)*M;   /* inside the loop in the schematic */
    g.fillStyle=rgb(P.bg,.86); g.strokeStyle=rgb(P.line); g.lineWidth=1; g.beginPath(); g.rect(x,y,w,h); g.fill(); g.stroke();
    const X=t=>x+6+clamp(t/tr.tMax,0,1)*(w-12), Y=v=>y+h-6-clamp(v/tr.yMax,0,1)*(h-24);
    (tr.guides||[]).forEach(gd=>{ g.strokeStyle=rgb(P.muted,.6); g.setLineDash([3,3]); g.beginPath(); g.moveTo(x+6,Y(gd.y)); g.lineTo(x+w-6,Y(gd.y)); g.stroke(); g.setLineDash([]); if(gd.t){ g.font=`500 ${labelPx(11)-1}px ${FONT.mono}`; g.textAlign="right"; g.fillStyle=P.mutedS; g.fillText(gd.t,x+w-6,Y(gd.y)-3); } });
    (tr.ticks||[]).forEach(t=>{ g.strokeStyle=rgb(P.muted,.6); g.beginPath(); g.moveTo(X(t),y+h-6); g.lineTo(X(t),y+h-11); g.stroke(); });
    g.font=`500 ${labelPx(11)-1}px ${FONT.mono}`; g.textAlign="left"; g.fillStyle=P.mutedS; g.fillText(tr.label,x+6,y+14);
    if(tr.pts2&&tr.pts2.length){ g.strokeStyle=rgb(P.muted,.9); g.lineWidth=1.5; g.setLineDash([3,3]); g.beginPath(); tr.pts2.forEach((p,i)=>i?g.lineTo(X(p[0]),Y(p[1])):g.moveTo(X(p[0]),Y(p[1]))); g.stroke(); g.setLineDash([]); }
    if(tr.pts.length){ g.strokeStyle=P.accentS; g.lineWidth=2; g.lineJoin="round"; g.beginPath(); tr.pts.forEach((p,i)=>i?g.lineTo(X(p[0]),Y(p[1])):g.moveTo(X(p[0]),Y(p[1]))); g.stroke(); const l=tr.pts[tr.pts.length-1]; g.beginPath(); g.arc(X(l[0]),Y(l[1]),3,0,7); g.fillStyle=P.accentS; g.fill(); }
  }

  function advance(dt){
    const D=T.desc;
    if(T.m!==T.target){ if(BC.reduced) T.m=T.target; else { const d=dt/.8; T.m=T.m<T.target?Math.min(T.target,T.m+d):Math.max(T.target,T.m-d); } }
    T.clock+=dt; T.flash=Math.max(0,T.flash-dt*3.2); T.shake=Math.max(0,T.shake-dt*3.4);
    const live={}; D.edges.forEach(e=>live[e.id]=1); Object.keys(T.pres).forEach(k=>{ if(!live[k]){ delete T.pres[k]; delete T.flow[k]; delete T.heat[k]; delete T.swing[k]; } });
    if(BC.reduced){ settle(); return; }
    const vt=D.vmax||18; T.vm=Math.abs(T.vm-vt)<.05?vt:T.vm+(vt-T.vm)*(1-Math.exp(-dt*5));
    D.edges.forEach(e=>{ if(e.t==="inductor") T.spin[e.id]=(T.spin[e.id]||0)-(T.sol.I[e.id]||0)/(D.iref||.05)*7*dt; });
    /* heights ride a damped spring: a ledge dropping lands with a little weight. A live circuit has its own time, so its heights only smooth over a jump. */
    const K=110, C=2*.74*Math.sqrt(K);
    if(D.live){ const a=1-Math.exp(-dt*26); for(const k in T.sol.v){ const tg=D.clip?Math.max(0,T.sol.v[k]):T.sol.v[k], z=T.zs[k]===undefined?tg:T.zs[k]; T.zs[k]=z+(tg-z)*a; T.zv[k]=0; } }
    else for(const k in T.sol.v){ const tg=T.sol.v[k], z=T.zs[k]===undefined?tg:T.zs[k], v=T.zv[k]||0, nv=v+(K*(tg-z)-C*v)*dt, nz=z+nv*dt; T.zs[k]=Math.abs(nz-tg)<1e-4&&Math.abs(nv)<1e-3?tg:nz; T.zv[k]=nv; }
    D.edges.forEach(e=>{ const h=T.heat[e.id]||0, ht=heatTarget(e); T.heat[e.id]=h+(ht-h)*Math.min(1,dt*(ht>h?2.8:4.5));
      const Ia=Math.abs(T.sol.I[e.id]||0), f=T.flow[e.id]===undefined?0:T.flow[e.id]; T.flow[e.id]=D.live?Ia:Ia<1e-9&&f<(D.iref||.05)*.002?0:f+(Ia-f)*Math.min(1,dt*7);
      const pt=e.ghost?0:1, p=T.pres[e.id]===undefined?0:T.pres[e.id]; T.pres[e.id]=p<pt?Math.min(pt,p+dt*2.1):Math.max(pt,p-dt*3);
      if(e.t==="switch"||TYPES[e.t].gate){ const sw=T.swing[e.id]===undefined?swing0(e):T.swing[e.id], tg=swing0(e); T.swing[e.id]=sw<tg?Math.min(tg,sw+dt*5):Math.max(tg,sw-dt*7); } });
  }
  T.frame=dt=>{
    if(!T.desc||!cv.offsetParent) return;
    const dpr=Math.min(window.devicePixelRatio||1,2), W=cv.clientWidth||300, H=cv.clientHeight||200;
    if(cv.width!==Math.round(W*dpr)||cv.height!==Math.round(H*dpr)){ cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr); }
    const g=cv.getContext("2d"); g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,W,H);
    const P=pal(); if(!FONT.mono||FONT.key!==P.key){ const cs=getComputedStyle(document.documentElement); FONT.mono=cs.getPropertyValue("--f-mono"); FONT.display=cs.getPropertyValue("--f-display"); FONT.key=P.key; }
    fit(W,H); advance(dt); index();
    M=smooth(T.m);
    boxes=[];
    const D=T.desc, items=D.edges.map(e=>({e,info:polyOf(e)}));
    items.forEach(it=>{ it.c=context(it.e,it.info,g); if(it.c.pres>.01) TYPES[it.e.t].solid(it.c); });
    /* landings */
    Object.keys(layout.pad).forEach(id=>{ if(layout.tower[id]) return; const n=D.nodes[id], s=layout.pad[id], touching=D.edges.filter(e=>(e.a===id||e.b===id)), pr=touching.reduce((a,e)=>Math.max(a,T.pres[e.id]===undefined?1:T.pres[e.id]),0); if(pr<.01) return; const z=(T.zs[id]||0)*pr, F=nodeF(n), mk=u=>({u,v:n.at[1],z,fu:F[0],fv:F[1]}); boxes.push(mkBox("n:"+id,mk(n.at[0]-s),mk(n.at[0]+s),{hw:s})); });
    g.save();
    if(T.shake>0&&!BC.reduced) g.translate(Math.sin(T.clock*71)*7*T.shake*T.shake,Math.cos(T.clock*93)*5*T.shake*T.shake);
    moveStreams(items,dt);
    drawFloor(g,W,H,dpr);
    drawShadows(g,W,H);
    drawGlows(g,items);
    drawPrint(g,items);
    drawGhosts(g,items);
    solidA=1-clamp((M-.55)/.4,0,1);
    if(solidA>0){ g.globalAlpha=solidA; orderBoxes().forEach(i=>drawBox(g,boxes[i])); g.globalAlpha=1; }
    drawGapMarks(g,items);
    drawTies(g,items);
    if(M>.3){ g.globalAlpha=clamp((M-.3)/.45,0,1); items.forEach(it=>{ it.c.p=it.info.full.map(q=>T.project(q,M)); it.c.line=()=>{ g.strokeStyle=PAL.inkS; g.lineWidth=2.5; g.lineJoin="round"; g.beginPath(); it.c.p.forEach((q,i)=>i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1])); g.stroke(); }; if(!it.e.ghost) TYPES[it.e.t].symbol(it.c); }); g.globalAlpha=1; }
    items.forEach(({e,info})=>{ if(!e.inner) streamOf(g,e,info); });
    drawLights(g,items);
    drawNodeMarks(g);
    drawLeads(g);
    items.forEach(({e,info})=>{ if(!e.tag||(e.t==="source"&&M<.6)) return; const b=e.tagAt==="a"?info.full[0]:info.full[info.full.length-1], p=T.project(b,M), o=e.tagOff||[0,-14], f=e.tagf||o; tag(g,e.tag,p[0]+o[0]+(f[0]-o[0])*M,p[1]+o[1]+(f[1]-o[1])*M,e.tagc?P[e.tagc+"S"]:P.inkS,labelPx(clamp(geo.sc*.058,13,18)),e.align||"center",600); });
    drawArcs(g,items);
    drawFx(g,dt);
    drawTrace(g,W,H);
    drawClock(g,W,H);
    if(T.flash>0&&!BC.reduced){ g.globalAlpha=T.flash*(P.dark?.28:.42); g.fillStyle=P.dark?rgb(P.hot):"#fff"; g.fillRect(-10,-10,W+20,H+20); g.globalAlpha=1; }
    if(M<.5&&!T.grabbing) T.grips.forEach(gp=>{ const q=T.gripAt(gp); if(!q) return; const pu=BC.reduced?.3:(Math.sin(T.clock*3)+1)/2; g.beginPath(); g.arc(q[0],q[1],9+pu*2.5,0,7); g.fillStyle=P.dark?"rgba(255,255,255,.14)":"rgba(255,255,255,.55)"; g.fill(); g.strokeStyle=P.inkS; g.lineWidth=1.5; g.stroke(); g.beginPath(); g.arc(q[0],q[1],2.5,0,7); g.fillStyle=P.inkS; g.fill(); });
    if(T.ring){ const a=T.nodeAt(T.ring.a,M), b=T.nodeAt(T.ring.b,M), x=(a[0]+b[0])/2, y=(a[1]+b[1])/2, R=clamp(Math.hypot(a[0]-b[0],a[1]-b[1])*.75,22,34), pu=BC.reduced?0:(T.clock*.9)%1; g.save(); g.strokeStyle=P.accentS; g.setLineDash([4,3]); g.lineWidth=1.5; g.beginPath(); g.arc(x,y,R,0,7); g.stroke(); g.setLineDash([]); if(pu){ g.globalAlpha=(1-pu)*.7; g.beginPath(); g.arc(x,y,R+pu*16,0,7); g.stroke(); } g.restore(); }
    g.restore();
    T.overlay();
  };
  return T;
}

/* ---------- number formats ---------- */
const amps=i=>Math.abs(i)<1e-7?"0 A":fmt(Math.abs(i),"A");
const watts=p=>p<5e-4?"0 W":p<100?+p.toPrecision(3)+" W":Math.round(p)+" W";
const volts=v=>fmt(v,"V");
const RATING={.125:"⅛ W",.25:"¼ W",.5:"½ W",1:"1 W",2:"2 W"};
const round3=x=>+x.toPrecision(3);

/* ---------- the series loop used by module 1: a source with internal resistance, resistor, switch, optional fuse and shorting wire ---------- */
const INNER_R=.5, FUSE_A=1;
function loopCircuit(s){
  const nodes={g:{at:[0,.8]},e:{at:[0,.8],flat:[0,.3]},t:{at:[0,.46],flat:[0,.3]},f1:{at:[0,.38],flat:[0,.22]},f2:{at:[0,.16],flat:[0,.06]},n0:{at:[0,0]},ra:{at:[.14,0],flat:[.62,0]},rb:{at:[1.82,0],flat:[1.38,0]},c1:{at:[2,0]},sa:{at:[2,.2]},sb:{at:[2,.52]},c2:{at:[2,.8]}};
  const rLabel=fmt(s.R,"Ω")+(s.rating?" · "+RATING[s.rating]:"");
  const edges=[
   {id:"src",t:"source",a:"g",b:"e",V:s.V,box:.15,tag:s.V.toFixed(s.V%1?1:0)+" V",tagOff:[0,-12],tagf:[-30,44]},
   {id:"rs",t:"resistor",a:"e",b:"t",R:INNER_R,rating:20,inner:true,tag:s.showInner?INNER_R+" Ω inside":"",tagAt:"a",tagOff:[0,-58],tagf:[16,0]},
   {id:"w0",t:"wire",a:"t",b:"f1"},
   s.fuse?{id:"fu",t:"fuse",a:"f1",b:"f2",blown:s.fuse==="blown",label:s.fuse==="blown"?"blown":FUSE_A+" A",lab:[.3,.04],labf:[-22,0]}:{id:"fu",t:"wire",a:"f1",b:"f2"},
   {id:"w1",t:"wire",a:"f2",b:"n0"},{id:"w2",t:"wire",a:"n0",b:"ra"},
   {id:"R",t:"resistor",a:"ra",b:"rb",R:s.R,rating:s.rating||2,open:s.burnt,label:s.burnt?"burned open":rLabel,lab:[0,.27],labf:[0,28],labc:s.burnt?"accent":null},
   {id:"w3",t:"wire",a:"rb",b:"c1"},{id:"w4",t:"wire",a:"c1",b:"sa"},
   {id:"sw",t:"switch",a:"sa",b:"sb",closed:s.closed},
   {id:"w5",t:"wire",a:"sb",b:"c2"},{id:"w6",t:"wire",a:"c2",b:"g"}
  ];
  if(s.shorted) edges.push({id:"sh",t:"wire",a:"ra",b:"rb",hw:.042,via:[[.14,-.115],[1.82,-.115]]});
  return {gnd:"g",vmax:18,iref:.06,rspan:[100,4700],nodes,edges};
}
const loop={
  circuit:loopCircuit,
  fresh:()=>({V:9,R:470,closed:true,rating:null,burnt:false,shorted:false,fuse:null,peak:0,over:0,blow:0,Vgoal:null,showInner:false}),
  /* one tick of slow things. Returns an event name when a part fails. */
  tick(s,sol,dt){
    let ev=null;
    if(s.Vgoal!==null){ if(BC.reduced) s.V=s.Vgoal; else { const d=dt*s.Vrate; s.V=s.V<s.Vgoal?Math.min(s.Vgoal,s.V+d):Math.max(s.Vgoal,s.V-d); } if(s.V===s.Vgoal) s.Vgoal=null; }
    const Ir=Math.abs(sol.I.R), P=Ir*Ir*s.R, Is=Math.abs(sol.I.src); s.peak=Math.max(s.peak,Is);
    if(s.rating&&!s.burnt&&P>s.rating){ s.over+=dt; if(BC.reduced||s.over>clamp(1.4/(P/s.rating),.45,1.4)){ s.burnt=true; s.at={V:s.V,R:s.R}; s.over=0; ev="burn"; } } else if(!s.burnt) s.over=0;
    if(s.fuse==="ok"&&Is>FUSE_A){ s.blow+=dt; if(BC.reduced||s.blow>1.2){ s.fuse="blown"; ev="blow"; } }
    return ev;
  },
  busy:s=>s.Vgoal!==null,
  /* readout cells */
  ro:{
    I:["Current",(s,o)=>amps(o.I.src)], V:["Supply",s=>volts(s.V)], P:["Power",(s,o)=>watts(o.I.R*o.I.R*s.R)], rate:["Rating",s=>s.rating?RATING[s.rating]:"—"],
    peak:["Peak",s=>amps(s.peak)], Psrc:["In source",s=>watts(s.peak*s.peak*INNER_R)]
  },
  val:{I:(s,o)=>Math.abs(o.I.src), V:s=>s.V},
  fail:{burn:"R",blow:"fu"},
  alt:(s,o)=>`supply ${s.V} volts, resistor ${s.burnt?"burned open":s.R+" ohms"}, ${s.closed?"switch closed":"switch open"}, current ${amps(o.I.src)}.`
};

/* ---------- module 2's network on one 5 V bench: a series fall with an optional load off its middle, or parallel paths between two rails ---------- */
const solveMid=s=>{ const R2=s.load?s.R2*s.RL/(s.R2+s.RL):s.R2; return s.V*R2/(s.R1+R2); };
function serCircuit(s){
  const v=!!s.veil, nodes={g:{at:[0,.86]},e:{at:[0,.86],flat:[0,.3]},a:{at:[0,0]},ra:{at:[.18,0]},m:{at:[1.08,0],pad:1},rb:{at:[1.98,0]},c1:{at:[2.16,0]},c2:{at:[2.16,.86]},f:{at:[1.08,.86]}};
  if(v) nodes.m.gauge=s.gauge;
  else if(s.pos===null){ nodes.m.tag=volts(solveMid(s)); nodes.m.tagOff=[0,-HW*2]; }
  if(s.was) { nodes.m.was=s.was; nodes.m.wasLabel=volts(s.was); }
  const edges=[
   {id:"src",t:"source",a:"g",b:"e",V:s.V,box:.15,tag:s.V+" V",tagOff:[0,-12],tagf:[-30,44]},
   {id:"w0",t:"wire",a:"e",b:"a"},{id:"w1",t:"wire",a:"a",b:"ra"},
   {id:"R1",t:"resistor",a:"ra",b:"m",R:s.R1,ghost:v,label:fmt(s.R1,"Ω"),lab:[0,.25],labf:[0,-20]},
   {id:"R2",t:"resistor",a:"m",b:"rb",R:s.R2,ghost:v,label:fmt(s.R2,"Ω"),lab:[0,.25],labf:[0,-20]},
   {id:"w2",t:"wire",a:"rb",b:"c1"},{id:"w3",t:"wire",a:"c1",b:"c2"},{id:"w4",t:"wire",a:"c2",b:"f"}];
  if(s.load!==null) edges.push({id:"RL",t:"resistor",a:"m",b:"f",R:s.RL,ghost:!s.load,label:fmt(s.RL,"Ω"),lab:[.25,0],labf:[34,0]});
  edges.push({id:"w5",t:"wire",a:"f",b:"g"});
  const d={gnd:"g",vmax:5.5,iref:.015,pref:.05,rspan:[220,10000],nodes,edges};
  if(s.pos!==null) d.walk={path:["g","e","a","ra","m","rb","c1","c2","f","g"],t:s.pos};
  return d;
}
function parCircuit(s){
  const nodes={g:{at:[0,.86]},e:{at:[0,.86],flat:[0,.3]},a:{at:[0,0]},j1:{at:[.58,0]},j2:{at:[1.22,0]},j3:{at:[1.86,0]},k1:{at:[.58,.86]},k2:{at:[1.22,.86]},k3:{at:[1.86,.86]},corner:{at:[2.16,.86]}};
  const I=(R,on)=>on&&s.V?amps(s.V/R):"", br=(id,a,b,R,on)=>({id,t:"resistor",a,b,R,ghost:!on,label:on?[fmt(R,"Ω"),I(R,on)]:[fmt(R,"Ω")],lab:[.27,.2],labf:[38,0]});
  const n2=s.n>=2, n3=s.n>=3, shown=k=>s.n>=k||s.next===k;
  const edges=[
   {id:"src",t:"source",a:"g",b:"e",V:s.V,box:.15,tag:s.V+" V",tagOff:[0,-12],tagf:[-30,44]},
   {id:"w0",t:"wire",a:"e",b:"a"},{id:"w1",t:"wire",a:"a",b:"j1"},
   br("Ra","j1","k1",s.Ra,true)];
  if(shown(2)) edges.push({id:"w2",t:"wire",a:"j1",b:"j2",ghost:!n2},br("Rb","j2","k2",s.Rb,n2));
  if(shown(3)) edges.push({id:"w3",t:"wire",a:"j2",b:"j3",ghost:!n3},br("Rc","j3","k3",s.Rc,n3),{id:"w4",t:"wire",a:"k3",b:"k2",ghost:!n3});
  if(shown(2)) edges.push({id:"w5",t:"wire",a:"k2",b:"k1",ghost:!n2});
  edges.push({id:"w6",t:"wire",a:"k1",b:"g"});
  return {gnd:"g",vmax:5.5,iref:.015,pref:.05,rspan:[220,10000],nodes,edges};
}
const NET_R1=1000, NET_V=5;
const midOpen=s=>s.V*s.R2/(s.R1+s.R2);
const net={
  circuit:s=>s.shape==="par"?parCircuit(s):serCircuit(s),
  fresh:()=>({shape:"ser",V:NET_V,R1:NET_R1,R2:NET_R1,RL:1000,load:null,veil:false,gauge:null,was:null,pos:null,n:1,next:0,Ra:1000,Rb:2000,Rc:1000,age:0,revealed:false}),
  tick(s,sol,dt){ if(s.revealed) s.age+=dt; return null; },
  busy:()=>false,
  ro:{
   V:["Supply",s=>volts(s.V)], I:["Flow",(s,o)=>s.veil?"?":amps(o.I.src)], mid:["Middle",(s,o)=>s.veil?"?":volts(o.v.m)],
   sag:["Sag",(s,o)=>s.was&&s.load?(100*(1-o.v.m/s.was)).toFixed(1)+"%":"0%"],
   at:["Height",(s,o)=>walkAt(net.circuit(s),o.v,{path:WALK,t:s.pos}).z.toFixed(1)+" V"],
   up:["Climbed",(s,o)=>walkAt(net.circuit(s),o.v,{path:WALK,t:s.pos}).up.toFixed(1)+" V"],
   down:["Fallen",(s,o)=>walkAt(net.circuit(s),o.v,{path:WALK,t:s.pos}).down.toFixed(1)+" V"],
   a:["Path 1",(s,o)=>amps(o.I.Ra)], b:["Path 2",(s,o)=>s.n>=2?amps(o.I.Rb):"?"], tot:["Total",(s,o)=>s.next===2&&s.n<2?"?":amps(o.I.src)],
   Rt:["Total R",(s,o)=>s.next===3&&s.n<3?"?":fmt(s.V/Math.abs(o.I.src),"Ω")]
  },
  val:{mid:(s,o)=>o.v.m, tot:(s,o)=>Math.abs(o.I.src)},
  fail:{},
  alt:(s,o)=>s.shape==="par"?`${s.n} parallel paths from ${s.V} volts to the floor, total ${amps(o.I.src)}.`:`${s.V} volts falling through ${s.R1} ohms then ${s.R2} ohms, ${s.veil?"middle hidden":"middle at "+volts(o.v.m)}${s.load?", load "+s.RL+" ohms":""}.`
};
const WALK=["g","e","a","ra","m","rb","c1","c2","f","g"];
const reveal=s=>{ s.revealed=true; s.age=0; }, settledSoon=s=>BC.reduced||s.age>1.1;

/* ---------- lessons ---------- */
/* ---------- module 5: circuits with memory, stepped in real model time ----------
   The supply is ideal. The relay-like coil is 100 mH and 120 Ω. The open switch leaks 3 kΩ: that stated path is what limits the spike. Display time is model time times s.slow. */
const TK={V:9,R:1e5,C:1e-5}, CO={V:12,R:120,L:.1,Roff:3000,Vf:.7,Ron:.05,slow:1000,slowOpen:100000};
const tauOf=s=>s.shape==="rl"?CO.L/(CO.R+(s.closed||s.diode?0:CO.Roff)):s.R*s.C;
const tankBox=C=>.1+.085*Math.log10(C/1e-6);
const secs=t=>t<=0?"0 s":fmt(t,"s",3);
function tankCircuit(s){
  const nodes={g:{at:[0,.8]},e:{at:[0,.8],flat:[0,.3]},n0:{at:[0,0]},sa:{at:[.16,0]},sb:{at:[.5,0]},ra:{at:[.62,0]},c:{at:[1.7,0]},tp:{at:[1.7,.38],flat:[1.7,.24]},tb:{at:[1.7,.38],flat:[1.7,.56]},f:{at:[1.7,.8]},j:{at:[.62,.8]},da:{at:[.62,.22]},db:{at:[.62,.54]}};
  const marks=[{z:s.V}]; if(s.mark) marks.push({z:s.mark,t:Math.round(s.mark/s.V*100)+"%"});
  const edges=[
   {id:"src",t:"source",a:"g",b:"e",V:s.V,box:.15,tag:s.V+" V",tagOff:[0,-12],tagf:[-30,44]},
   {id:"w0",t:"wire",a:"e",b:"n0"},{id:"w1",t:"wire",a:"n0",b:"sa"},
   {id:"sw",t:"switch",a:"sa",b:"sb",closed:s.closed},
   {id:"w2",t:"wire",a:"sb",b:"ra"},
   {id:"R",t:"resistor",a:"ra",b:"c",R:s.R,label:fmt(s.R,"Ω"),lab:[-.3,.3],labf:[0,28]},
   {id:"w3",t:"wire",a:"c",b:"tp"},
   {id:"C",t:"capacitor",a:"tp",b:"tb",C:s.C,v0:s.vc,box:tankBox(s.C),rim:s.V+1.4,marks,capLabel:fmt(s.C,"F")},
   {id:"w4",t:"wire",a:"tb",b:"f"},{id:"w5",t:"wire",a:"f",b:"j"},{id:"w6",t:"wire",a:"j",b:"g"}
  ];
  if(s.drainPath) edges.push({id:"w7",t:"wire",a:"ra",b:"da"},{id:"dr",t:"switch",a:"da",b:"db",closed:s.drain},{id:"w8",t:"wire",a:"db",b:"j"});
  return {gnd:"g",vmax:12,iref:1.5e-4,pref:.5,rspan:[1e4,1e6],live:true,nodes,edges,clock:clockOf(s),trace:traceOf(s)};
}
function coilCircuit(s){
  const nodes={g:{at:[0,.8]},e:{at:[0,.8],flat:[0,.3]},n0:{at:[0,0]},ra:{at:[.14,0],flat:[.25,0]},rb:{at:[.72,0],flat:[.8,0]},la:{at:[.86,0],flat:[1,0]},lb:{at:[1.84,0],flat:[1.7,0]},c1:{at:[2,0]},sa:{at:[2,.2]},sb:{at:[2,.52]},c2:{at:[2,.8]}};
  const edges=[
   {id:"src",t:"source",a:"g",b:"e",V:CO.V,box:.15,tag:CO.V+" V",tagOff:[0,-12],tagf:[-30,44]},
   {id:"w0",t:"wire",a:"e",b:"n0"},{id:"w1",t:"wire",a:"n0",b:"ra"},
   {id:"R",t:"resistor",a:"ra",b:"rb",R:CO.R,rating:2,label:fmt(CO.R,"Ω"),lab:[0,.25],labf:[0,28]},
   {id:"w2",t:"wire",a:"rb",b:"la"},
   {id:"L",t:"inductor",a:"la",b:"lb",L:CO.L,i0:s.iL,label:fmt(CO.L,"H"),lab:[.04,.2],labf:[0,28]},
   {id:"w3",t:"wire",a:"lb",b:"c1"},{id:"w4",t:"wire",a:"c1",b:"sa"},
   {id:"sw",t:"switch",a:"sa",b:"sb",closed:s.closed,Roff:CO.Roff,label:s.leak?fmt(CO.Roff,"Ω")+" leak":null,lab:[-.66,.08],labf:[-92,0]},
   {id:"w5",t:"wire",a:"sb",b:"c2"},{id:"w6",t:"wire",a:"c2",b:"g"}
  ];
  if(s.diodeOn) edges.push({id:"D",t:"diode",a:"c1",b:"n0",via:[[2,-.13,1.9,.2],[0,-.13,.1,.2]],Vf:CO.Vf,Ron:CO.Ron,ghost:!s.diode});
  return {gnd:"g",vmax:s.vm,iref:.1,live:true,nodes,edges,clock:clockOf(s),trace:traceOf(s)};
}
const clockOf=s=>({t:"t = "+secs(s.t),scale:(s.slow>1?`shown ${s.slow.toLocaleString("en")}× slower`:"real speed")+(BC.reduced?", in steps":"")});
function traceOf(s){
  if(s.shape==="rl"&&s.leak&&!s.diodeOn&&s.closed) return null;   /* the spike's plot takes its corner when the spike comes */
  if(s.shape==="rc"){ const tau=s.R*s.C, guides=[{y:s.V,t:s.V+" V"}]; if(s.mark) guides.push({y:s.mark}); return {label:"Level",pts:s.tr,tMax:5*tau,yMax:s.V*1.06,guides,ticks:[tau,2*tau,3*tau,4*tau]}; }
  if(s.closed&&s.trI){ const tau=CO.L/CO.R; return {label:"Flow",pts:s.tr,tMax:5*tau,yMax:.11,guides:[{y:.1,t:"100 mA"}],ticks:[tau,2*tau,3*tau,4*tau]}; }
  const tau=tauOf(s); return {side:s.diode?"right":"left",label:"Gap height",pts:s.tr,tMax:5*tau,yMax:s.diode?18:1.04*CO.V/CO.R*CO.Roff,guides:[{y:CO.V,t:s.diode?CO.V+" V":null}]};
}
/* throw the coil's switch open: time slows to the new, far shorter timescale unless the diode keeps it slow */
function openCoil(s){ s.closed=false; s.stop=null; s.t=0; s.tr=[]; s.trI=false; s.peak=0; s.slow=s.diode?CO.slow:CO.slowOpen; if(!s.diode){ s.vm=Math.max(18,s.iL*CO.Roff/1.7); s.spiked=true; } }
const timed={
  circuit:s=>s.shape==="rl"?coilCircuit(s):tankCircuit(s),
  fresh:()=>({shape:"rc",V:TK.V,R:TK.R,C:TK.C,closed:false,drain:false,drainPath:false,vc:0,iL:0,diode:false,diodeOn:false,leak:false,t:0,slow:1,hold:0,stop:null,retime:false,key:0,fillT:null,tr:[],trI:false,peak:0,gapV:0,vm:18,mark:0,atTau:null,spiked:false}),
  running:s=>(s.closed||s.drain||(s.shape==="rl"&&Math.abs(s.iL)>1e-6))&&(s.stop===null||s.t<s.stop-1e-12)&&s.t<8*tauOf(s),
  quantum:s=>tauOf(s)*.25*s.slow,
  tick(s,sol,dt){
    if(s.retime&&s.R*s.C!==s.key){ s.key=s.R*s.C; s.t=0; s.vc=0; s.fillT=null; s.tr=[]; s.hold=BC.reduced?0:.3; }
    if(s.shape==="rl"&&sol.v.sa!==undefined){ s.gapV=sol.v.sa; s.peak=Math.max(s.peak,s.gapV); }
    let ev=null; if(s.spiked){ s.spiked=false; ev="spike"; }
    if(!dt||!timed.running(s)) return ev;
    if(s.hold>0){ s.hold-=dt; return ev; }
    const tau=tauOf(s); let run=dt/s.slow;
    if(s.t<tau) run=Math.min(run,tau-s.t);   /* land exactly on one time constant */
    if(s.stop!==null) run=Math.min(run,s.stop-s.t);
    const d=timed.circuit(s), o=timeStep(d,run,tau/800,BC.reduced?256:16); s.t+=run;
    if(s.shape==="rl"){ s.iL=d.edges.find(e=>e.id==="L").i0; } else { s.vc=d.edges.find(e=>e.id==="C").v0; if(s.retime&&s.fillT===null&&s.vc>=.95*s.V) s.fillT=s.t; }
    if(s.atTau===null&&s.t>=tau-1e-12) s.atTau=s.vc;
    const y=s.shape==="rc"?s.vc:s.trI?Math.abs(s.iL):o.v.sa, n=s.tr.length, tr=traceOf(s); if(tr&&(!n||s.t-s.tr[n-1][0]>=tr.tMax/240)) s.tr.push([s.t,y]);
    return ev;
  },
  busy:()=>false,
  ro:{
   level:["Tank level",s=>volts(+s.vc.toFixed(3))], flow:["Flow",(s,o)=>amps(o.I.R)], pct:["Filled",s=>Math.round(s.vc/s.V*100)+"%"],
   fill:["To 95%",s=>s.fillT===null?"—":s.fillT.toFixed(2)+" s"], gap:["At the gap",s=>volts(+s.gapV.toFixed(2))], peak:["Peak",s=>s.peak>.05&&!s.closed?volts(+s.peak.toFixed(2)):"—"]
  },
  val:{fill:s=>s.fillT},
  fail:{spike:"sw"}, clean:{spike:true},
  alt:(s,o)=>s.shape==="rc"?`time ${secs(s.t)}, tank level ${volts(s.vc)} of ${s.V} volts, flow ${amps(o.I.R)}, ${s.R} ohms, ${fmt(s.C,"F")}.`:`time ${secs(s.t)}, ${s.slow} times slower, switch ${s.closed?"closed":"open"}, flow ${amps(o.I.R)}, height at the gap ${volts(s.gapV)}.`
};

/* ---------- modules 6-8: a one-way ledge, a gate on the slope, and light ----------
   Stated models. Diode: a fixed step Vf (silicon 0.7 V, Schottky 0.32 V, LED by colour) then 0.01 Ω; a Zener also holds 5.1 V in reverse. Reversing the battery is drawn as the diode facing the other way.
   BJT: Ic = 100 x Ib until the load limits it; fully open it keeps 0.2 V and 0.1 Ω. MOSFET: off below 2 V of gate height; Ids = 0.3 (Vgs - 2)² until the channel is wide open. Gate flow is zero. A floating gate is a stray source coupled in through 1 MΩ. */
const DI={Vf:.7,Vsch:.32,Vz:5.1,Ron:.01,Rs:220}, DKIND={si:["Silicon",DI.Vf],sch:["Schottky",DI.Vsch]};
const stepV=(o,a,b)=>volts(+Math.abs(o.v[a]-o.v[b]).toFixed(2));
function diodeCircuit(s){
  const zen=s.mode==="zen", dk=DKIND[s.kind];
  /* da, db are the diode's two ends in both layouts */
  const nodes={g:{at:[0,.8]},e:{at:[0,.8],flat:[0,.3]},n0:{at:[0,0]},ra:{at:[zen?.14:1,0]},db:{at:[zen?.9:.9,0]},da:{at:[zen?1.8:.2,0]},rb:{at:[1.82,0]},c1:{at:[2,0]},c2:{at:[2,.8]}};
  const src={id:"src",t:"source",a:"g",b:"e",V:s.V,box:.15,tag:s.V.toFixed(s.V%1?1:0)+" V",tagOff:[0,-12],tagf:[-30,44]};
  const Rl=(R,lab)=>({id:"R",t:"resistor",a:"ra",b:zen?"db":"rb",R,rating:s.rate||2,label:fmt(R,"Ω"),lab:[0,.27],labf:[0,28]});
  let edges;
  if(zen) edges=[src,{id:"w0",t:"wire",a:"e",b:"n0"},{id:"w1",t:"wire",a:"n0",b:"ra"},Rl(s.R),
    {id:"D",t:"diode",a:"da",b:"db",Vf:DI.Vf,Vz:DI.Vz,Ron:DI.Ron,rating:.5,label:"Zener "+DI.Vz+" V",lab:[0,.27],labf:[0,-26]},
    {id:"w2",t:"wire",a:"da",b:"c1"},{id:"w3",t:"wire",a:"c1",b:"c2"},{id:"w4",t:"wire",a:"c2",b:"g"}];
  else edges=[src,{id:"w0",t:"wire",a:"e",b:"n0"},{id:"w1",t:"wire",a:"n0",b:"da"},
    {id:"D",t:"diode",a:s.rev?"db":"da",b:s.rev?"da":"db",Vf:dk[1],Ron:DI.Ron,rating:.5,label:dk[0]+" "+dk[1]+" V",lab:[0,.27],labf:[0,-26]},
    {id:"w2",t:"wire",a:"db",b:"ra"},Rl(s.R),{id:"w3",t:"wire",a:"rb",b:"c1"},{id:"w4",t:"wire",a:"c1",b:"c2"},{id:"w5",t:"wire",a:"c2",b:"g"}];
  return {gnd:"g",vmax:12,iref:.06,pref:s.rate||2,rspan:[10,2000],nodes,edges};
}
const diodeSolve=s=>solve(diodeCircuit(s));
const diodes={
  circuit:diodeCircuit,
  fresh:()=>({mode:"dio",V:0,R:100,kind:"si",rev:false,rate:2,Vgoal:null,Vrate:3}),
  tick(s,sol,dt){ if(s.Vgoal!==null){ if(BC.reduced) s.V=s.Vgoal; else { const d=dt*s.Vrate; s.V=s.V<s.Vgoal?Math.min(s.Vgoal,s.V+d):Math.max(s.Vgoal,s.V-d); } if(s.V===s.Vgoal) s.Vgoal=null; } return null; },
  busy:s=>s.Vgoal!==null,
  ro:{ V:["Supply",s=>volts(+s.V.toFixed(1))], I:["Flow",(s,o)=>amps(o.I.D)], drop:["Diode drop",(s,o)=>stepV(o,"da","db")], rdrop:["Across R",(s,o)=>volts(+(Math.abs(o.I.R)*s.R).toFixed(2))],
    heat:["Diode heat",(s,o)=>watts(Math.abs(o.I.D)*Math.abs(o.v.da-o.v.db))], out:["Output",(s,o)=>volts(+o.v.db.toFixed(2))] },
  val:{I:(s,o)=>Math.abs(o.I.D)},
  fail:{},
  alt:(s,o)=>s.mode==="zen"?`supply ${s.V} volts, Zener holds the output at ${volts(o.v.db)}, flow ${amps(o.I.D)}.`:`supply ${s.V} volts, ${DKIND[s.kind][0]} diode ${s.rev?"reversed":"forward"}, drop across it ${stepV(o,"da","db")}, flow ${amps(o.I.D)}.`
};

const TR={V:9,Rl:30,hFE:100,Vbe:.7,Vsat:.2,Rsat:.1,Vth:2,k:.3,Rpd:1e4,Rstray:1e6};
const trVn=s=>Math.max(0,2.7+1.2*Math.sin(2.1*s.t)+.5*Math.sin(5.3*s.t+1));
function transCircuit(s){
  const mos=s.mode==="mos", Imax=mos?TR.V/(TR.Rl+.5):(TR.V-TR.Vsat)/(TR.Rl+TR.Rsat);
  const nodes={g:{at:[0,.86]},e:{at:[0,.86],flat:[0,.3]},a:{at:[0,0]},j1:{at:[.6,0]},j2:{at:[1.5,0]},col:{at:[1.5,.4]},k1:{at:[.6,.86]},k2:{at:[1.5,.86]}};
  const edges=[{id:"src",t:"source",a:"g",b:"e",V:TR.V,box:.15,tag:TR.V+" V",tagOff:[0,-12],tagf:[-30,44]},
   {id:"w0",t:"wire",a:"e",b:"a"},{id:"w1",t:"wire",a:"a",b:"j1"},{id:"w2",t:"wire",a:"j1",b:"j2"},
   {id:"RL",t:"resistor",a:"j2",b:"col",R:TR.Rl,rating:4,label:"Load "+TR.Rl+" Ω",lab:[-.27,0],labf:[-34,0]},{id:"w3",t:"wire",a:"k2",b:"k1"}];
  if(!mos){
    nodes.bn={at:[.6,.4]};
    const Rb=s.Ib>0?(TR.V-TR.Vbe)/s.Ib:1e12;
    edges.push({id:"Rb",t:"resistor",a:"j1",b:"bn",R:Rb,rating:1,label:s.Ib>0?fmt(Rb,"Ω"):"",lab:[-.27,0],labf:[-34,0]},
      {id:"BE",t:"diode",a:"bn",b:"k1",Vf:TR.Vbe,Ron:.05,rating:1},
      {id:"Q",t:"bjt",a:"col",b:"k2",base:"BE",ctl:"bn",hFE:TR.hFE,Vsat:TR.Vsat,Rsat:TR.Rsat,Imax,rating:.5},{id:"w4",t:"wire",a:"k1",b:"g"});
  } else {
    Object.assign(nodes,{kg:{at:[.25,.86]},gd:{at:[.25,.86],flat:[.25,.5]},gt:{at:[.6,.4]}});
    const vg=s.float?trVn(s):s.Vg;
    edges.push({id:"gs",t:"source",a:"kg",b:"gd",V:s.Vg,box:.11,tag:volts(+s.Vg.toFixed(2)),tagOff:[0,-12],tagf:[-22,30]},
      {id:"gsw",t:"switch",a:"gd",b:"gt",closed:!s.float,},
      {id:"PD",t:"resistor",a:"gt",b:"k1",R:TR.Rpd,ghost:!s.pd,label:fmt(TR.Rpd,"Ω"),lab:[.27,0],labf:[34,0]},
      {id:"Q",t:"mosfet",a:"col",b:"k2",ctl:"gt",k:TR.k,Vth:TR.Vth,Imax,rating:.5},{id:"w4",t:"wire",a:"k1",b:"kg"},{id:"w5",t:"wire",a:"kg",b:"g"});
    if(s.float) edges.push({id:"st",t:"stray",a:"kg",b:"gt",G:1/TR.Rstray,V:vg});
  }
  return {gnd:"g",vmax:10,iref:.15,pref:.5,rspan:[10,1e5],nodes,edges};
}
const trSolve=s=>solve(transCircuit(s));
const trans={
  circuit:transCircuit,
  fresh:()=>({mode:"bjt",Ib:0,IbGoal:null,Vg:0,VgGoal:null,float:false,pd:false,t:0}),
  tick(s,sol,dt){
    if(s.IbGoal!==null){ if(BC.reduced) s.Ib=s.IbGoal; else s.Ib+=(s.IbGoal-s.Ib)*Math.min(1,dt*2.6); if(Math.abs(s.IbGoal-s.Ib)<.01*s.IbGoal) { s.Ib=s.IbGoal; s.IbGoal=null; } }
    if(s.VgGoal!==null){ if(BC.reduced) s.Vg=s.VgGoal; else s.Vg=Math.min(s.VgGoal,s.Vg+dt*2.2); if(s.Vg===s.VgGoal) s.VgGoal=null; }
    if(s.float&&!BC.reduced) s.t+=dt;
    return null;
  },
  busy:s=>s.IbGoal!==null||s.VgGoal!==null,
  ro:{ base:["Base flow",(s,o)=>amps(o.I.BE)], gflow:["Gate flow",(s,o)=>amps(o.I.gsw)], main:["Main stream",(s,o)=>amps(o.I.Q)],
    vq:["Switch drop",(s,o)=>volts(+(o.v.col-o.v.k2).toFixed(2))], heat:["Switch heat",(s,o)=>fmt(Math.abs(o.I.Q)*(o.v.col-o.v.k2),"W",2)], gate:["Gate height",(s,o)=>volts(+(o.v.gt||0).toFixed(2))] },
  val:{Ic:(s,o)=>Math.abs(o.I.Q),Vg:s=>s.Vg},
  fail:{},
  alt:(s,o)=>s.mode==="mos"?`MOSFET, gate height ${volts(o.v.gt||0)}${s.float?(s.pd?", floating with a pull-down":", floating"):""}, main stream ${amps(o.I.Q)}.`:`transistor, base flow ${amps(o.I.BE)}, main stream ${amps(o.I.Q)}, ${volts(o.v.col-o.v.k2)} across the switch.`
};

const LD={Ron:.5,max:.03,full:.02,eye:15}, LEDK={red:{n:"Red",vf:1.9,c:[255,59,48]},yel:{n:"Yellow",vf:2.1,c:[255,196,0]},blu:{n:"Blue",vf:3.0,c:[58,123,255]}};
function ledCircuit(s){
  const n=s.cols.length, us=n===3?[.6,1.3,2.0]:[1.3], nodes={g:{at:[0,.86]},e:{at:[0,.86],flat:[0,.3]},a:{at:[0,0]}};
  const edges=[{id:"src",t:"source",a:"g",b:"e",V:s.V,box:.15,tag:+s.V.toFixed(1)+" V",tagOff:[0,-12],tagf:[-30,44]},{id:"w0",t:"wire",a:"e",b:"a"}];
  let top="a", bot="g";
  us.forEach((u,b)=>{ const c=LEDK[s.cols[b]], parts=[...(b===0&&s.pwm?["SW"]:[]),"R","D",...(b===0&&s.nLed===2?["Db"]:[])], N=parts.length;
    nodes["j"+b]={at:[u,0]}; nodes["k"+b]={at:[u,.86]}; edges.push({id:"wt"+b,t:"wire",a:top,b:"j"+b},{id:"wb"+b,t:"wire",a:"k"+b,b:bot}); top="j"+b; bot="k"+b;
    let prev="j"+b; parts.forEach((p,i)=>{ const nx=i===N-1?"k"+b:`m${b}_${i}`; if(i<N-1) nodes[nx]={at:[u,+(.86*(i+1)/N).toFixed(3)]};
      const lab={lab:[.27,0],labf:[34,0]};
      if(p==="SW") edges.push({id:"SW",t:"switch",a:prev,b:nx,closed:s.closed,label:"gate",...lab});
      else if(p==="R") edges.push({id:"R"+b,t:"resistor",a:prev,b:nx,R:s.noR?.01:s.R,rating:2,label:s.noR?"0 Ω":b>0?"":fmt(s.R,"Ω"),...lab});
      else edges.push({id:"D"+b+(p==="Db"?"b":""),t:"diode",a:prev,b:nx,Vf:c.vf,Ron:LD.Ron,col:c.c,k:s.k,dead:b===0&&s.burnt,rating:.5,label:(p==="D"&&s.nLed!==2?c.n+" ":"")+c.vf+" V",...lab});
      prev=nx; }); });
  return {gnd:"g",vmax:10,iref:.02,pref:2,rspan:[47,2200],nodes,edges};
}
const ledOn=s=>solve(ledCircuit({...s,closed:true,burnt:false,noR:s.noR}));
const bright=(s,o)=>Math.round(clamp((s.pwm?s.duty*Math.abs(ledOn(s).I.D0):Math.abs(o.I.D0))/LD.full,0,1)*100)+"%";
const flowOrOff=i=>Math.abs(i)<1e-5?"off":amps(i);
const leds={
  circuit:ledCircuit,
  fresh:()=>({cols:["red"],nLed:1,V:5,R:330,noR:false,burnt:false,over:0,peak:0,Vgoal:null,Vrate:3,pwm:false,closed:true,duty:.5,f:2,fGoal:2,ph:0,k:1}),
  tick(s,sol,dt){
    let ev=null; const I=Math.abs(sol.I.D0||0); s.peak=Math.max(s.peak,I);
    if(s.Vgoal!==null){ if(BC.reduced) s.V=s.Vgoal; else { const d=dt*s.Vrate; s.V=s.V<s.Vgoal?Math.min(s.Vgoal,s.V+d):Math.max(s.Vgoal,s.V-d); } if(s.V===s.Vgoal) s.Vgoal=null; }
    if(I>LD.max&&!s.burnt){ s.over+=dt; if(BC.reduced||s.over>.45){ s.burnt=true; ev="burn"; } } else if(!s.burnt) s.over=0;
    if(s.pwm&&!BC.reduced&&dt){ s.f=Math.min(s.fGoal,s.f*Math.exp(dt*1.7)); s.ph=(s.ph+dt*s.f)%1; s.closed=s.f<LD.eye?s.ph<s.duty:true; }
    if(s.pwm&&BC.reduced){ s.f=s.fGoal; s.closed=true; }
    s.k=s.pwm&&s.f>=LD.eye?s.duty:1;
    return ev;
  },
  busy:s=>s.Vgoal!==null,
  ro:{ V:["Supply",s=>volts(+s.V.toFixed(1))], I:["Flow",(s,o)=>amps(o.I.D0)], peak:["Peak flow",s=>s.peak>.05?amps(s.peak):"—"], bright:["Brightness",bright],
    red:["Red",(s,o)=>flowOrOff(o.I.D0)], yel:["Yellow",(s,o)=>flowOrOff(o.I.D1)], blu:["Blue",(s,o)=>flowOrOff(o.I.D2)],
    duty:["On-time",s=>Math.round(s.duty*100)+"%"], speed:["Pulse speed",s=>s.pwm?(s.f>=100?"fast":fmt(+s.f.toFixed(1),"Hz")):"steady"], avg:["Average",s=>amps(s.pwm?s.duty*Math.abs(ledOn(s).I.D0):Math.abs(ledOn(s).I.D0))] },
  val:{I:(s,o)=>Math.abs(o.I.D0),duty:s=>s.duty},
  fail:{burn:"D0"},
  alt:(s,o)=>`${s.cols.length} LED branch${s.cols.length>1?"es":""}, supply ${+s.V.toFixed(1)} volts, ${s.burnt?"LED burnt out":"flow "+amps(o.I.D0)}.`
};

/* ---------- module 9: a rectifier, a tank and a regulator, in real model time ----------
   Stated model. 50 Hz source, shown 50× slower so a cycle takes a second. Diode 0.7 V + 0.05 Ω; half-wave only. The regulator is an ideal 5 V linear part: it passes the load's flow from its input to its output, drops out below 0.5 V of headroom, and every volt it drops times that flow is heat in it. The picture cannot draw below the floor, so the source rests at 0 there; the plot keeps the true swing. */
const PW={f:50,slow:50,Vf:.7,Ron:.05,Vreg:5,Vdo:.5,Rdo:1,rate:1};
TYPES.ldo={hot:1, g:e=>e.m==="drop"?1/e.Rdo:0, j:e=>e.m==="reg"?e.Iset:0,
  flip:(e,v)=>{ const m=v[e.a]-e.Vreg>=e.Vdo?"reg":"drop"; if(m===e.m) return false; e.m=m; return true; }, solid:solidResistor, symbol:symResistor};
const tankBoxW=C=>.1+.07*Math.log10(C/2.2e-4);
const sgn=x=>(x<0?"−":"")+Math.abs(x).toFixed(1)+" V";
function powerCircuit(s){
  if(s.Il) s.RL=11/s.Il;   /* the load slider is a flow: about this much at 11 V */
  const nodes={g:{at:[0,.8]},e:{at:[0,.8],flat:[0,.3]},n0:{at:[0,0]},da:{at:[.15,0]},db:{at:[.75,0]},o:{at:[.9,0]},tp:{at:[.9,.38],flat:[.9,.24]},tb:{at:[.9,.38],flat:[.9,.56]},f1:{at:[.9,.8]},ra:{at:[1.05,0]},rb:{at:[1.55,0]},lo:{at:[1.9,0]},lf:{at:[1.9,.8]}};
  const edges=[
   {id:"src",t:"source",a:"g",b:"e",V:s.pk*Math.sin(2*Math.PI*PW.f*s.t),box:.15,tag:s.pk+" V peak",tagOff:[0,-12],tagf:[-30,44]},
   {id:"w0",t:"wire",a:"e",b:"n0"},{id:"w1",t:"wire",a:"n0",b:"da"},
   s.diode?{id:"D",t:"diode",a:"da",b:"db",Vf:PW.Vf,Ron:PW.Ron,rating:.5,label:"Diode "+PW.Vf+" V",lab:[0,.27],labf:[0,-26]}:{id:"D",t:"wire",a:"da",b:"db"},
   {id:"w2",t:"wire",a:"db",b:"o"},{id:"w7",t:"wire",a:"o",b:"ra"},
   s.reg?{id:"G",t:"ldo",a:"ra",b:"rb",R:100,Vreg:PW.Vreg,Vdo:PW.Vdo,Rdo:PW.Rdo,Iset:PW.Vreg/s.RL,rating:PW.rate,label:"Regulator "+PW.Vreg+" V",lab:[0,.27],labf:[0,-26]}:{id:"G",t:"wire",a:"ra",b:"rb"},
   {id:"w8",t:"wire",a:"rb",b:"lo"},{id:"R",t:"resistor",a:"lo",b:"lf",R:s.RL,rating:50,label:fmt(s.RL,"Ω"),lab:[-.27,0],labf:[-34,0]},
   {id:"w5",t:"wire",a:"f1",b:"g"},{id:"w6",t:"wire",a:"lf",b:"f1"}];
  if(s.tank) edges.push({id:"w3",t:"wire",a:"o",b:"tp"},{id:"C",t:"capacitor",a:"tp",b:"tb",C:s.C,v0:s.vc,box:tankBoxW(s.C),rim:Math.max(13,s.pk+1.4),capLabel:fmt(s.C,"F")},{id:"w4",t:"wire",a:"tb",b:"f1"});
  return {gnd:"g",vmax:18,iref:.12,pref:2,rspan:[22,500],live:true,clip:true,nodes,edges,clock:{t:"t = "+secs(s.t),scale:`shown ${PW.slow}× slower`+(BC.reduced?", in steps":"")},trace:{label:s.reg?"Dashed: input":"Dashed: source",pts:s.tr,pts2:s.tr2,tMax:2/PW.f,yMax:32,guides:[{y:16,t:"0 V"}]}};
}
/* advance by run seconds in steps of at most h; ripple window and averages ride along */
function powerRun(s,run,h){
  const d=powerCircuit(s), src=d.edges.find(e=>e.id==="src"), cap=d.edges.find(e=>e.id==="C"), reg=d.edges.find(e=>e.id==="G"), n=Math.max(1,Math.ceil(run/h)), hh=run/n, T=1/PW.f, a=Math.min(1,hh/(2*T)); let o=null;
  for(let i=0;i<n;i++){
    s.t+=hh; src.V=s.pk*Math.sin(2*Math.PI*PW.f*s.t); o=timeStep(d,hh,hh,1);
    const vo=o.v.lo; s.hi=Math.max(s.hi,vo); s.lo=Math.min(s.lo,vo);
    s.iAvg+=(Math.abs(o.I.R)-s.iAvg)*a; s.vAvg+=(vo-s.vAvg)*a; s.vinAvg+=(o.v.ra-s.vinAvg)*a; if(reg) s.pAvg+=(Math.abs(o.I.G*(o.v.ra-o.v.rb))-s.pAvg)*a;
    const w=Math.floor(s.t/T+1e-9); if(w>s.win){ s.win=w; s.rip=s.wKey===s.C+"/"+s.RL&&s.wStart>=s.chg+3*T-1e-9?s.hi-s.lo:null; s.hi=-1e9; s.lo=1e9; s.wStart=s.t; s.wKey=s.C+"/"+s.RL; }
  }
  if(cap) s.vc=cap.v0; s.sol=o; return o;
}
const power={
  circuit:s=>{ if(!s.warm){ s.warm=true; if(s.pre){ s.chg=s.t; powerRun(s,s.pre,1/PW.f/200); s.tr=[]; s.tr2=[]; s.tw=s.t; } } return powerCircuit(s); },
  fresh:()=>({pk:12,RL:100,C:4.7e-4,tank:false,diode:false,reg:false,vc:0,t:0,pre:0,warm:false,chg:-1,hi:-1e9,lo:1e9,win:0,wStart:0,wKey:"",rip:null,was:null,iAvg:0,vAvg:0,vinAvg:0,pAvg:0,tr:[],tr2:[],tw:0,sol:null}),
  running:()=>true,
  quantum:()=>.25/PW.f*PW.slow,
  tick(s,sol,dt){
    if(!dt) return null;
    powerRun(s,dt/PW.slow,1/PW.f/400);
    if(s.t-s.tw>2/PW.f){ s.tr=[]; s.tr2=[]; s.tw=s.t; }
    const o=s.sol, n=s.tr.length; if(o&&(!n||s.t-s.tw-s.tr[n-1][0]>=2/PW.f/200)){ s.tr.push([s.t-s.tw,o.v.lo+16]); s.tr2.push([s.t-s.tw,(s.reg?o.v.ra:o.v.e)+16]); }
    return null;
  },
  busy:()=>false,
  ro:{
   src:["Source",(s,o)=>sgn(o.v.e)], out:["Load height",(s,o)=>volts(+o.v.lo.toFixed(2))], rip:["Ripple",s=>s.rip===null?"—":volts(+s.rip.toFixed(2))], was:["Before",s=>s.was===null?"—":volts(+s.was.toFixed(2))],
   flow:["Load flow",(s,o)=>amps(o.I.R)], vin:["Into regulator",s=>volts(+s.vinAvg.toFixed(1))], fall:["Fall across it",s=>volts(+(s.vinAvg-PW.Vreg).toFixed(1))], heat:["Regulator heat",s=>watts(s.pAvg)]
  },
  val:{pk:s=>s.pk,rip:s=>s.rip===null?-1:s.rip},
  fail:{},
  alt:(s,o)=>`source ${sgn(o.v.e)} of ${s.pk} volts peak${s.diode?", diode in line":""}${s.tank?", "+fmt(s.C,"F")+" tank":""}${s.reg?", 5 volt regulator":""}, load height ${volts(+o.v.lo.toFixed(2))}.`
};

BC.LESSONS={
 1:{
  xp:40, widget:loop, hotspot:{a:"sa",b:"sb"},
  steps:[
   {id:"close",kind:"do",prompt:"Close the switch.",
    insight:"Closing the gap drops the far ledge to the floor. Now charge has a slope to fall down.",
    setup:s=>{s.V=4;s.R=470;s.closed=false;}, ro:["I"], hot:true,
    actions:[{label:s=>s.closed?"Open switch":"Close switch",run:s=>{s.closed=!s.closed;}}],
    goal:s=>s.closed},
   {id:"raise",kind:"hit",prompt:"Drag the voltage up to 9 V. Watch the lift.",
    insight:"A taller lift means a steeper slope. Steeper slope, faster charge: more current.",
    setup:s=>{s.V=4;s.R=470;}, ro:["I"], sliders:[{k:"V",label:"Voltage",min:1,max:18,step:.5,grip:{node:"e"}}],
    target:{of:"V",to:9,tol:.01,show:volts}},
   {id:"target",kind:"hit",prompt:"Drag R until the current reads 20 mA.",
    insight:"The drop stayed the same. More resistance just slows the charge: about 450 Ω passes 20 mA at 9 V.",
    setup:s=>{s.V=9;s.R=2000;}, ro:["I"], sliders:[{k:"R",label:"R",log:[100,4700],grip:{edge:"R"}}],
    target:{of:"I",to:.02,tol:.02,show:amps}, keep:(s,v)=>{v.hitV=s.V;v.hitR=s.R;}},
   {id:"double",kind:"predict",prompt:"Double the voltage. The current...?",
    insight:"Twice the height, twice the current. With R fixed, charge speed tracks the voltage.",
    setup:(s,v)=>{s.V=9;s.R=v.hitR||450;}, ro:["V","I"],
    choices:[{t:"Halves"},{t:"Stays the same"},{t:"Doubles",ok:1},{t:"Quadruples"}],
    reveal:s=>{s.Vgoal=18;s.Vrate=9;}, settled:s=>s.Vgoal===null, keep:(s,v)=>{v.dblV=s.V;v.dblR=s.R;}},
   {id:"probe",kind:"probe",prompt:"Put the leads across the resistor, then both on one ledge.",
    insight:"A meter reads height difference. Top to bottom of the slope: all of it. One ledge: 0 V.",
    setup:(s,v)=>{s.V=9;s.R=v.hitR||450;}, ro:["V","I"],
    points:[{id:"a",node:"t",label:"High ledge"},{id:"b",node:"ra",label:"Top of the resistor"},{id:"c",node:"rb",label:"Bottom of the resistor"},{id:"e",node:"c2",label:"Low ledge"}],
    targets:[{t:"Across R",test:(dv,s)=>Math.abs(dv)>s.V*.5},{t:"One ledge",test:dv=>Math.abs(dv)<.01}]},
   {id:"burn",kind:"do",prompt:"New part, rated ¼ W. Push its power past that until it fails.",
    insight:"Too much current falling too far: heat beat the ¼ W rating. It burned open, leaving a gap.",
    setup:s=>{s.V=9;s.R=470;s.rating=.25;}, ro:["I","P","rate"],
    sliders:[{k:"V",label:"Voltage",min:1,max:18,step:.5,grip:{node:"e"}},{k:"R",label:"R",log:[100,4700],grip:{edge:"R"}}],
    actions:[{label:()=>"Replace resistor",when:s=>s.burnt,run:s=>{s.burnt=false;s.V=9;s.R=470;}}], swap:s=>s.burnt,
    goal:s=>s.burnt, keep:(s,v)=>{ if(s.at){v.burnV=s.at.V;v.burnR=s.at.R;} }},
   {id:"rating",kind:"predict",prompt:"12 V across 220 Ω. Which rating survives?",
    insight:"It turns 0.65 W into heat. Any rating above that survives; well above it runs cool.",
    setup:s=>{s.V=12;s.R=220;s.closed=false;}, ro:["I","P","rate"], cols:5, retry:true,
    choices:[.125,.25,.5,1,2].map(w=>({t:RATING[w],w,ok:w>=1})),
    reveal:(s,c)=>{s.burnt=false;s.over=0;s.rating=c.w;s.closed=true;},
    settled:(s,o)=>s.burnt||(s.closed&&o.I.R*o.I.R*s.R<=s.rating),
    keep:(s,v)=>{v.ratV=s.V;v.ratR=s.R;}},
   {id:"short",kind:"predict",prompt:"Wire across the resistor. Where does the heat go?",
    insight:"The ledge collapsed. The whole fall moved inside the source: 18 A through its 0.5 Ω. The fuse opened.",
    setup:(s,v)=>{s.V=9;s.R=v.hitR||450;s.fuse="ok";s.showInner=true;}, ro:["I","peak","Psrc"],
    choices:[{t:"The resistor"},{t:"The wire"},{t:"The source",ok:1},{t:"Nowhere"}],
    reveal:s=>{s.shorted=true;}, settled:s=>s.fuse==="blown", keep:(s,v)=>{v.shortV=s.V;v.shortI=s.peak;}}
  ],
  end:{
   prompt:"These are the equations. Every number is yours.",
   rows:[
    {f:0,step:3,need:["hitV","hitR"],show:v=>{ const I=v.hitV/(v.hitR+INNER_R); return `${volts(I*v.hitR)} = ${amps(I)} × ${fmt(v.hitR,"Ω")}`; }},
    {f:1,step:6,need:["burnV","burnR"],show:v=>{ const I=v.burnV/(v.burnR+INNER_R), Vr=I*v.burnR; return `${fmt(Vr,"V",4)} × ${amps(I)} = ${watts(Vr*I)}`; }},
    {f:2,step:7,need:["ratV","ratR"],show:v=>{ const I=v.ratV/(v.ratR+INNER_R); return `(${amps(I)})² × ${fmt(v.ratR,"Ω")} = ${watts(I*I*v.ratR)}`; }},
    {f:3,step:4,need:["dblV","dblR"],show:v=>{ const Vr=v.dblV*v.dblR/(v.dblR+INNER_R); return `(${fmt(Vr,"V",4)})² / ${fmt(v.dblR,"Ω")} = ${watts(Vr*Vr/v.dblR)}`; }},
    {eq:"I = V / r",what:"A short: only the source limits it",step:8,need:["shortV","shortI"],show:v=>`${volts(v.shortV)} / ${INNER_R} Ω = ${amps(v.shortV/INNER_R)}`}
   ]
  }
 },
 2:{
  xp:40, widget:net,
  steps:[
   {id:"mid",kind:"predict",prompt:"One fall, two slopes: 1 kΩ, then 4 kΩ. How high is the middle?",
    insight:"Same flow through both, so each fall matches its resistance: 1 V, then 4 V.",
    setup:s=>{s.R2=4000;s.veil=true;s.gauge=[1,2.5,4,5];}, ro:["V","I","mid"],
    choices:[{t:"1 V"},{t:"2.5 V"},{t:"4 V",ok:1},{t:"5 V"}],
    reveal:s=>{s.veil=false;s.gauge=null;reveal(s);}, settled:settledSoon},
   {id:"ratio",kind:"hit",prompt:"Drag R₂ until the middle stands at 3.3 V.",
    insight:"R₂ is about twice R₁, so the middle keeps two thirds of the height. That's a voltage divider.",
    setup:s=>{s.R2=1000;}, ro:["mid"], sliders:[{k:"R2",label:"R₂",log:[220,10000],grip:{edge:"R2",sign:1}}],
    target:{of:"mid",to:3.3,tol:.006,show:volts}, keep:(s,v)=>{v.r2=s.R2;}},
   {id:"walk",kind:"do",prompt:"Walk the whole loop. Drag the marker back to where it started.",
    insight:"Up 5 V, down 1.7 V, down 3.3 V. Any closed loop ends where it began.",
    setup:(s,v)=>{s.R2=v.r2||1940;s.pos=0;}, ro:["at","up","down"], sliders:[{k:"pos",label:"Walk",min:0,max:1,step:.005,fmt:s=>Math.round(s.pos*100)+"%",grip:{walk:1}}],
    goal:s=>s.pos>=1},
   {id:"sag",kind:"predict",prompt:"Hang a 1 kΩ load off the middle. Its height...?",
    insight:"The load is a second way down. More flow through R₁ means a bigger first fall.",
    setup:(s,v)=>{s.R2=v.r2||1940;s.RL=1000;s.load=false;s.was=midOpen(s);}, ro:["mid","sag","I"],
    choices:[{t:"Holds"},{t:"Rises"},{t:"Sags",ok:1},{t:"Hits 0 V"}],
    reveal:s=>{s.load=true;reveal(s);}, settled:settledSoon},
   {id:"light",kind:"do",prompt:"This load is heavy. Lighten it until the sag is under 9%.",
    insight:"Under 9% takes a load over 10× R₁ ∥ R₂, here over 6.6 kΩ.",
    setup:(s,v)=>{s.R2=v.r2||1940;s.RL=100;s.load=true;s.was=midOpen(s);}, ro:["mid","sag"], sliders:[{k:"RL",label:"Load",log:[100,100000],grip:{edge:"RL",sign:1}}],
    goal:(s,o)=>1-o.v.m/s.was<.09, keep:(s,v)=>{v.rl=s.RL;}},
   {id:"par",kind:"predict",prompt:"A 2 kΩ path opens beside the 1 kΩ. Total flow?",
    insight:"Each path gets the full 5 V. 5 mA + 2.5 mA = 7.5 mA, joining where the paths meet.",
    setup:s=>{s.shape="par";s.next=2;}, ro:["a","b","tot"],
    choices:[{t:"1.67 mA"},{t:"5 mA"},{t:"7.5 mA",ok:1},{t:"10 mA"}],
    reveal:s=>{s.n=2;reveal(s);}, settled:settledSoon},
   {id:"size",kind:"hit",prompt:"Size the second path until the total reads 15 mA.",
    insight:"It takes about 500 Ω. Together the paths pass like one 333 Ω, less than either.",
    setup:s=>{s.shape="par";s.n=2;s.Rb=2000;}, ro:["a","b"], sliders:[{k:"Rb",label:"Path 2",log:[220,4700],grip:{edge:"Rb",sign:1}}],
    target:{of:"tot",to:.015,tol:.015,show:amps}, keep:(s,v)=>{v.rb=s.Rb;}},
   {id:"third",kind:"predict",prompt:"Open a third path, 1 kΩ. The total resistance...?",
    insight:"Another way down: 20 mA from 5 V is 250 Ω, below every path.",
    setup:s=>{s.shape="par";s.n=2;s.Rb=500;s.next=3;}, ro:["tot","Rt"], cols:3,
    choices:[{t:"Rises"},{t:"Falls",ok:1},{t:"Holds"}],
    reveal:s=>{s.n=3;s.next=0;reveal(s);}, settled:settledSoon}
  ],
  end:{
   prompt:"These are the equations. Every number is yours.",
   rows:[
    {f:0,step:2,need:["r2"],show:v=>`${fmt(NET_R1,"Ω")} + ${fmt(v.r2,"Ω")} = ${fmt(NET_R1+v.r2,"Ω")}`},
    {f:3,step:2,need:["r2"],show:v=>`${NET_V} V × ${fmt(v.r2,"Ω")} / ${fmt(NET_R1+v.r2,"Ω")} = ${volts(NET_V*v.r2/(NET_R1+v.r2))}`},
    {eq:"ΣV around a loop = 0",what:"Kirchhoff's voltage law",step:3,need:["r2"],show:v=>{ const m=NET_V*v.r2/(NET_R1+v.r2); return `+${NET_V} − ${(NET_V-m).toFixed(2)} − ${m.toFixed(2)} = 0 V`; }},
    {f:4,step:5,need:["r2","rl"],show:v=>{ const r=NET_R1*v.r2/(NET_R1+v.r2); return `${fmt(r,"Ω")}: your ${fmt(v.rl,"Ω")} load is ${(v.rl/r).toFixed(0)}×`; }},
    {f:2,step:7,need:["rb"],show:v=>`${fmt(NET_R1,"Ω")} × ${fmt(v.rb,"Ω")} / ${fmt(NET_R1+v.rb,"Ω")} = ${fmt(NET_R1*v.rb/(NET_R1+v.rb),"Ω")}`},
    {eq:"ΣI in = ΣI out",what:"Kirchhoff's current law",step:7,need:["rb"],show:v=>`${amps(NET_V/NET_R1)} + ${amps(NET_V/v.rb)} = ${amps(NET_V/NET_R1+NET_V/v.rb)}`}
   ]
  }
 },
 5:{
  xp:40, widget:timed, hotspot:{a:"sa",b:"sb"},
  steps:[
   {id:"instant",kind:"predict",prompt:"The tank is empty. The moment the switch closes, the flow is...?",
    insight:"Empty tank, full height difference: the biggest flow comes first. The level hasn't moved yet.",
    setup:()=>{}, ro:["level","flow"], cols:3,
    choices:[{t:"None yet"},{t:"Its biggest",ok:1},{t:"About half"}],
    reveal:s=>{s.closed=true;s.hold=BC.reduced?.5:1.3;}, settled:s=>s.hold<=0||BC.reduced},
   {id:"fill",kind:"do",prompt:"Close the switch. Watch the stream until it dies.",
    insight:"Level up, slope flatter, stream thinner. When the level meets the supply: no slope, no flow.",
    setup:()=>{}, ro:["level","flow","pct"], hot:true,
    actions:[{label:s=>s.closed?"Open switch":"Close switch",run:s=>{s.closed=!s.closed;}}],
    goal:s=>s.vc>=.98*s.V},
   {id:"dragR",kind:"hit",prompt:"Drag R until the tank fills in 3 s.",
    insight:"More resistance starves the flow. Same tank, same level, a longer wait.",
    setup:s=>{s.closed=true;s.retime=true;s.R=22000;}, ro:["flow","fill"], sliders:[{k:"R",label:"R",log:[1e4,1e6],grip:{edge:"R"}}],
    target:{of:"fill",to:3,tol:.1,show:t=>t+" s"}, keep:(s,v)=>{v.hitR=s.R;v.hitT=s.fillT;}},
   {id:"dragC",kind:"hit",prompt:"R is fixed now. Size the tank until it fills in 3 s.",
    insight:"Smaller tank, less to fill. Resistance and size trade off: together they set the time.",
    setup:s=>{s.closed=true;s.retime=true;s.R=47000;s.C=47e-6;}, ro:["flow","fill"], sliders:[{k:"C",label:"Tank",log:[1e-6,1e-4],fmt:s=>fmt(s.C,"F"),grip:{edge:"C"}}],
    target:{of:"fill",to:3,tol:.1,show:t=>t+" s"}, keep:(s,v)=>{v.hitC=s.C;}},
   {id:"drain",kind:"predict",prompt:"A full tank starts draining through R. Its level falls...?",
    insight:"High level, big flow, fast fall. As the level drops, so does the flow.",
    setup:s=>{s.vc=s.V;s.drainPath=true;}, ro:["level","flow"], cols:3,
    choices:[{t:"Straight down"},{t:"Fast, then slow",ok:1},{t:"Slow, then fast"}],
    reveal:s=>{s.drain=true;}, settled:s=>s.t>=3*s.R*s.C, keep:(s,v)=>{v.drained=s.atTau;}},
   {id:"tau",kind:"predict",prompt:"τ is this pair's own unit of time. After one τ, the tank is...?",
    insight:"63% every time, any R, any tank. Each τ closes 63% of the gap left.",
    setup:s=>{s.stop=s.R*s.C;}, ro:["level","pct"], cols:2,
    choices:[{t:"50% full"},{t:"63% full",ok:1},{t:"75% full"},{t:"90% full"}],
    reveal:s=>{s.closed=true;}, settled:s=>{ if(s.t>=s.stop-1e-12){ s.mark=s.vc; return true; } return false; }, keep:(s,v)=>{v.v63=s.vc;}},
   {id:"build",kind:"do",prompt:"A heavy flywheel joins the stream. Close the switch and watch the flow.",
    insight:"At first the wheel holds the whole height. As it spins up, its slope flattens.",
    setup:s=>{s.shape="rl";s.slow=CO.slow;s.trI=true;s.closed=false;}, ro:["flow","gap"], hot:true,
    actions:[{label:s=>s.closed?"Switch closed":"Close switch",run:s=>{ if(!s.closed){ s.closed=true; s.t=0; s.tr=[]; } }}],
    goal:s=>s.iL>=.95*CO.V/CO.R, keep:(s,v)=>{v.tauL=CO.L/CO.R;}},
   {id:"spike",kind:"predict",prompt:"Full flow, wheel spinning. Open the switch. The height at the gap...?",
    insight:"The wheel won't stop. It drives flow across the gap, lifting it to 300 V.",
    setup:s=>{s.shape="rl";s.slow=CO.slow;s.closed=true;s.iL=CO.V/CO.R;s.trI=true;s.leak=true;s.stop=0;}, ro:["flow","gap","peak"], cols:3,
    choices:[{t:"Falls to 0 V"},{t:"Stays 12 V"},{t:"Far above",ok:1}],
    reveal:s=>openCoil(s), settled:s=>s.t>=tauOf(s), keep:(s,v)=>{v.peak=s.peak;v.Iopen=CO.V/CO.R;}},
   {id:"diode",kind:"do",prompt:"Bridge the coil with a diode, then open the switch.",
    insight:"Flow loops round through the diode. The gap stops near 12.7 V; the wheel spends itself gently.",
    setup:s=>{s.shape="rl";s.slow=CO.slow;s.closed=true;s.iL=CO.V/CO.R;s.trI=true;s.leak=true;s.stop=0;s.diodeOn=true;}, ro:["flow","gap","peak"],
    actions:[{label:()=>"Add the diode",when:s=>!s.diode,run:s=>{s.diode=true;}},{label:()=>"Open switch",when:s=>s.diode&&s.closed,run:s=>openCoil(s)}],
    goal:s=>!s.closed&&s.t>=tauOf(s)*.5, keep:(s,v)=>{v.clamp=s.peak;}}
  ],
  end:{
   prompt:"These are the equations. Every number is yours.",
   rows:[
    {f:0,step:3,need:["hitR"],show:v=>`${fmt(v.hitR,"Ω")} × ${fmt(TK.C,"F")} = ${secs(v.hitR*TK.C)}`},
    {f:1,step:6,need:["v63"],show:v=>`${TK.V} V × (1 − e⁻¹) = ${fmt(v.v63,"V",3)}`},
    {f:2,step:5,need:["drained"],show:v=>`${TK.V} V × e⁻¹ = ${fmt(v.drained,"V",3)}`},
    {f:4,step:4,need:["hitC"],show:v=>`½ × ${fmt(v.hitC,"F")} × (${TK.V} V)² = ${fmt(.5*v.hitC*TK.V*TK.V,"J",3)}`},
    {f:5,step:7,need:["tauL"],show:v=>`${fmt(CO.L,"H")} / ${fmt(CO.R,"Ω")} = ${secs(v.tauL)}`},
    {eq:"V = I · R",what:"The spike: your flow through the gap's stated leak",step:8,need:["peak","Iopen"],show:v=>`${amps(v.Iopen)} × ${fmt(CO.Roff,"Ω")} = ${fmt(v.peak,"V",3)}`},
    {eq:"V = Vs + Vf",what:"With the diode, the clamp",step:9,need:["clamp"],show:v=>`${CO.V} V + ${CO.Vf} V = ${fmt(v.clamp,"V",3)}`}
   ]
  }
 },
 6:{
  xp:40, widget:diodes, hotspot:{a:"da",b:"db"},
  steps:[
   {id:"step",kind:"predict",prompt:"Lift the supply to 5 V. The diode's step will be...?",
    insight:"A diode costs one small, fixed step. The resistor takes everything above it.",
    setup:()=>{}, ro:["V","drop","I"], cols:3,
    choices:[{t:"All 5 V"},{t:"About 0.7 V",ok:1},{t:"Nothing"}],
    reveal:s=>{s.Vgoal=5;s.Vrate=2.5;}, settled:s=>s.Vgoal===null},
   {id:"double",kind:"predict",prompt:"Double the supply to 10 V. The diode's step...?",
    insight:"Same step, taller supply. All the extra height lands on the resistor, so the flow roughly doubles.",
    setup:s=>{s.V=5;}, ro:["V","drop","rdrop"], cols:3,
    choices:[{t:"Doubles"},{t:"Stays about 0.7 V",ok:1},{t:"Halves"}],
    reveal:s=>{s.Vgoal=10;s.Vrate=2.5;}, settled:s=>s.Vgoal===null},
   {id:"reverse",kind:"predict",prompt:"Reverse the battery. The flow becomes...?",
    insight:"The ledge faces the wrong way, so the whole height piles across the diode: a cliff nothing climbs.",
    setup:s=>{s.V=5;}, ro:["V","drop","I"], cols:3,
    choices:[{t:"Backwards"},{t:"None at all",ok:1},{t:"The same"}],
    reveal:s=>{s.rev=true;}, settled:()=>true},
   {id:"size",kind:"hit",prompt:"Set the flow to 20 mA. Drag R.",
    insight:"Only the height above the step reaches the resistor. About 415 Ω passes 20 mA at 9 V.",
    setup:s=>{s.V=9;s.R=2000;}, ro:["drop","I"], sliders:[{k:"R",label:"R",log:[100,2000],grip:{edge:"R"}}],
    target:{of:"I",to:.02,tol:.03,show:amps}, keep:(s,v)=>{v.dR=s.R;v.dI=Math.abs(diodeSolve(s).I.D);v.dV=s.V;}},
   {id:"heat",kind:"predict",prompt:"Swap in a Schottky: a 0.32 V step. The diode's heat...?",
    insight:"Heat is step times flow. A shorter step wastes less as warmth.",
    setup:s=>{s.V=5;s.R=10;s.rate=8;}, ro:["I","drop","heat"], cols:3,
    choices:[{t:"Less",ok:1},{t:"The same"},{t:"More"}],
    reveal:s=>{s.kind="sch";}, settled:()=>true,
    keep:(s,v)=>{const o=diodeSolve(s);v.sI=Math.abs(o.I.D);v.sV=DI.Vsch;v.sP=Math.abs(o.I.D)*Math.abs(o.v.da-o.v.db);}},
   {id:"zener",kind:"do",prompt:"Drag the supply from 3 V up to 12 V. Watch the output.",
    insight:"Past 5.1 V the Zener breaks down and holds its level. The resistor absorbs every extra volt.",
    setup:s=>{s.mode="zen";s.V=3;s.R=DI.Rs;}, ro:["V","out","I"], sliders:[{k:"V",label:"Supply",min:1,max:12,step:.1,grip:{node:"e"}}],
    goal:s=>s.V>=11.9},
   {id:"sag",kind:"predict",prompt:"The supply sags from 12 V to 8 V. The output...?",
    insight:"Still past 5.1 V, so the level holds. A wobbly supply becomes a steady height.",
    setup:s=>{s.mode="zen";s.V=12;s.R=DI.Rs;}, ro:["V","out","I"], cols:3,
    choices:[{t:"Falls 4 V"},{t:"Holds near 5.1 V",ok:1},{t:"Rises"}],
    reveal:s=>{s.Vgoal=8;s.Vrate=4;}, settled:s=>s.Vgoal===null},
   {id:"zsize",kind:"hit",prompt:"Hold 10 mA through the Zener at 9 V. Drag R.",
    insight:"Only the height above 5.1 V falls across R. About 390 Ω passes 10 mA.",
    setup:s=>{s.mode="zen";s.V=9;s.R=1500;}, ro:["out","I"], sliders:[{k:"R",label:"R",log:[100,2000],grip:{edge:"R"}}],
    target:{of:"I",to:.01,tol:.04,show:amps}, keep:(s,v)=>{v.zR=s.R;v.zI=Math.abs(diodeSolve(s).I.D);v.zV=s.V;}}
  ],
  end:{
   prompt:"These are the equations. Every number is yours.",
   rows:[
    {f:1,step:4,need:["dR","dI"],show:v=>`(${v.dV} V − ${DI.Vf} V) / ${fmt(v.dR,"Ω")} = ${fmt((v.dV-DI.Vf)/v.dR,"A",3)}`},
    {f:0,step:5,need:["sI","sP"],show:v=>`${DI.Vsch} V × ${fmt(v.sI,"A",3)} = ${fmt(DI.Vsch*v.sI,"W",2)}`},
    {f:2,step:8,need:["zR","zI"],show:v=>`(${v.zV} V − ${DI.Vz} V) / ${fmt(v.zI,"A",3)} = ${fmt((v.zV-DI.Vz)/v.zI,"Ω",3)}`}
   ]
  }
 },
 7:{
  xp:40, widget:trans, hotspot:{a:"j1",b:"bn"},
  steps:[
   {id:"base",kind:"predict",prompt:"The gate is shut. Send 1 mA into the base. The main stream...?",
    insight:"A thin side flow swung the gate wide. The main stream is about 100 times larger.",
    setup:()=>{}, ro:["base","main","vq"], cols:3,
    choices:[{t:"About 1 mA"},{t:"About 100 mA",ok:1},{t:"Nothing"}],
    reveal:s=>{s.IbGoal=1e-3;}, settled:s=>s.IbGoal===null},
   {id:"scale",kind:"hit",prompt:"Drag the base flow until the main stream reads 200 mA.",
    insight:"The main stream follows the base flow at a fixed ratio. Small input, large output.",
    setup:s=>{s.Ib=3e-4;}, ro:["base","main"], sliders:[{k:"Ib",label:"Base flow",log:[1e-5,1e-2],fmt:s=>amps(s.Ib),grip:{edge:"Rb",sign:1}}],
    target:{of:"Ic",to:.2,tol:.03,show:amps}, keep:(s,v)=>{v.ib2=s.Ib;v.ic2=Math.abs(trSolve(s).I.Q);}},
   {id:"cap",kind:"predict",prompt:"Raise the base flow from 2 mA to 10 mA. The main stream...?",
    insight:"The load already caps the flow. The gate is fully open and drops almost no height.",
    setup:s=>{s.Ib=2e-3;}, ro:["base","main","vq"], cols:3,
    choices:[{t:"Five times bigger"},{t:"Stops growing",ok:1},{t:"Falls"}],
    reveal:s=>{s.IbGoal=1e-2;}, settled:s=>s.IbGoal===null,
    keep:(s,v)=>{const o=trSolve(s);v.vsat=o.v.col-o.v.k2;v.isat=Math.abs(o.I.Q);}},
   {id:"hot",kind:"predict",prompt:"Which gets the switch hotter: half open, or fully on?",
    insight:"Half open means a tall slope and heavy flow together. Fully on or off, one of them is near zero.",
    setup:s=>{s.Ib=1.5e-3;}, ro:["main","vq","heat"], cols:3,
    choices:[{t:"Fully on"},{t:"Half open",ok:1},{t:"The same"}],
    reveal:s=>{s.IbGoal=5e-3;}, settled:s=>s.IbGoal===null},
   {id:"gate",kind:"predict",prompt:"No base now. Lift the gate height to 5 V. How much flow enters the gate?",
    insight:"The gate is insulated. Height alone opens it; no flow goes in.",
    setup:s=>{s.mode="mos";}, ro:["gate","gflow","main"], cols:3,
    choices:[{t:"As much as the main stream"},{t:"A little"},{t:"None at all",ok:1}],
    reveal:s=>{s.VgGoal=5;}, settled:s=>s.VgGoal===null},
   {id:"thresh",kind:"hit",prompt:"Raise the gate until the load draws 100 mA.",
    insight:"Nothing happens until about 2 V, then it opens fast. That threshold is built in.",
    setup:s=>{s.mode="mos";s.Vg=0;}, ro:["gate","main"], sliders:[{k:"Vg",label:"Gate height",min:0,max:5,step:.01,fmt:s=>volts(+s.Vg.toFixed(2)),grip:{node:"gd"}}],
    target:{of:"Ic",to:.1,tol:.06,show:amps}, keep:(s,v)=>{v.vth=s.Vg;}},
   {id:"full",kind:"do",prompt:"Lift the gate to 5 V: fully on.",
    insight:"Fully on, the channel is nearly flat: almost no height lost, almost no heat.",
    setup:s=>{s.mode="mos";s.Vg=2.6;}, ro:["gate","main","heat"], sliders:[{k:"Vg",label:"Gate height",min:0,max:5,step:.01,fmt:s=>volts(+s.Vg.toFixed(2)),grip:{node:"gd"}}],
    goal:s=>s.Vg>=4.99, keep:(s,v)=>{const o=trSolve(s);v.mI=Math.abs(o.I.Q);v.mV=o.v.col-o.v.k2;}},
   {id:"float",kind:"predict",prompt:"Unplug the gate driver. The gate's height becomes...?",
    insight:"Nothing anchors it, so stray charge sets the height. The switch half-opens at random.",
    setup:s=>{s.mode="mos";s.Vg=5;}, ro:["gate","main","heat"], cols:3,
    choices:[{t:"0 V"},{t:"Holds 5 V"},{t:"Wanders",ok:1}],
    reveal:s=>{s.float=true;}, settled:s=>s.t>=3||BC.reduced},
   {id:"pulldown",kind:"do",prompt:"Add a pull-down resistor to the gate.",
    insight:"The resistor gives the gate a floor to rest on. Unplugged, it settles at 0 V: off.",
    setup:s=>{s.mode="mos";s.Vg=5;s.float=true;}, ro:["gate","main","heat"],
    actions:[{label:s=>s.pd?"Pull-down added":"Add pull-down",run:s=>{s.pd=true;}}],
    goal:s=>s.pd}
  ],
  end:{
   prompt:"These are the equations. Every number is yours.",
   rows:[
    {f:0,step:2,need:["ib2","ic2"],show:v=>`${TR.hFE} × ${amps(v.ib2)} = ${amps(TR.hFE*v.ib2)}`},
    {f:1,step:2,need:["ib2"],show:v=>`(${TR.V} V − ${TR.Vbe} V) / ${amps(v.ib2)} = ${fmt((TR.V-TR.Vbe)/v.ib2,"Ω",3)}`},
    {f:2,step:3,need:["vsat","isat"],show:v=>`${fmt(v.vsat,"V",2)} × ${amps(v.isat)} = ${fmt(v.vsat*v.isat,"W",2)}`},
    {f:3,step:7,need:["mI","mV"],show:v=>`(${amps(v.mI)})² × ${fmt(v.mV/v.mI,"Ω",2)} = ${fmt(v.mV*v.mI,"W",2)}`}
   ]
  }
 },
 8:{
  xp:40, widget:leds, hotspot:{a:"j0",b:"k0"},
  steps:[
   {id:"colours",kind:"predict",prompt:"A 3 V supply feeds three LEDs. Which light up?",
    insight:"Each colour has its own step height. Blue's step eats the whole 3 V, leaving no slope.",
    setup:s=>{s.cols=["red","yel","blu"];s.R=100;s.V=0;}, ro:["red","yel","blu"], cols:2,
    choices:[{t:"All three"},{t:"Red and yellow",ok:1},{t:"Only red"},{t:"None"}],
    reveal:s=>{s.Vgoal=3;s.Vrate=1.5;}, settled:s=>s.Vgoal===null},
   {id:"blue",kind:"do",prompt:"Raise the supply until blue lights.",
    insight:"Blue has the tallest step, so it needs the highest supply before anything flows.",
    setup:s=>{s.cols=["red","yel","blu"];s.R=100;s.V=3;}, ro:["V","red","blu"], sliders:[{k:"V",label:"Supply",min:1,max:6,step:.1,grip:{node:"e"}}],
    goal:(s,o)=>Math.abs(o.I.D2)>.001},
   {id:"burn",kind:"predict",prompt:"Pull the resistor out. The red LED...?",
    insight:"No resistor, no slope to take the extra height. The flow soars and the LED burns.",
    setup:s=>{s.V=5;s.R=330;}, ro:["V","I","peak"], cols:3,
    choices:[{t:"Glows brighter"},{t:"Burns out",ok:1},{t:"Nothing changes"}],
    reveal:s=>{s.noR=true;}, settled:s=>s.burnt},
   {id:"size",kind:"hit",prompt:"Set the red LED to 10 mA. Drag R.",
    insight:"The resistor takes what the step leaves. About 310 Ω passes 10 mA at 5 V.",
    setup:s=>{s.V=5;s.R=1500;}, ro:["I","bright"], sliders:[{k:"R",label:"R",log:[47,2200],grip:{edge:"R0"}}],
    target:{of:"I",to:.01,tol:.04,show:amps}, keep:(s,v)=>{v.hI=Math.abs(solve(ledCircuit(s)).I.D0);v.hV=s.V;}},
   {id:"stack",kind:"predict",prompt:"Two red LEDs in series. About what supply lights both?",
    insight:"Steps stack: 1.9 V plus 1.9 V. The lift must clear both before anything flows.",
    setup:s=>{s.nLed=2;s.R=100;s.V=0;}, ro:["V","I","bright"], cols:3,
    choices:[{t:"2 V"},{t:"4 V",ok:1},{t:"8 V"}],
    reveal:s=>{s.Vgoal=6;s.Vrate=1.2;}, settled:s=>s.Vgoal===null},
   {id:"size2",kind:"hit",prompt:"Two reds on 9 V. Set 10 mA with R.",
    insight:"Both steps come off the top first. About 520 Ω passes 10 mA.",
    setup:s=>{s.nLed=2;s.V=9;s.R=2000;}, ro:["I","bright"], sliders:[{k:"R",label:"R",log:[47,2200],grip:{edge:"R0"}}],
    target:{of:"I",to:.01,tol:.04,show:amps}, keep:(s,v)=>{v.hI2=Math.abs(solve(ledCircuit(s)).I.D0);v.hV2=s.V;}},
   {id:"pwm",kind:"predict",prompt:"Pulse the gate on half the time, fast. The LED looks...?",
    insight:"Too fast to follow: your eye averages the flashes. Half the time on, half the brightness.",
    setup:s=>{s.duty=.5;s.f=2;s.fGoal=2;}, ro:["speed","avg","bright"], cols:3,
    choices:[{t:"Full brightness"},{t:"About half",ok:1},{t:"Dark"}],
    reveal:s=>{s.pwm=true;s.fGoal=200;if(BC.reduced) s.f=200;}, settled:s=>s.f>=s.fGoal},
   {id:"duty",kind:"hit",prompt:"Dim it to a quarter. Drag the on-time.",
    insight:"Brightness follows the average flow. Shorter pulses, dimmer light, same wiring.",
    setup:s=>{s.pwm=true;s.f=200;s.fGoal=200;s.duty=.8;}, ro:["avg","bright"], sliders:[{k:"duty",label:"Gate on-time",min:.05,max:1,step:.01,fmt:s=>Math.round(s.duty*100)+"%"}],
    target:{of:"duty",to:.25,tol:.06,show:p=>Math.round(p*100)+"%"}, keep:(s,v)=>{v.dty=s.duty;v.ion=Math.abs(ledOn(s).I.D0);}}
  ],
  end:{
   prompt:"These are the equations. Every number is yours.",
   rows:[
    {f:0,step:4,need:["hI","hV"],show:v=>`(${v.hV} V − ${LEDK.red.vf} V) / ${amps(v.hI)} = ${fmt((v.hV-LEDK.red.vf)/v.hI,"Ω",3)}`},
    {f:1,step:4,need:["hI","hV"],show:v=>`(${v.hV} V − ${LEDK.red.vf} V) × ${amps(v.hI)} = ${fmt((v.hV-LEDK.red.vf)*v.hI,"W",2)}`},
    {f:2,step:6,need:["hI2","hV2"],show:v=>`(${v.hV2} V − 2 × ${LEDK.red.vf} V) / ${amps(v.hI2)} = ${fmt((v.hV2-2*LEDK.red.vf)/v.hI2,"Ω",3)}`},
    {eq:"I avg = on-time × I",what:"A pulsed gate",step:8,need:["dty","ion"],show:v=>`${Math.round(v.dty*100)}% × ${amps(v.ion)} = ${amps(v.dty*v.ion)}`}
   ]
  }
 },
 9:{
  xp:40, widget:power,
  steps:[
   {id:"swing",kind:"hit",prompt:"Drag the swing until the tower peaks at 9 V.",
    insight:"The load's ledge rises and falls with the tower. Below the floor, the flow runs backward.",
    setup:s=>{s.pk=12;}, ro:["src","out","flow"], sliders:[{k:"pk",label:"Swing",min:2,max:16,step:.5,fmt:s=>s.pk.toFixed(1)+" V peak",grip:{node:"e"}}],
    target:{of:"pk",to:9,tol:.01,show:volts}},
   {id:"diode",kind:"predict",prompt:"Put a diode in the line. What reaches the load?",
    insight:"Below the floor the diode shuts, its ledge dead. Only upward swings pass, 0.7 V shorter.",
    setup:s=>{s.pk=12;}, ro:["src","out"], cols:2,
    choices:[{t:"Everything"},{t:"Only the top half",ok:1},{t:"Only the bottom half"},{t:"Nothing"}],
    reveal:s=>{s.diode=true;s.chg=s.t;}, settled:s=>s.t>=s.chg+.04},
   {id:"tank",kind:"predict",prompt:"Add a tank across the load. Between peaks, the load's height...?",
    insight:"The tank spends stored height while the source is below it, so the load only sags a little.",
    setup:s=>{s.pk=12;s.diode=true;}, ro:["src","out"], cols:3,
    choices:[{t:"Drops to the floor"},{t:"Sags slowly",ok:1},{t:"Holds exactly"}],
    reveal:s=>{s.tank=true;s.chg=s.t;}, settled:s=>s.t>=s.chg+.06},
   {id:"big",kind:"predict",prompt:"Swap in a tank 4× bigger. The ripple...?",
    insight:"The same drain from four times the storage: a quarter of the sag.",
    setup:s=>{s.diode=true;s.tank=true;s.pre=.4;}, ro:["rip","was","out"], cols:2,
    choices:[{t:"4× bigger"},{t:"The same"},{t:"4× smaller",ok:1},{t:"Gone"}],
    reveal:s=>{s.was=s.rip;s.C*=4;s.warm=false;}, settled:s=>s.t>=s.chg+s.pre+.04&&s.rip!==null},
   {id:"load",kind:"do",prompt:"Heavier load, faster drain. Push the load until ripple tops 3 V.",
    insight:"More flow drains the tank faster between peaks, so it sags further. Ripple follows load flow.",
    setup:s=>{s.diode=true;s.tank=true;s.pre=.4;s.Il=.033;}, ro:["flow","rip","out"], sliders:[{k:"Il",label:"Load",log:[.03,.25],fmt:s=>Math.round(s.Il*1000)+" mA"}],
    goal:s=>s.rip!==null&&s.rip>=3},
   {id:"size",kind:"hit",prompt:"Pick the tank so the ripple reads 1 V.",
    insight:"About 2 mF holds this load to 1 V. Halving the ripple always costs double the tank.",
    setup:s=>{s.diode=true;s.tank=true;s.pre=.4;}, ro:["rip","flow","out"], sliders:[{k:"C",label:"Tank",log:[2.2e-4,4.7e-3],fmt:s=>fmt(s.C,"F"),grip:{edge:"C"}}],
    target:{of:"rip",to:1,tol:.1,show:volts}, keep:(s,v)=>{v.hitC=s.C;v.hitI=s.iAvg;v.hitRip=s.rip;}},
   {id:"reg",kind:"do",prompt:"Add a regulator after the tank. Watch the output ledge.",
    insight:"The output stays flat at 5 V. The height above it falls across the regulator.",
    setup:s=>{s.diode=true;s.tank=true;s.C=2.2e-3;s.RL=50;s.pre=.4;}, ro:["vin","out","fall"],
    actions:[{label:()=>"Add regulator",when:s=>!s.reg,run:s=>{s.reg=true;s.warm=false;}}],
    goal:s=>s.reg&&s.t>=s.chg+s.pre+.04},
   {id:"heat",kind:"predict",prompt:"The source rises from 8 V to 16 V peak. Regulator heat...?",
    insight:"The output never moved, but the fall above it did. Heat is that fall times the flow.",
    setup:s=>{s.pk=8;s.diode=true;s.tank=true;s.C=2.2e-3;s.RL=50;s.reg=true;s.pre=.4;}, ro:["vin","fall","heat"], cols:3,
    choices:[{t:"No change"},{t:"Doubles"},{t:"Over 4×",ok:1}],
    reveal:s=>{s.pk=16;s.warm=false;}, settled:s=>s.t>=s.chg+s.pre+.04, keep:(s,v)=>{v.vin=s.vinAvg;v.iout=s.iAvg;}}
  ],
  end:{
   prompt:"These are the equations. Every number is yours.",
   rows:[
    {eq:"Vripple ≈ I / (f · C)",what:"Half-wave ripple; full-wave halves it",step:6,need:["hitC","hitI","hitRip"],show:v=>`${amps(v.hitI)} / (${PW.f} Hz × ${fmt(v.hitC,"F")}) = ${volts(+(v.hitI/(PW.f*v.hitC)).toFixed(2))}, you read ${volts(+v.hitRip.toFixed(2))}`},
    {f:0,step:8,need:["vin","iout"],show:v=>`(${volts(+v.vin.toFixed(1))} − ${PW.Vreg} V) × ${amps(v.iout)} = ${watts((v.vin-PW.Vreg)*v.iout)}`},
    {f:1,step:8,need:["vin"],show:v=>`${PW.Vreg} V / ${volts(+v.vin.toFixed(1))} = ${Math.round(PW.Vreg/v.vin*100)}%`}
   ]
  }
 }
};

/* ---------- engine ---------- */
const rec=n=>S.lessons[n]||(S.lessons[n]={step:0,max:0,vals:{},pred:{}});
BC.lessonFor=n=>BC.LESSONS[n]||null;
/* {step,total,done} for labels elsewhere; step is 0-based */
BC.lessonProgress=n=>{ const L=BC.LESSONS[n], r=S.lessons[n]; if(!L) return null; const total=L.steps.length; return {step:r?clamp(r.step,0,total):0,total,done:!!(r&&r.done),started:!!(r&&r.step>0)}; };

BC.mountLesson=function(host,n,opts={}){
  const L=BC.LESSONS[n], W=L.widget, c=BC.DATA.M[n-1], total=L.steps.length;
  host.innerHTML=`<div class="ls" data-lesson="${n}">
    <p class="lsP" tabindex="-1"></p>
    <div class="lsDots" role="group" aria-label="Lesson progress"></div>
    <div class="lsStage"></div>
    <div class="lsRO"></div>
    <div class="lsC"></div>
    <div class="lsF"><p class="lsI" aria-live="polite"></p><div class="lsNext"></div></div>
    <ol class="lsEnd" hidden></ol>
  </div>`;
  const root=$(".ls",host), stage=$(".lsStage",root), T=Terrain(stage);
  const ui={dots:$(".lsDots",root),p:$(".lsP",root),ro:$(".lsRO",root),c:$(".lsC",root),i:$(".lsI",root),next:$(".lsNext",root),end:$(".lsEnd",root)};
  /* the Height / Schematic toggle sits in a corner of the picture */
  const tog=document.createElement("div"); tog.className="lsTog"; tog.setAttribute("role","group"); tog.setAttribute("aria-label","Picture"); tog.innerHTML=`<button type="button" data-v="height">Height</button><button type="button" data-v="schem">Schematic</button>`; stage.appendChild(tog);
  const syncTog=()=>$$("button",tog).forEach(b=>b.setAttribute("aria-pressed",b.dataset.v===viewPref));
  tog.addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return; T.setView(b.dataset.v); syncTog(); BC.beep("click"); kick(); }); syncTog();
  let s=null, step=null, idx=0, ok=false, hold=null, sliders=[], picked=null, gone=new Set(), leads=[], hits={}, sol=null, keptPick=false;
  BC.leave.push(()=>clearTimeout(hold));
  const kick=()=>{ BC.redraw(); };
  const save=()=>BC.save();
  /* the frame takes the viewport below it and keeps that height for every step */
  let fitW=0, fitH=0;
  const sizeFrame=()=>{ const w=innerWidth, h=innerHeight; if(w===fitW&&Math.abs(h-fitH)<120) return; fitW=w; fitH=h; const top=root.getBoundingClientRect().top+scrollY, narrow=root.clientWidth<620; root.style.setProperty("--lsH",clamp(h-top-(narrow?0:14),narrow?520:540,narrow?1000:960)+"px"); };
  sizeFrame(); addEventListener("resize",sizeFrame); BC.leave.push(()=>removeEventListener("resize",sizeFrame));
  if(document.fonts&&document.fonts.ready) document.fonts.ready.then(()=>{ if(root.isConnected){ fitW=0; sizeFrame(); } });

  function renderDots(){
    const r=S.lessons[n]||{max:0,done:false};
    let h=L.steps.map((st,i)=>{ const cls=i<idx?"on":i===idx?"cur":""; const can=i<=Math.max(r.max,idx); return `<button type="button" class="${cls}" data-i="${i}" ${can?"":"disabled"} aria-label="Step ${i+1} of ${total}${i<idx?", done":""}"${i===idx?' aria-current="step"':""}></button>`; }).join("");
    h+=`<button type="button" class="sum ${idx===total?"cur":""}" data-i="${total}" ${r.done?"":"disabled"} aria-label="Equations"${idx===total?' aria-current="step"':""}></button>`;
    ui.dots.innerHTML=`<span class="lsN">${idx<total?idx+1+"/"+total:"="}</span>${h}`;
  }
  ui.dots.addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b||b.disabled) return; const r=rec(n); r.step=+b.dataset.i; save(); show(+b.dataset.i); focusPrompt(); });
  const focusPrompt=()=>ui.p.focus({preventScroll:true});

  /* ----- one step ----- */
  function show(i){
    clearTimeout(hold); idx=i; ok=false; picked=null; gone=new Set(); leads=[]; hits={}; keptPick=false;
    root.classList.toggle("isEnd",i===total); renderDots();
    if(i===total) return showEnd();
    step=L.steps[i]; const v=rec(n).vals;
    s=W.fresh(); step.setup(s,v);
    ui.end.hidden=true; ui.p.textContent=step.prompt; ui.i.textContent="";
    $$(".lsPt,.lsHot",stage).forEach(e=>e.remove()); T.pts=[]; T.hot=null; T.leads=[]; T.ring=null; T.smoke.length=0; T.plume=null; T.sparks.length=0; T.rings.length=0; T.prev={}; T.vm=null;
    buildControls(); buildNext();
    T.set(W.circuit(s)); sol=T.sol;
    update(); kick();
  }
  function buildNext(){
    ui.next.innerHTML=`<button type="button" class="btn primary lsNx" disabled>${idx===total-1?"Equations":"Next"} →</button>`;
    $(".lsNx",ui.next).addEventListener("click",()=>{ const r=rec(n); r.step=idx+1; r.max=Math.max(r.max,idx+1); if(r.step===total) finish(r); save(); show(r.step); focusPrompt(); });
  }
  function finish(r){ r.done=1; BC.once("lesson-"+n,L.xp,`module ${n} lesson`); BC.beep("good"); }

  function buildControls(){
    let h=""; const cellTarget=step.target;
    ui.ro.innerHTML=step.ro.map(k=>`<div class="ro"><div class="k">${esc(W.ro[k][0])}</div><div class="v" data-k="${k}">—</div></div>`).join("")+(cellTarget?`<div class="ro lsTarget"><div class="k">Target</div><div class="v">${esc(cellTarget.show(cellTarget.to))}</div></div>`:"");
    sliders=step.sliders||[]; T.grips=sliders.filter(x=>x.grip).map(x=>x.grip); stage.classList.toggle("grippy",T.grips.length>0);
    /* a grip's hit area alone takes touch for itself, so a pan that starts anywhere else in the picture still scrolls the page */
    $$(".lsGrip",stage).forEach(e=>e.remove()); T.gripEls=sliders.filter(x=>x.grip).map(x=>{ const el=document.createElement("div"); el.className="lsGrip"; el.setAttribute("aria-hidden","true"); stage.appendChild(el); return {el,grip:x.grip}; });
    if(sliders.length) h+=`<div class="lsSl">`+sliders.map(sd=>{ const id=`ls-${sd.k}`;
      const a=sd.log?`min="${Math.log10(sd.log[0])}" max="${Math.log10(sd.log[1])}" step="0.005"`:`min="${sd.min}" max="${sd.max}" step="${sd.step}"`;
      return `<div class="lsS"><label for="${id}">${esc(sd.label)}</label><input type="range" id="${id}" data-k="${sd.k}" ${a}><output for="${id}"></output></div>`; }).join("")+`</div>`;
    (step.actions||[]).forEach((a,k)=>{ h+=`<button type="button" class="btn lsAct" data-a="${k}"></button>`; });
    if(step.kind==="predict") h+=`<div class="lsCh" style="--cols:${step.cols||2}">`+step.choices.map((ch,k)=>`<button type="button" class="btn" data-c="${k}">${esc(ch.t)}</button>`).join("")+`</div>`;
    if(step.kind==="probe") h+=`<div class="lsMeter"><div class="lsRead"><span class="k">Meter</span><span class="v" aria-live="polite">—</span></div>`+step.targets.map((t,k)=>`<div class="lsTick" data-t="${k}"><span>${esc(t.t)}</span><b>—</b></div>`).join("")+`</div>`;
    ui.c.innerHTML=h;
    $$("input[type=range]",ui.c).forEach(inp=>{ const sd=sliders.find(x=>x.k===inp.dataset.k); inp.value=sd.log?Math.log10(s[sd.k]):s[sd.k];
      inp.addEventListener("input",()=>{ s[sd.k]=sd.log?round3(Math.pow(10,+inp.value)):+inp.value; update(); kick(); }); });
    $$(".lsAct",ui.c).forEach(b=>b.addEventListener("click",()=>{ const a=step.actions[+b.dataset.a]; if(b.disabled) return; a.run(s); BC.beep("click"); syncSliders(); update(); kick(); }));
    $$(".lsCh button",ui.c).forEach(b=>b.addEventListener("click",()=>commit(+b.dataset.c)));
    if(step.points){ step.points.forEach(p=>{ const el=document.createElement("button"); el.type="button"; el.className="lsPt"; el.setAttribute("aria-label",p.label); el.setAttribute("aria-pressed","false"); el.addEventListener("click",()=>tapPoint(p)); stage.appendChild(el); p.el=el; T.pts.push(p); }); }
    if(step.hot){ const el=document.createElement("button"); el.type="button"; el.className="lsHot"; el.tabIndex=-1; el.setAttribute("aria-hidden","true"); el.addEventListener("click",()=>$(".lsAct",ui.c).click()); stage.appendChild(el); T.hot={el,...L.hotspot}; T.ring=L.hotspot; }
  }
  /* dragging the part itself moves its slider */
  let drag=null;
  const stagePt=ev=>{ const r=stage.getBoundingClientRect(); return [ev.clientX-r.left,ev.clientY-r.top]; };
  const gripSet=(sd,val)=>{ const inp=$(`#ls-${sd.k}`,ui.c); if(!inp||inp.disabled) return; inp.value=val; inp.dispatchEvent(new Event("input",{bubbles:true})); };
  const gripNear=(x,y)=>{ let best=null, bd=44*44; sliders.forEach(sd=>{ if(!sd.grip) return; const q=T.gripAt(sd.grip); if(!q) return; const d=(q[0]-x)*(q[0]-x)+(q[1]-y)*(q[1]-y); if(d<bd){ bd=d; best=sd; } }); return best; };
  stage.addEventListener("pointerdown",ev=>{ if(ev.target.closest("button")||viewPref!=="height"||!sliders.length) return; const [x,y]=stagePt(ev), best=gripNear(x,y); if(!best) return;
    const inp=$(`#ls-${best.k}`,ui.c); if(!inp||inp.disabled) return; drag={sd:best,x,y,v0:+inp.value,min:+inp.min,max:+inp.max}; T.grabbing=true; stage.classList.add("grabbing"); stage.setPointerCapture(ev.pointerId); ev.preventDefault(); kick(); });
  stage.addEventListener("pointermove",ev=>{ if(!drag){ if(ev.pointerType==="mouse"){ const [hx,hy]=stagePt(ev); stage.classList.toggle("gripNear",viewPref==="height"&&!!gripNear(hx,hy)&&!ev.target.closest("button")); } return; } const [x,y]=stagePt(ev), sd=drag.sd, g=sd.grip, geo=T.scale(); let val;
    if(g.walk) val=T.walkNear(x,y,s.pos);
    else if(g.node) val=drag.v0+(drag.y-y)/geo.hs;   /* a volt of drag is a volt of height */
    else val=drag.v0+(g.sign||-1)*(y-drag.y-(x-drag.x)*.5)/(geo.H*.5)*(drag.max-drag.min);
    gripSet(sd,clamp(val,drag.min,drag.max)); });
  const endDrag=()=>{ if(!drag) return; drag=null; T.grabbing=false; stage.classList.remove("grabbing"); kick(); };
  stage.addEventListener("pointerup",endDrag); stage.addEventListener("pointercancel",endDrag);
  function syncSliders(){ $$("input[type=range]",ui.c).forEach(inp=>{ const sd=sliders.find(x=>x.k===inp.dataset.k); inp.value=sd.log?Math.log10(s[sd.k]):s[sd.k]; }); }

  /* predict: the choice locks in before anything changes; a wrong guess only shows what really happens */
  function commit(k){
    const ch=step.choices[k]; if(picked!==null&&!step.retry) return; if(gone.has(k)||ok) return;
    const r=rec(n); if(!keptPick){ keptPick=true; if(r.pred[step.id]===undefined){ r.pred[step.id]=!!ch.ok; save(); } }
    picked=k; step.reveal(s,ch); BC.beep("click");
    $$(".lsCh button",ui.c).forEach((b,j)=>{ b.classList.toggle("picked",j===k); b.disabled=true; });
    update(); kick();
  }
  function settlePredict(){
    const ch=step.choices[picked]; 
    if(step.retry&&!ch.ok){ gone.add(picked); picked=null; $$(".lsCh button",ui.c).forEach((b,j)=>{ b.disabled=gone.has(j); b.classList.toggle("spent",gone.has(j)); b.classList.remove("picked"); }); return; }
    const wrong=!ch.ok;
    $$(".lsCh button",ui.c).forEach((b,j)=>{ if(step.choices[j].ok&&!step.retry||j===picked&&step.retry){ b.classList.add("real"); b.insertAdjacentHTML("beforeend",'<span class="sr"> (what happened)</span>'); } if(j===picked&&wrong) b.insertAdjacentHTML("beforeend",'<span class="sr"> (your pick)</span>'); });
    success();
  }

  /* probe: first tap red, next tap black, tap a placed lead to lift it, a third point moves black */
  function tapPoint(p){
    const at=leads.findIndex(x=>x&&x.id===p.id);
    if(at>=0) leads[at]=null; else if(!leads[0]) leads[0]=p; else if(!leads[1]) leads[1]=p; else leads[1]=p;
    BC.beep("click"); T.leads=leads; update(); kick();
  }
  function readProbe(){
    const rd=$(".lsRead .v",ui.c); $$(".lsPt",stage).forEach(el=>{ const p=T.pts.find(q=>q.el===el), on=leads.some(x=>x&&x.id===p.id); el.setAttribute("aria-pressed",on); });
    if(!(leads[0]&&leads[1])){ rd.textContent="—"; return; }
    const dv=sol.v[leads[0].node]-sol.v[leads[1].node]; const t=(Math.abs(dv)<.005?0:dv).toFixed(2)+" V"; if(rd.textContent!==t) rd.textContent=t;
    step.targets.forEach((tg,k)=>{ if(tg.test(dv,s)&&!hits[k]){ hits[k]=t; const c=$(`.lsTick[data-t="${k}"]`,ui.c); c.classList.add("got"); $("b",c).textContent=t; BC.beep("click"); } });
    if(step.targets.every((_,k)=>hits[k])&&!ok) success();
  }

  function success(){ if(ok) return; ok=true; ui.i.textContent=step.insight; const b=$(".lsNx",ui.next); b.disabled=false; if(step.keep){ step.keep(s,rec(n).vals); save(); } BC.beep("good"); }

  /* ----- live values ----- */
  function update(){
    if(!step||idx===total) return;
    sol=T.set(W.circuit(s));
    if(BC.reduced){ for(let i=0;i<3;i++){ const ev=W.tick(s,sol,0); if(ev) onEvent(ev); sol=T.set(W.circuit(s)); } }
    paint();
  }
  function onEvent(ev){ BC.beep("pop"); T.burst(W.fail[ev],W.clean&&W.clean[ev]); }
  function paint(){
    $$(".lsRO .v[data-k]",root).forEach(el=>{ const t=W.ro[el.dataset.k][1](s,sol); if(el.textContent!==t) el.textContent=t; });
    sliders.forEach(sd=>{ const o=$(`#ls-${sd.k}`,ui.c); if(!o) return; const t=sd.fmt?sd.fmt(s):sd.k==="V"?(s.V.toFixed(1)+" V"):fmt(s[sd.k],"Ω"), out=o.nextElementSibling; if(out.textContent!==t){ out.textContent=t; o.setAttribute("aria-valuetext",sd.fmt?t:sd.k==="V"?s.V+" volts":s[sd.k]+" ohms"); } o.disabled=!!s.burnt; });
    const swapped=step.swap&&step.swap(s), sl=$(".lsSl",ui.c); if(sl) sl.hidden=!!swapped; if(step.swap) T.grips=swapped?[]:sliders.map(x=>x.grip).filter(Boolean);
    $$(".lsAct",ui.c).forEach(b=>{ const a=step.actions[+b.dataset.a], t=a.label(s), on=!a.when||a.when(s); if(b.textContent!==t) b.textContent=t; b.hidden=!on; });
    cv_alt();
    if(step.kind==="probe") readProbe();
    if(step.kind==="hit") checkHit();
    if(step.kind==="do"&&!ok&&step.goal(s,sol)) success();
    if(step.kind==="predict"&&picked!==null&&!ok&&step.settled(s,sol)&&!W.busy(s)) settlePredict();
    if(step.hot) { T.ring=s.closed?null:L.hotspot; const h=$(".lsHot",stage); if(h) h.classList.toggle("on",!s.closed); }
  }
  function checkHit(){
    const t=step.target, val=W.val[t.of](s,sol), inT=Math.abs(val-t.to)<=t.to*t.tol, cell=$(".lsTarget",root); if(cell) cell.classList.toggle("hit",inT);
    if(ok) return; if(!inT){ clearTimeout(hold); hold=null; return; }
    if(!hold) hold=setTimeout(()=>{ hold=null; const v2=W.val[t.of](s,sol); if(Math.abs(v2-t.to)<=t.to*t.tol) success(); },280);
  }
  function cv_alt(){ const t=`${viewPref==="height"?"Landscape where height is voltage":"Schematic"}: ${W.alt(s,sol)}`; if(T.cv.getAttribute("aria-label")!==t) T.cv.setAttribute("aria-label",t); }

  /* ----- the end: the module's equations, each lit by a value the learner made ----- */
  function showEnd(){
    step=null; T.grips=[]; T.gripEls=[]; $$(".lsGrip",stage).forEach(e=>e.remove()); stage.classList.remove("grippy"); ui.p.textContent=L.end.prompt; ui.i.textContent=""; ui.ro.innerHTML=""; ui.c.innerHTML=""; $$(".lsPt,.lsHot",stage).forEach(e=>e.remove());
    const r=rec(n), v=r.vals;
    ui.end.innerHTML=L.end.rows.map(row=>{ const eq=row.eq||c.formulas[row.f][0], what=row.what||c.formulas[row.f][1], have=row.need.every(k=>typeof v[k]==="number"), val=have?row.show(v):"—";
      return `<li><div class="eq">${esc(eq)}</div><div class="what">${esc(what)}</div><div class="lit">${esc(val)}</div><div class="from">step ${row.step}</div></li>`; }).join("");
    ui.end.hidden=false;
    const pv=L.steps.filter(x=>x.kind==="predict"), right=pv.filter(x=>r.pred[x.id]).length;
    ui.i.textContent=`You predicted ${right} of ${pv.length}.`;
    ui.next.innerHTML=`<button type="button" class="btn lsReplay">Replay</button><a class="btn primary" href="#m-${n}/quiz">Quiz →</a>`;
    $(".lsReplay",ui.next).addEventListener("click",()=>{ r.step=0; r.pred={}; save(); show(0); focusPrompt(); });
  }

  /* ----- run ----- */
  BC.anim(dt=>{
    if(idx===total||!step){ return; }
    if(dt>0&&!BC.reduced){ const ev=W.tick(s,sol,dt); if(ev) onEvent(ev); sol=T.set(W.circuit(s)); paint(); }
    T.frame(dt);
  },()=>T.moving());
  /* reduced motion: time moves in discrete steps with the clock on screen, never continuously */
  if(BC.reduced&&W.quantum){ const tm=setInterval(()=>{ if(!step||idx===total||!W.running(s)) return; const ev=W.tick(s,sol,W.quantum(s)); if(ev) onEvent(ev); update(); kick(); },650); BC.leave.push(()=>clearInterval(tm)); }
  const r0=S.lessons[n]; show(r0?clamp(r0.step|0,0,total):0);
  T.rise();
  return {root,terrain:T};
};
BC.terrain={solve,timeStep,Terrain,TYPES};
})();
