/* Lessons: short do-it-first sequences around one live circuit.
   Three layers, top of file to bottom:
   1. Terrain: draws any circuit description as an isometric landscape where height is node voltage, and morphs it flat into a schematic.
   2. The engine: one step at a time (do, hit, predict, probe), fixed layout, saved progress, XP once.
   3. BC.LESSONS: lesson data keyed by module number. */
(function(){
const BC=window.BC, {$,$$,esc,S,css,clamp,fmt}=BC, {txt,smoke,drawSmoke}=BC.draw;

/* ---------- circuit description ----------
   {gnd:"g", vmax:18, iref:.06, pref?:W, rspan?:[lo,hi], nodes:{id:{at:[u,v], flat:[u,v]?, pad?, tag?, gauge?, was?}}, edges:[{id,t,a,b,...}], walk?:{path,t}}
   at is the plan position; flat overrides it in the schematic. An edge may add via:[[u,v]...], label (printed on the floor), lab:[du,dv], labf:[dx,dy], tag (floats above its b node), tagOff:[dx,dy], ghost (not connected yet: a dashed outline on the floor that rises when it connects).
   Height is node voltage on one scale, vmax = the full height of the frame. Add a part by adding one entry to TYPES: g(e) is its conductance (0 = open), solid(c) adds its blocks to the landscape, symbol(c) paints the schematic.
   A capacitor at DC is g:0; a diode or transistor can return a conductance from e.state set by the lesson. */
const WIRE_G=1e5;   /* 10 µΩ: wires drop next to nothing, and their current stays known */
const TYPES={
  wire:{g:e=>e.ghost?0:WIRE_G, solid:c=>c.run({hw:c.e.hw}), symbol:c=>c.line()},
  resistor:{g:e=>e.open||e.ghost?0:1/e.R, solid:solidResistor, symbol:symResistor},
  switch:{g:e=>e.closed?WIRE_G:0, solid:solidSwitch, symbol:symSwitch},
  fuse:{g:e=>e.blown?0:WIRE_G, solid:solidFuse, symbol:symFuse},
  source:{solid:solidSource, symbol:symSource}
};
/* modified nodal analysis; a tiny leak to ground puts floating nodes on the floor */
function solve(d){
  const ids=Object.keys(d.nodes).filter(k=>k!==d.gnd), ix={}; ids.forEach((k,i)=>ix[k]=i);
  const srcs=d.edges.filter(e=>e.t==="source"), n=ids.length, N=n+srcs.length;
  const A=Array.from({length:N},()=>new Array(N+1).fill(0));
  for(let i=0;i<n;i++) A[i][i]=1e-12;
  const gs={};
  d.edges.forEach(e=>{ if(e.t==="source") return; const g=gs[e.id]=TYPES[e.t].g(e), a=ix[e.a], b=ix[e.b]; if(!g) return;
    if(a!==undefined) A[a][a]+=g; if(b!==undefined) A[b][b]+=g; if(a!==undefined&&b!==undefined){ A[a][b]-=g; A[b][a]-=g; } });
  srcs.forEach((e,j)=>{ const r=n+j, a=ix[e.a], b=ix[e.b];
    if(a!==undefined){ A[a][r]+=1; A[r][a]-=1; } if(b!==undefined){ A[b][r]-=1; A[r][b]+=1; } A[r][N]=e.V; });
  for(let c=0;c<N;c++){ let p=c; for(let r=c+1;r<N;r++) if(Math.abs(A[r][c])>Math.abs(A[p][c])) p=r; [A[c],A[p]]=[A[p],A[c]];
    const q=A[c][c]; if(!q) continue; for(let r=0;r<N;r++){ if(r===c) continue; const f=A[r][c]/q; if(f) for(let k=c;k<=N;k++) A[r][k]-=f*A[c][k]; } }
  const x=A.map((row,i)=>row[i]?row[N]/row[i]:0), v={[d.gnd]:0}; ids.forEach((k,i)=>v[k]=x[i]);
  const I={}; d.edges.forEach(e=>{ I[e.id]=e.t==="source"?x[n+srcs.indexOf(e)]:(v[e.a]-v[e.b])*gs[e.id]; });
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
  const shadowCv=document.createElement("canvas"), floorCv=document.createElement("canvas");
  const T={cv,desc:null,sol:null,zs:{},zv:{},heat:{},flow:{},phi:{},pres:{},swing:{},m:viewPref==="height"?0:1,leads:[],smoke:[],sparks:[],rings:[],pts:[],hot:null,ring:null,flash:0,shake:0,clock:0,prev:{}};
  let geo=null, floorKey="", order=null, orderKey="", layout=null, layoutKey="", dprNow=1;
  const smooth=x=>x*x*(3-2*x);
  /* the view: the floor gets a bit over half the frame, and heights get what is left above the back corner, one scale for the whole frame */
  function fit(W,H){
    const D=T.desc; let U=0,V=0; Object.values(D.nodes).forEach(n=>{ U=Math.max(U,n.at[0]); V=Math.max(V,n.at[1]); });
    const E=.18, k=.3, c=.866, pad=6, span=U+V+2*E, slab=clamp(H*.022,5,13), room=34;
    const sc=Math.min((W-2*pad)/((U+V+4*E)*c),(H*.5)/(span*k));
    let oy=H-pad-slab-(U+V+2*E)*sc*k, hs=(oy-room-pad)/(D.vmax||18); const cap=sc*.105*18/(D.vmax||18);
    if(hs>cap){ oy-=(hs-cap)*(D.vmax||18)*.42; hs=cap; }
    geo={W,H,U,V,E,k,c,sc,oy,hs,slab,ox:W/2-(U-V)*sc*c/2,flatM:[Math.max(44,W*.11),60,Math.max(30,W*.08),40]};
  }
  const iso=(u,v,z)=>[geo.ox+(u-v)*geo.sc*geo.c, geo.oy+(u+v)*geo.sc*geo.k-z*geo.hs];
  const flat=(fu,fv)=>[geo.flatM[0]+fu/geo.U*(geo.W-geo.flatM[0]-geo.flatM[2]), geo.flatM[1]+fv/geo.V*(geo.H-geo.flatM[1]-geo.flatM[3])];
  const nodeF=n=>n.flat||n.at;
  const fromN=(n,z)=>({u:n.at[0],v:n.at[1],fu:nodeF(n)[0],fv:nodeF(n)[1],z});
  const lerpP=(A,B,t)=>({u:A.u+(B.u-A.u)*t,v:A.v+(B.v-A.v)*t,z:A.z+(B.z-A.z)*t,fu:A.fu+(B.fu-A.fu)*t,fv:A.fv+(B.fv-A.fv)*t});
  T.project=(pt,m)=>{ const a=iso(pt.u,pt.v,pt.z); if(m<=0) return a; const b=flat(pt.fu,pt.fv); return [a[0]+(b[0]-a[0])*m,a[1]+(b[1]-a[1])*m]; };
  T.nodeAt=(id,m=smooth(T.m))=>T.project(fromN(T.desc.nodes[id],T.zs[id]||0),m);
  T.set=desc=>{ T.desc=desc; T.sol=solve(desc); if(BC.reduced||!Object.keys(T.zs).length) settle();
    desc.edges.forEach(e=>{ if(e.t==="switch"){ const was=T.prev[e.id]; if(was===false&&e.closed&&!BC.reduced) T.rings.push({a:e.a,b:e.b,t:0,dur:.45,r:.34}); T.prev[e.id]=!!e.closed; } });
    return T.sol; };
  const settle=()=>{ const D=T.desc; for(const k in T.sol.v){ T.zs[k]=T.sol.v[k]; T.zv[k]=0; } for(const e of D.edges){ T.heat[e.id]=heatTarget(e); T.flow[e.id]=Math.abs(T.sol.I[e.id]||0); T.pres[e.id]=e.ghost?0:1; T.swing[e.id]=e.closed?0:1; } };
  const heatTarget=e=>{ if(e.t!=="resistor"||e.open||e.ghost) return 0; const I=T.sol.I[e.id]; return I*I*e.R/(e.rating||T.desc.pref||2); };
  /* everything comes up out of the floor when the picture first appears */
  T.rise=()=>{ if(!BC.reduced) T.pres={}; };
  T.setView=v=>{ viewPref=v; T.target=v==="height"?0:1; if(BC.reduced) T.m=T.target; };
  T.target=T.m;
  T.moving=()=>T.m!==T.target||T.shake>0||T.flash>0;
  /* a part failing: flash, shock ring, sparks, smoke, a kick to the frame */
  T.burst=id=>{ const e=T.desc.edges.find(x=>x.id===id); if(!e||BC.reduced) return; const a=T.nodeAt(e.a), b=T.nodeAt(e.b), x=(a[0]+b[0])/2, y=(a[1]+b[1])/2;
    for(let i=0;i<26;i++) smoke(T.smoke,x+BC.rand(-34,34),y-4);
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
    if(T.hot){ const a=T.nodeAt(T.hot.a), b=T.nodeAt(T.hot.b); place(T.hot.el,(a[0]+b[0])/2,(a[1]+b[1])/2); } };

  /* which nodes get a flat landing: corners, junctions, or any node that asks; ledges through a straight node stay one surface. Plan geometry only, so it is cached. */
  function index(){
    const D=T.desc, key=D.edges.map(e=>e.id+(e.ghost?"-":"")).join();
    if(key===layoutKey) return layout; layoutKey=key;
    const dirs={}, tower={}, add=(id,x,y)=>{ const L=Math.hypot(x,y); if(L<1e-6) return; (dirs[id]=dirs[id]||[]).push([x/L,y/L]); };
    D.edges.forEach(e=>{ if(e.t==="source"){ if(e.box){ tower[e.a]=e.box; tower[e.b]=e.box; } return; } if(e.ghost) return;
      const A=D.nodes[e.a].at, B=D.nodes[e.b].at, w0=(e.via&&e.via[0])||B, w1=(e.via&&e.via[e.via.length-1])||A;
      add(e.a,w0[0]-A[0],w0[1]-A[1]); add(e.b,w1[0]-B[0],w1[1]-B[1]); });
    const pad={}; Object.keys(D.nodes).forEach(id=>{ if(tower[id]){ pad[id]=tower[id]; return; } const n=D.nodes[id], d=dirs[id]||[]; const bent=d.length===2&&Math.abs(d[0][0]*d[1][0]+d[0][1]*d[1][1]+1)>1e-3; if(n.pad||d.length>=3||bent) pad[id]=HW; });
    return layout={pad,tower};
  }
  /* an edge's centre line, node to node, with flat runs across the landings at each end */
  function polyOf(e){
    const D=T.desc, na=D.nodes[e.a], nb=D.nodes[e.b], p=T.pres[e.id]===undefined?1:T.pres[e.id], A=fromN(na,(T.zs[e.a]||0)*p), B=fromN(nb,(T.zs[e.b]||0)*p), L=Math.hypot(A.u-B.u,A.v-B.v);
    if(e.via){ const list=[A]; e.via.forEach((w,i,all)=>{ const t=(i+1)/(all.length+1); list.push({u:w[0],v:w[1],fu:w[0],fv:w[1],z:A.z+(B.z-A.z)*t}); }); list.push(B); return {poly:list,run:list,full:list}; }
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
    const c={e,g,poly,pres:pr,swing:T.swing[e.id]===undefined?(e.closed?0:1):T.swing[e.id],glow:0,chute:HW};
    if(e.t==="resistor"){ const h=T.heat[e.id]||0; c.glow=Math.sqrt(h)*(h>1?1+.09*Math.sin(T.clock*34):1); if(T.flash>0&&T.flashId===e.id) c.glow=Math.max(c.glow,1+T.flash);
      if(D.rspan&&!e.inner){ const [lo,hi]=D.rspan, f=clamp(Math.log(e.R/lo)/Math.log(hi/lo),0,1); c.chute=HW*(1-.56*f); } }
    c.stream=gg=>streamOf(gg,e,polyInfo);
    c.run=o=>{ for(let i=0;i<run.length-1;i++) boxes.push(mkBox(e.id+":"+i,run[i],run[i+1],o)); if(e.via) for(let i=1;i<run.length-1;i++){ const q=run[i], w=(o&&o.hw)||HW; boxes.push(mkBox(e.id+":c"+i,{...q,u:q.u-w},{...q,u:q.u+w},{...o,hw:w})); } };
    c.stub=(t0,t1,o={})=>{ const A=run[0], B=run[run.length-1], z=t0<.5?A.z:B.z; boxes.push(mkBox(e.id+":s"+t0,{...lerpP(A,B,t0),z},{...lerpP(A,B,t1),z},o)); };
    /* the blade hangs from the live side when open and swings up to meet the far side when closed */
    c.plank=(t0,t1,sw)=>{ const A=run[0], B=run[run.length-1], zh=A.z, P0={...lerpP(A,B,t0),z:zh}, full=lerpP(A,B,t1), an=sw*1.25, L=Math.hypot(full.u-P0.u,full.v-P0.v), cosA=Math.cos(an), P1={...lerpP(P0,full,cosA),z:0};
      P1.z=Math.max(0,zh+(B.z-zh)*(1-sw)-Math.sin(an)*L*geo.sc/geo.hs); boxes.push(mkBox(e.id+":p",P0,P1,{style:"tower",hw:HW*.72})); };
    c.capsule=(t0,t1)=>{ const A=lerpP(run[0],run[run.length-1],t0), B=lerpP(run[0],run[run.length-1],t1), lift=9/geo.hs*pr; boxes.push(mkBox(e.id+":f",{...A,z:A.z+lift},{...B,z:B.z+lift},{style:"tower",hw:HW*.62,base:A.z})); };
    c.tower=()=>{ const n=D.nodes[e.a].at, s=e.box||HW, z=(T.zs[e.b]||0)*pr, Fa=nodeF(D.nodes[e.a]), Fb=nodeF(D.nodes[e.b]);
      const mkP=(u)=>({u,v:n[1],z,fu:(Fa[0]+Fb[0])/2,fv:(Fa[1]+Fb[1])/2});
      const inner=D.edges.find(x=>x.inner), hot=inner?Math.sqrt(T.heat[inner.id]||0):0; boxes.push(mkBox(e.id+":t",mkP(n[0]-s),mkP(n[0]+s),{style:"tower",hw:s,heat:hot>.25?hot*.8:0,after:(gg)=>towerMarks(gg,e,n,s,z)})); };
    return c;
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
    const vm=T.desc.vmax||18, off=(z)=>Math.max(0,z)/vm*.34;
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
    if(M>=1) return; const key=[W,H,dpr,geo.U,geo.V,geo.sc,geo.oy,geo.hs,PAL.key].join();
    if(key!==floorKey){ floorKey=key; floorCv.width=Math.round(W*dpr); floorCv.height=Math.round(H*dpr); const f=floorCv.getContext("2d"); f.setTransform(dpr,0,0,dpr,0,0); const P=PAL,{U,V,E,slab}=geo, q=slabCorners();
      /* the room's back walls carry the height scale, so the empty air above a low ledge still measures something */
      const vm=T.desc.vmax||18, wallH=vm*geo.hs, wall=(a,b)=>{ const gr=f.createLinearGradient(0,a[1]-wallH,0,a[1]); gr.addColorStop(0,rgb(P.floor2,0)); gr.addColorStop(1,rgb(P.floor2,P.dark?.7:.9)); f.fillStyle=gr; f.beginPath(); f.moveTo(a[0],a[1]); f.lineTo(b[0],b[1]); f.lineTo(b[0],b[1]-wallH); f.lineTo(a[0],a[1]-wallH); f.closePath(); f.fill(); };
      wall(q[0],q[1]); wall(q[0],q[3]);
      const stepV=vm>10?5:1; f.lineWidth=1; f.font=`500 11px ${FONT.mono}`; f.textAlign="left";
      for(let z=stepV;z<vm;z+=stepV){ const y=z*geo.hs; f.strokeStyle=rgb(P.grid,PAL.dark?.9:1); f.beginPath(); f.moveTo(q[3][0],q[3][1]-y); f.lineTo(q[0][0],q[0][1]-y); f.lineTo(q[1][0],q[1][1]-y); f.stroke(); f.fillStyle=rgb(P.muted,.8); f.fillText(z+" V",q[1][0]-34,q[1][1]-y-5); }
      /* contact shadow under the slab */
      f.save(); f.filter="blur(10px)"; f.fillStyle=rgb(P.shadow,P.dark?.7:.22); f.beginPath(); f.moveTo(q[3][0]+6,q[3][1]+slab+2); f.lineTo(q[2][0],q[2][1]+slab+8); f.lineTo(q[1][0]-6,q[1][1]+slab+2); f.lineTo(q[2][0],q[2][1]); f.closePath(); f.fill(); f.restore();
      f.fillStyle=rgb(P.slabV); f.beginPath(); f.moveTo(q[3][0],q[3][1]); f.lineTo(q[2][0],q[2][1]); f.lineTo(q[2][0],q[2][1]+slab); f.lineTo(q[3][0],q[3][1]+slab); f.closePath(); f.fill();
      f.fillStyle=rgb(P.slabU); f.beginPath(); f.moveTo(q[2][0],q[2][1]); f.lineTo(q[1][0],q[1][1]); f.lineTo(q[1][0],q[1][1]+slab); f.lineTo(q[2][0],q[2][1]+slab); f.closePath(); f.fill();
      const gr=f.createLinearGradient(q[0][0],q[0][1],q[2][0],q[2][1]); gr.addColorStop(0,rgb(P.floor2)); gr.addColorStop(1,rgb(P.floor)); f.fillStyle=gr; slabPath(f); f.fill();
      f.strokeStyle=rgb(P.grid); f.lineWidth=1; f.beginPath();
      for(let u=-E+.04+((E-.04)%.2);u<U+E-.01;u+=.2){ const a=iso(u,-E,0), b=iso(u,V+E,0); f.moveTo(a[0],a[1]); f.lineTo(b[0],b[1]); }
      for(let v=-E+.04+((E-.04)%.2);v<V+E-.01;v+=.2){ const a=iso(-E,v,0), b=iso(U+E,v,0); f.moveTo(a[0],a[1]); f.lineTo(b[0],b[1]); } f.stroke();
      f.strokeStyle=rgb(P.edge,.5); slabPath(f); f.stroke();
      const z=iso(U+E-.18,V+E-.06,0); f.font=`500 11px ${getComputedStyle(document.body).getPropertyValue("--f-mono")||"monospace"}`; f.fillStyle=rgb(P.muted); f.textAlign="right"; f.fillText("0 V",z[0]+2,z[1]+2);
    }
    g.save(); g.globalAlpha=1-M; g.setTransform(1,0,0,1,0,0); g.drawImage(floorCv,0,0); g.restore();
  }
  /* power lights the floor around a hot slope */
  function drawGlows(g,items){
    if(M>=1) return; const P=PAL;
    items.forEach(({e,info})=>{ if(e.t!=="resistor"||e.open||e.ghost) return; const h=T.heat[e.id]||0, i=Math.min(1.3,Math.sqrt(h)*(T.flash>0&&T.flashId===e.id?2:1)); if(i<.08) return;
      const A=info.run[0], B=info.run[info.run.length-1], mid=lerpP(A,B,.5), c=iso(mid.u+.1,mid.v+.1,0), a=iso(A.u,A.v,0), b=iso(B.u,B.v,0), L=Math.hypot(a[0]-b[0],a[1]-b[1])*.72+24, an=Math.atan2(b[1]-a[1],b[0]-a[0]);
      g.save(); g.globalCompositeOperation=P.dark?"lighter":"source-over"; g.translate(c[0],c[1]); g.rotate(an); g.scale(L,Math.max(26,geo.sc*.16));
      const gr=g.createRadialGradient(0,0,0,0,0,1), col=i>1?mix(P.accent,P.hot,Math.min(1,i-1)):P.accent; gr.addColorStop(0,rgb(col,Math.min(.55,i*(P.dark?.5:.36))*(1-M))); gr.addColorStop(1,rgb(col,0)); g.fillStyle=gr; g.beginPath(); g.arc(0,0,1,0,7); g.fill(); g.restore(); });
  }
  /* floor print: a label lying on the base, standing up as the picture morphs flat */
  function drawPrint(g,items){
    const P=PAL, {c,k,sc}=geo, size=clamp(sc*.115,15,34), sz=size+(13-size)*M, skew=k/c;
    g.textAlign="center"; g.textBaseline="middle"; g.font=`600 ${sz}px ${FONT.display}`;
    items.forEach(({e,info})=>{ if(!e.label) return; const lines=Array.isArray(e.label)?e.label:[e.label], lab=e.lab||[0,.25], P0=info.poly[0], P1=info.poly[info.poly.length-1], q={u:(P0.u+P1.u)/2+lab[0],v:(P0.v+P1.v)/2+lab[1],z:0,fu:(P0.fu+P1.fu)/2,fv:(P0.fv+P1.fv)/2}, f=e.labf||[0,-22];
      const pos=T.project(q,M); pos[0]+=f[0]*M; pos[1]+=f[1]*M;
      g.save(); g.translate(pos[0],pos[1]); g.transform(1,skew*(1-M),-1*(1-M),skew+(1-skew)*M,0,0); g.fillStyle=e.labc?rgb(P[e.labc]):rgb(P.muted);
      lines.forEach((t,i)=>g.fillText(t,0,(i-(lines.length-1)/2)*sz*1.12)); g.restore(); });
    g.textBaseline="alphabetic";
  }
  const FONT={};
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
    if(e.t==="resistor"&&e.open||e.t==="fuse"&&e.blown||e.t==="switch"&&!e.closed) return;
    const vel=sc*.6*clamp(Math.sqrt(x),0,3.2), sgn=I<0?-1:1, offHere=offs[e.id]||0;
    const hw=(e.t==="resistor"&&D.rspan&&!e.inner)?HW*(1-.56*clamp(Math.log(e.R/D.rspan[0])/Math.log(D.rspan[1]/D.rspan[0]),0,1)):(e.hw||HW), w=Math.min(hw*.94,HW*.98*Math.sqrt(x)), hot=Math.sqrt(T.heat[e.id]||0);
    const col=hot>.45?rgb(mix(P.accent,P.dark?P.hot:[255,255,255],clamp((hot-.45)*1.6,0,1))):P.accentS, streak=clamp(vel*.055,1,spacing*.8);
    /* the water under the grains */
    const shrink=1-M*.75, walk=sgn>0?poly:poly.slice().reverse(), lens=sgn>0?pl:pl.slice().reverse();
    g.fillStyle=rgb(P.accent,(P.dark?.3:.2)*fade);
    for(let i=0;i<walk.length-1;i++){ const a=walk[i], b=walk[i+1], l=lens[i]/sc; if(l<1e-6) continue; const nu=-(b.v-a.v)/l*w*shrink, nv=(b.u-a.u)/l*w*shrink, p1=corner(a,nu,nv,a.z), p2=corner(b,nu,nv,b.z), p3=corner(b,-nu,-nv,b.z), p4=corner(a,-nu,-nv,a.z); poly4(g,p1,p2,p3,p4); g.fill(); }
    /* the grains: each lane a fixed row, so changing the current never scrambles them */
    g.strokeStyle=col; g.lineCap="round"; g.lineWidth=lw;
    LANES.forEach((j,ix)=>{ const l=j*LANE, al=Math.abs(l); if(al>w+LANE*.35) return; const a=clamp((w-al)/(LANE*.7)+.6,.25,1); g.globalAlpha=a*fade;
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
  function drawGhosts(g,items){
    const P=PAL; items.forEach(({e,info})=>{ const pr=T.pres[e.id]===undefined?1:T.pres[e.id]; if(pr>=.98||e.t==="source") return; const a=info.run[0], b=info.run[info.run.length-1], du=b.u-a.u, dv=b.v-a.v, L=Math.hypot(du,dv); if(L<1e-6) return; const nu=-dv/L*HW, nv=du/L*HW, q=[[a,nu,nv],[b,nu,nv],[b,-nu,-nv],[a,-nu,-nv]].map(([p,x,y])=>corner({...p,z:0},x,y,0));
      g.save(); g.globalAlpha=1-pr; g.strokeStyle=P.mutedS; g.lineWidth=1.5; g.setLineDash([5,5]); poly4(g,q[0],q[1],q[2],q[3]); g.stroke(); g.restore(); });
  }
  /* node marks: a measuring post, a floating value, the height a node used to have */
  function drawNodeMarks(g){
    const D=T.desc, P=PAL, a1=1-M;
    Object.keys(D.nodes).forEach(id=>{ const n=D.nodes[id], z=T.zs[id]||0, q=T.nodeAt(id,M);
      if(n.gauge&&M<1){ g.save(); g.globalAlpha=a1; const top=Math.max(...n.gauge), f=iso(n.at[0],n.at[1],0), t=iso(n.at[0],n.at[1],top); g.strokeStyle=P.accentS; g.lineWidth=1.5; g.setLineDash([3,4]); g.beginPath(); g.moveTo(f[0],f[1]); g.lineTo(t[0],t[1]); g.stroke(); g.setLineDash([]);
        n.gauge.forEach(v=>{ const p=iso(n.at[0],n.at[1],v); g.strokeStyle=P.accentS; g.lineWidth=1.5; g.beginPath(); g.moveTo(p[0]-7,p[1]); g.lineTo(p[0]+7,p[1]); g.stroke(); tag(g,v+" V",p[0]+12,p[1]+4,P.accentS,12,"left"); }); g.restore(); }
      if(n.was!==undefined&&M<1&&Math.abs(n.was-z)>.02){ const w=iso(n.at[0],n.at[1],n.was), p=iso(n.at[0],n.at[1],z); g.save(); g.globalAlpha=a1; g.strokeStyle=P.accentS; g.lineWidth=1.5; g.setLineDash([3,4]); g.beginPath(); g.moveTo(p[0],p[1]); g.lineTo(w[0],w[1]); g.stroke(); g.setLineDash([]); g.beginPath(); g.ellipse(w[0],w[1],HW*geo.sc*.9,HW*geo.sc*.34,0,0,7); g.stroke(); if((n.was-z)*geo.hs>30) tag(g,n.wasLabel||"",w[0],w[1]-HW*geo.sc*.34-6,P.mutedS,12); g.restore(); }
      if(n.tag) tag(g,n.tag,q[0]+(n.tagOff?n.tagOff[0]:0),q[1]+(n.tagOff?n.tagOff[1]:-14),n.tagc?P[n.tagc+"S"]:P.inkS,clamp(geo.sc*.05,13,16));
    });
    if(D.walk){ const w=walkAt(D,T.zs,D.walk), f=iso(w.u,w.v,0), p=iso(w.u,w.v,w.z), r=clamp(geo.sc*.032,6,10);
      g.save(); g.globalAlpha=a1; g.strokeStyle=P.inkS; g.lineWidth=1.5; g.setLineDash([2,3]); g.beginPath(); g.moveTo(f[0],f[1]); g.lineTo(p[0],p[1]-r); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.ellipse(f[0],f[1],r*.9,r*.32,0,0,7); g.fillStyle=rgb(P.shadow,.25); g.fill();
      g.beginPath(); g.arc(p[0],p[1]-r,r,0,7); g.fillStyle=P.inkS; g.fill(); g.lineWidth=2; g.strokeStyle=P.bgS; g.stroke();
      tag(g,w.z.toFixed(1)+" V",p[0],p[1]-r*2-6,P.inkS,14); g.restore(); }
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
      g.save(); g.globalAlpha=1-M; g.strokeStyle=P.accentS; g.lineWidth=1.5; g.setLineDash([3,4]); g.beginPath(); g.moveTo(p0[0],p0[1]); g.lineTo(p1[0],p1[1]); g.stroke(); g.setLineDash([]); tag(g,fmt(dz,"V",2),p1[0]+9,(p0[1]+p1[1])/2+4,P.accentS,12,"left"); g.restore(); });
  }
  function drawFx(g,dt){
    const P=PAL;
    for(let i=T.rings.length-1;i>=0;i--){ const r=T.rings[i]; r.t+=dt/r.dur; if(r.t>=1){ T.rings.splice(i,1); continue; } const a=T.nodeAt(r.a,0), b=T.nodeAt(r.b,0), za=T.zs[r.a]||0, zb=T.zs[r.b]||0, x=(a[0]+b[0])/2, y=(a[1]+b[1])/2+(za+zb)/2*geo.hs, e=1-(1-r.t)*(1-r.t), R=e*r.r*geo.sc;
      g.save(); g.globalAlpha=(1-r.t)*.8; g.strokeStyle=P.accentS; g.lineWidth=2+3*(1-r.t); g.beginPath(); g.ellipse(x,y,R*.95,R*.95*geo.k/geo.c,0,0,7); g.stroke(); g.restore(); }
    if(T.sparks.length){ g.lineCap="round"; g.lineWidth=2; for(let i=T.sparks.length-1;i>=0;i--){ const s=T.sparks[i]; s.life-=dt; if(s.life<=0){ T.sparks.splice(i,1); continue; } s.vy+=760*dt; const x0=s.x, y0=s.y; s.x+=s.vx*dt; s.y+=s.vy*dt; g.strokeStyle=rgb(mix(P.accent,P.hot,clamp(s.life*1.6,0,1)),clamp(s.life*2.2,0,1)); g.beginPath(); g.moveTo(x0-s.vx*.012,y0-s.vy*.012); g.lineTo(s.x,s.y); g.stroke(); } g.lineCap="butt"; }
    if(T.smoke.length) drawSmoke(g,T.smoke,dt);
  }

  function advance(dt){
    const D=T.desc;
    if(T.m!==T.target){ if(BC.reduced) T.m=T.target; else { const d=dt/.8; T.m=T.m<T.target?Math.min(T.target,T.m+d):Math.max(T.target,T.m-d); } }
    T.clock+=dt; T.flash=Math.max(0,T.flash-dt*3.2); T.shake=Math.max(0,T.shake-dt*3.4);
    const live={}; D.edges.forEach(e=>live[e.id]=1); Object.keys(T.pres).forEach(k=>{ if(!live[k]){ delete T.pres[k]; delete T.flow[k]; delete T.heat[k]; delete T.swing[k]; } });
    if(BC.reduced){ settle(); return; }
    /* heights ride a damped spring: a ledge dropping lands with a little weight */
    const K=110, C=2*.74*Math.sqrt(K);
    for(const k in T.sol.v){ const tg=T.sol.v[k], z=T.zs[k]===undefined?tg:T.zs[k], v=T.zv[k]||0, nv=v+(K*(tg-z)-C*v)*dt, nz=z+nv*dt; T.zs[k]=Math.abs(nz-tg)<1e-4&&Math.abs(nv)<1e-3?tg:nz; T.zv[k]=nv; }
    D.edges.forEach(e=>{ const h=T.heat[e.id]||0, ht=heatTarget(e); T.heat[e.id]=h+(ht-h)*Math.min(1,dt*(ht>h?2.8:4.5));
      const Ia=Math.abs(T.sol.I[e.id]||0), f=T.flow[e.id]===undefined?0:T.flow[e.id]; T.flow[e.id]=Ia<1e-9&&f<(D.iref||.05)*.002?0:f+(Ia-f)*Math.min(1,dt*7);
      const pt=e.ghost?0:1, p=T.pres[e.id]===undefined?0:T.pres[e.id]; T.pres[e.id]=p<pt?Math.min(pt,p+dt*2.1):Math.max(pt,p-dt*3);
      if(e.t==="switch"){ const sw=T.swing[e.id]===undefined?(e.closed?0:1):T.swing[e.id], tg=e.closed?0:1; T.swing[e.id]=sw<tg?Math.min(tg,sw+dt*5):Math.max(tg,sw-dt*7); } });
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
    if(M>.3){ g.globalAlpha=clamp((M-.3)/.45,0,1); items.forEach(it=>{ it.c.p=it.info.full.map(q=>T.project(q,M)); it.c.line=()=>{ g.strokeStyle=PAL.inkS; g.lineWidth=2.5; g.lineJoin="round"; g.beginPath(); it.c.p.forEach((q,i)=>i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1])); g.stroke(); }; if(!it.e.ghost) TYPES[it.e.t].symbol(it.c); }); g.globalAlpha=1; }
    items.forEach(({e,info})=>{ if(!e.inner) streamOf(g,e,info); });
    drawNodeMarks(g);
    drawLeads(g);
    items.forEach(({e,info})=>{ if(!e.tag||(e.t==="source"&&M<.6)) return; const b=e.tagAt==="a"?info.full[0]:info.full[info.full.length-1], p=T.project(b,M), o=e.tagOff||[0,-14], f=e.tagf||o; tag(g,e.tag,p[0]+o[0]+(f[0]-o[0])*M,p[1]+o[1]+(f[1]-o[1])*M,e.tagc?P[e.tagc+"S"]:P.inkS,clamp(geo.sc*.058,13,18),e.align||"center",600); });
    drawFx(g,dt);
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


/* ---------- lessons ---------- */
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
    $$(".lsPt,.lsHot",stage).forEach(e=>e.remove()); T.pts=[]; T.hot=null; T.leads=[]; T.ring=null; T.smoke.length=0; T.sparks.length=0; T.rings.length=0; T.prev={};
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
  function onEvent(ev){ BC.beep("pop"); T.burst(W.fail[ev]); }
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
    step=null; T.grips=[]; stage.classList.remove("grippy"); ui.p.textContent=L.end.prompt; ui.i.textContent=""; ui.ro.innerHTML=""; ui.c.innerHTML=""; $$(".lsPt,.lsHot",stage).forEach(e=>e.remove());
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
  const r0=S.lessons[n]; show(r0?clamp(r0.step|0,0,total):0);
  T.rise();
  return {root,terrain:T};
};
BC.terrain={solve,Terrain,TYPES};
})();
