/* Lessons: short do-it-first sequences around one live circuit.
   Three layers, top of file to bottom:
   1. Terrain: draws any circuit description as an isometric landscape where height is node voltage, and morphs it flat into a schematic.
   2. The engine: one step at a time (do, hit, predict, probe), fixed layout, saved progress, XP once.
   3. BC.LESSONS: lesson data keyed by module number. */
(function(){
const BC=window.BC, {$,$$,esc,S,css,clamp,fmt}=BC, {txt,smoke,drawSmoke}=BC.draw;

/* ---------- circuit description ----------
   {gnd:"g", vmax:24, nodes:{id:{at:[u,v], flat:[u,v]?}}, edges:[{id,t,a,b,...}]}
   at is the plan position in the landscape; flat overrides it in the schematic. An edge may add via:[[u,v]...], label, lab:[dx,dy].
   Add a part by adding one entry to TYPES: g(e) is its conductance (0 = open), draw(c) paints it.
   A capacitor at DC is g:0; a diode or transistor can return a conductance from e.state set by the lesson. */
const WIRE_G=1e5;   /* 10 µΩ: wires drop next to nothing, and their current stays known */
const TYPES={
  wire:{g:()=>WIRE_G, draw:c=>{c.stroke(c.p); }},
  resistor:{g:e=>e.open?0:1/e.R, draw:drawResistor},
  switch:{g:e=>e.closed?WIRE_G:0, draw:drawSwitch},
  fuse:{g:e=>e.blown?0:WIRE_G, draw:drawFuse},
  source:{draw:drawSource}
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

/* ---------- drawing the parts: c = {g,p:[[x,y]..],e,m,heat,stroke,...} ---------- */
const heatCol=h=>`hsl(${42-42*Math.min(h,1)} 95% ${h>1?48:52}%)`;
function drawResistor(c){
  const {g,e,p,m,heat}=c, [a,b]=[p[0],p[p.length-1]];
  if(e.inner&&m>.5) return;
  const col=e.open?css("--muted"):heat<.06?css("--ink"):heatCol(heat), amp=(e.inner?0:2+6*m), n=e.inner?1:clamp(Math.round(Math.log10(e.R)*2.2),3,9);
  g.save(); g.strokeStyle=col; g.lineWidth=e.inner?3.5:3; g.lineJoin="round";
  if(heat>.25){ g.shadowColor=heatCol(heat); g.shadowBlur=5+16*Math.min(heat,1.2); }
  const dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy)||1, nx=-dy/L, ny=dx/L, zig=(t0,t1)=>{ g.beginPath(); const N=n*2; for(let i=0;i<=N;i++){ const t=i/N; if(t<t0||t>t1) continue; const o=(i%2?amp:-amp)*(i===0||i===N?0:1); const x=a[0]+dx*t+nx*o, y=a[1]+dy*t+ny*o; g.lineTo(x,y);} g.stroke(); };
  if(e.open){ const [q0,q1]=c.stubs; g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(q0[0],q0[1]); g.moveTo(q1[0],q1[1]); g.lineTo(b[0],b[1]); g.stroke(); g.restore();
    g.fillStyle=css("--muted"); g.globalAlpha=.6; g.beginPath(); g.arc(q0[0],q0[1],7,0,7); g.fill(); g.globalAlpha=1; gapMark(c); return; }
  zig(0,1); g.restore();
}
/* a gap in the circuit: a dashed drop from the high side to the low side, marked with the voltage across it */
function gapMark(c){ const {g,m,stubs:[q0,q1]}=c; if(m>=1||Math.abs(q0[1]-q1[1])<3) return; g.save(); g.globalAlpha=1-m; g.setLineDash([3,4]); g.lineWidth=1.5; g.strokeStyle=css("--accent"); g.beginPath(); g.moveTo(q1[0],q1[1]); g.lineTo(q1[0],q0[1]); g.stroke(); g.setLineDash([]); txt(g,c.gapV,q1[0]+7,(q0[1]+q1[1])/2+4,"left","--accent",12); g.restore(); }
function terminal(g,x,y){ g.beginPath(); g.arc(x,y,3,0,7); g.fillStyle=css("--bg"); g.fill(); g.lineWidth=1.5; g.strokeStyle=css("--ink"); g.stroke(); }
function drawSwitch(c){
  const {g,e,p,m}=c, a=p[0], b=p[p.length-1]; g.strokeStyle=css("--ink"); g.lineWidth=3;
  if(e.closed){ g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.stroke(); }
  else { const dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy)||1, q=.55;
    /* open blade: swings away from the wire run */
    g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(a[0]+dx*q+(dy/L)*14*m+(1-m)*14, a[1]+dy*q-(dx/L)*14*m-(1-m)*6); g.stroke();
    if(m<1&&Math.abs(a[1]-c.pf[0][1])>2){ g.save(); g.globalAlpha=1-m; g.setLineDash([3,4]); g.lineWidth=1.5; g.strokeStyle=css("--accent"); g.beginPath(); g.moveTo(b[0],b[1]); g.lineTo(b[0],a[1]); g.stroke(); txt(g,c.gapV,b[0]+7,(a[1]+b[1])/2+4,"left","--accent",12); g.restore(); } }
  terminal(g,a[0],a[1]); terminal(g,b[0],b[1]);
}
function drawFuse(c){
  const {g,e,p}=c, a=p[0], b=p[p.length-1], dx=b[0]-a[0], dy=b[1]-a[1];
  g.strokeStyle=css("--ink"); g.lineWidth=3;
  if(e.blown){ const [q0,q1]=c.stubs; g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(q0[0],q0[1]); g.moveTo(q1[0],q1[1]); g.lineTo(b[0],b[1]); g.stroke(); gapMark(c);
    g.save(); g.lineWidth=2; g.strokeStyle=css("--accent"); g.beginPath(); g.moveTo(q0[0]-4,q0[1]-4); g.lineTo(q0[0]+4,q0[1]+4); g.moveTo(q0[0]+4,q0[1]-4); g.lineTo(q0[0]-4,q0[1]+4); g.stroke(); g.restore(); return; }
  g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.stroke();
  const mx=(a[0]+b[0])/2, my=(a[1]+b[1])/2, an=Math.atan2(dy,dx), hw=Math.hypot(dx,dy)*.34;
  g.save(); g.translate(mx,my); g.rotate(an); g.lineWidth=1.5; g.fillStyle=css("--bg"); g.beginPath(); g.rect(-hw,-5,hw*2,10); g.fill(); g.strokeStyle=css("--ink"); g.stroke(); g.restore();
}
function drawSource(c){
  const {g,p,m,box}=c, a=p[0], b=p[p.length-1], tall=1-m;
  g.strokeStyle=css("--ink");
  if(tall>0){ g.save(); g.globalAlpha=tall;   /* the lift: a shaft with chevrons pointing up */
    if(box){ g.fillStyle=css("--sunk"); g.strokeStyle=css("--ink"); g.lineWidth=1.5; g.beginPath(); box.forEach((q,i)=>i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1])); g.closePath(); g.fill(); g.stroke(); }
    g.lineWidth=5; g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.stroke();
    const H=a[1]-b[1]; g.lineWidth=1.5; g.strokeStyle=css("--bg"); for(let y=6;y<H-3;y+=9){ g.beginPath(); g.moveTo(a[0]-2,a[1]-y+2); g.lineTo(a[0],a[1]-y); g.lineTo(a[0]+2,a[1]-y+2); g.stroke(); }
    g.restore(); }
  if(m>0){ g.save(); g.globalAlpha=m; const x=(a[0]+b[0])/2, y=(a[1]+b[1])/2; g.lineWidth=2.5; g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(x,y+6); g.moveTo(x,y-6); g.lineTo(b[0],b[1]); g.stroke();
    g.fillStyle=css("--surface"); g.fillRect(x-20,y-5,40,10); g.lineWidth=3; g.beginPath(); g.moveTo(x-16,y-6); g.lineTo(x+16,y-6); g.stroke(); g.lineWidth=5; g.beginPath(); g.moveTo(x-8,y+6); g.lineTo(x+8,y+6); g.stroke(); g.restore(); }
}

/* ---------- Terrain: the live picture ---------- */
let viewPref="height";   /* survives step and page changes */
function Terrain(stage){
  const cv=document.createElement("canvas"); cv.className="lsCv"; cv.setAttribute("role","img"); stage.appendChild(cv);
  const T={cv,desc:null,sol:null,zs:{},heat:{},phi:{},m:viewPref==="height"?0:1,leads:[],smoke:[],pts:[],hot:null,ring:null};
  let geo=null;
  const smooth=x=>x*x*(3-2*x);
  function fit(W,H){
    const ns=Object.values(T.desc.nodes); let U=0,V=0; ns.forEach(n=>{ U=Math.max(U,n.at[0]); V=Math.max(V,n.at[1]); });
    const pad=14, k=.3, c=.866, span=U+V, sc=Math.min((W-46)/(span*c),(H*.5)/(span*k)), oy=H-pad-16-span*sc*k, hs=(oy-pad-8)/(T.desc.vmax||18), ox=W/2-(U-V)*sc*c/2;
    const flatM=[Math.max(44,W*.11),30,Math.max(30,W*.08),56];
    geo={W,H,U,V,k,c,sc,oy,hs,ox,flatM};
  }
  const iso=(u,v,z)=>[geo.ox+(u-v)*geo.sc*geo.c, geo.oy+(u+v)*geo.sc*geo.k-z*geo.hs];
  const flat=(fu,fv)=>[geo.flatM[0]+fu/geo.U*(geo.W-geo.flatM[0]-geo.flatM[2]), geo.flatM[1]+fv/geo.V*(geo.H-geo.flatM[1]-geo.flatM[3])];
  const nodeF=n=>n.flat||n.at;
  T.project=(pt,m)=>{ const a=iso(pt.u,pt.v,pt.z), b=flat(pt.fu,pt.fv); return [a[0]+(b[0]-a[0])*m,a[1]+(b[1]-a[1])*m]; };
  /* an edge as 3D points */
  function edgePts(e){
    const na=T.desc.nodes[e.a], nb=T.desc.nodes[e.b], za=T.zs[e.a]||0, zb=T.zs[e.b]||0, list=[{...fromN(na,za)}];
    (e.via||[]).forEach((w,i,all)=>{ const t=(i+1)/(all.length+1); list.push({u:w[0],v:w[1],fu:w[0],fv:w[1],z:za+(zb-za)*t}); });
    list.push(fromN(nb,zb)); return list;
  }
  const fromN=(n,z)=>({u:n.at[0],v:n.at[1],fu:nodeF(n)[0],fv:nodeF(n)[1],z});
  T.nodeAt=(id,m=smooth(T.m))=>T.project(fromN(T.desc.nodes[id],T.zs[id]||0),m);
  T.set=desc=>{ T.desc=desc; T.sol=solve(desc); if(BC.reduced||!Object.keys(T.zs).length) settle(); return T.sol; };
  const settle=()=>{ for(const k in T.sol.v) T.zs[k]=T.sol.v[k]; for(const e of T.desc.edges) T.heat[e.id]=heatTarget(e); };
  const heatTarget=e=>{ if(e.t!=="resistor"||e.open) return 0; const I=T.sol.I[e.id]; return I*I*e.R/(e.rating||2); };
  T.setView=v=>{ viewPref=v; T.target=v==="height"?0:1; if(BC.reduced) T.m=T.target; };
  T.target=T.m;
  T.moving=()=>T.m!==T.target;
  T.puff=id=>{ const e=T.desc.edges.find(x=>x.id===id); if(!e) return; const a=T.nodeAt(e.a), b=T.nodeAt(e.b); for(let i=0;i<14;i++) smoke(T.smoke,(a[0]+b[0])/2+BC.rand(-16,16),(a[1]+b[1])/2-4); };
  /* probe points and hot zones are real buttons laid over the picture */
  T.overlay=()=>{ const place=(el,x,y)=>{ const t=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`; if(el._t!==t){ el._t=t; el.style.transform=t; } };
    T.pts.forEach(p=>{ const q=T.nodeAt(p.node); place(p.el,q[0],q[1]); });
    if(T.hot){ const a=T.nodeAt(T.hot.a), b=T.nodeAt(T.hot.b); place(T.hot.el,(a[0]+b[0])/2,(a[1]+b[1])/2); } };
  T.frame=dt=>{
    if(!T.desc||!cv.offsetParent) return;
    const {g,W,H}=BC.fit(cv); fit(W,H);
    if(T.m!==T.target){ if(BC.reduced) T.m=T.target; else { const d=dt/.8; T.m=T.m<T.target?Math.min(T.target,T.m+d):Math.max(T.target,T.m-d); } }
    const m=smooth(T.m), D=T.desc, ease=Math.min(1,dt*9);
    if(BC.reduced) settle(); else { for(const k in T.sol.v){ const z=T.zs[k]===undefined?T.sol.v[k]:T.zs[k]; T.zs[k]=z+(T.sol.v[k]-z)*ease; } D.edges.forEach(e=>{ const h=T.heat[e.id]||0; T.heat[e.id]=h+(heatTarget(e)-h)*Math.min(1,dt*(heatTarget(e)>h?2.5:4)); }); }
    drawFloor(g,m);
    const items=D.edges.map(e=>{ const pts=edgePts(e), mid=pts.reduce((s,p)=>s+p.u+p.v,0)/pts.length; return {e,pts,mid}; }).sort((a,b)=>a.mid-b.mid);
    items.forEach(({e,pts})=>drawCurtain(g,e,pts,m));
    items.forEach(({e,pts})=>{ const p=pts.map(q=>T.project(q,m)), pf=pts.map(q=>iso(q.u,q.v,0));
      const at=(t,z)=>{ const A=pts[0], B=pts[pts.length-1]; return T.project({u:A.u+(B.u-A.u)*t,v:A.v+(B.v-A.v)*t,fu:A.fu+(B.fu-A.fu)*t,fv:A.fv+(B.fv-A.fv)*t,z},m); };
      const c={g,e,p,pf,m,stubs:[at(.36,pts[0].z),at(.64,pts[pts.length-1].z)],heat:T.heat[e.id]||0,gapV:fmt(Math.abs((T.zs[e.a]||0)-(T.zs[e.b]||0)),"V",2),stroke:pl=>{ g.strokeStyle=css("--ink"); g.lineWidth=3; g.lineJoin="round"; g.beginPath(); pl.forEach((q,i)=>i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1])); g.stroke(); }};
      if(e.t==="source"&&e.box){ const a=D.nodes[e.a].at, s=e.box; c.box=[[a[0]-s,a[1]-s],[a[0]+s,a[1]-s],[a[0]+s,a[1]+s],[a[0]-s,a[1]+s]].map(q=>iso(q[0],q[1],0)); }
      TYPES[e.t].draw(c); });
    drawDots(g,items,m,dt);
    drawLeads(g,m);
    if(T.smoke.length) drawSmoke(g,T.smoke,dt);
    items.forEach(({e,pts})=>{ if(!e.label) return; const n=pts.length, a=T.project(pts[0],m), b=T.project(pts[n-1],m), o=e.lab||[0,-12], f=e.labf||o; txt(g,e.label,(e.labAt==="b"?b[0]:(a[0]+b[0])/2)+o[0]+(f[0]-o[0])*m,(e.labAt==="b"?b[1]:(a[1]+b[1])/2)+o[1]+(f[1]-o[1])*m,e.align||"center",e.labc||"--ink",12); });
    if(T.ring){ const a=T.nodeAt(T.ring.a), b=T.nodeAt(T.ring.b); g.save(); g.strokeStyle=css("--accent"); g.setLineDash([4,3]); g.lineWidth=1.5; g.beginPath(); g.arc((a[0]+b[0])/2,(a[1]+b[1])/2,clamp(Math.hypot(a[0]-b[0],a[1]-b[1])*.75,20,30),0,7); g.stroke(); g.restore(); }
    T.overlay();
  };
  function drawFloor(g,m){
    if(m>=1) return;
    const {U,V}=geo, e=.08; g.save(); g.globalAlpha=1-m; g.strokeStyle=css("--line"); g.lineWidth=1;
    const q=[[-e,-e],[U+e,-e],[U+e,V+e],[-e,V+e]].map(a=>iso(a[0],a[1],0));
    g.fillStyle=css("--sunk"); g.beginPath(); q.forEach((a,i)=>i?g.lineTo(a[0],a[1]):g.moveTo(a[0],a[1])); g.closePath(); g.fill(); g.stroke();
    for(let u=.25;u<U;u+=.25){ const a=iso(u,-e,0), b=iso(u,V+e,0); g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.stroke(); }
    for(let v=.25;v<V;v+=.25){ const a=iso(-e,v,0), b=iso(U+e,v,0); g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.stroke(); }
    const f=iso(U,V,0); txt(g,"0 V",f[0]-26,f[1]+8,"right","--muted",11); g.restore();
  }
  /* the wall under each edge makes its height readable; hot slopes tint it */
  function drawCurtain(g,e,pts,m){
    if(m>=1||e.t==="source") return;
    if(e.open||e.blown||(e.t==="switch"&&!e.closed)){ const A=pts[0], B=pts[pts.length-1]; pts=[A,{...A,u:A.u+(B.u-A.u)*.36,v:A.v+(B.v-A.v)*.36}]; }
    const top=pts.map(q=>iso(q.u,q.v,q.z)); if(top.every((q,i)=>Math.abs(pts[i].z)<.05)) return;
    const base=pts.map(q=>iso(q.u,q.v,0)).reverse(), h=T.heat[e.id]||0;
    g.save(); g.globalAlpha=(1-m)*(e.inner?.9:.85); g.fillStyle=css("--line"); g.strokeStyle=css("--line"); g.lineWidth=1;
    g.beginPath(); top.concat(base).forEach((q,i)=>i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1])); g.closePath(); g.fill(); g.stroke();
    if(h>.06){ g.fillStyle=heatCol(h); g.globalAlpha=(1-m)*Math.min(.7,h*.55); g.fill(); }
    g.restore();
  }
  /* dots are charge: same spacing everywhere, speed proportional to current */
  function drawDots(g,items,m,dt){
    const IS=T.sol.I, maxI=Math.max(...Object.values(IS).map(Math.abs),0), acc=css("--accent"), mut=css("--muted");
    let off=0, ordered=T.desc.edges;
    ordered.forEach(e=>{ const it=items.find(x=>x.e===e), pts=it.pts, I=IS[e.id]||0, flowing=Math.abs(I)>1e-6&&Math.abs(I)>maxI*1e-3;
      const lens=[]; let L=0; for(let i=0;i<pts.length-1;i++){ const a=pts[i], b=pts[i+1], d=Math.hypot(a.u-b.u,a.v-b.v)||Math.abs(a.z-b.z)*.04+.12; lens.push(d); L+=d; }
      const sp=.2; if(flowing&&!BC.reduced) T.phi[e.id]=(T.phi[e.id]||0)+clamp(I/.02*.45,-4.2,4.2)*dt;
      const start=e.t==="fuse"||e.t==="switch"?.1:0;
      if(!e.nodots&&!(e.t==="resistor"&&e.open)&&!(e.t==="switch"&&!e.closed)&&!(e.t==="fuse"&&e.blown)){
        const ph=(((T.phi[e.id]||0)-off)%sp+sp)%sp; g.fillStyle=flowing?acc:mut; g.globalAlpha=flowing?1:.4;
        for(let d=ph;d<L;d+=sp){ if(d<start) continue; let r=d, i=0; while(i<lens.length-1&&r>lens[i]){ r-=lens[i]; i++; } const t=r/lens[i], a=pts[i], b=pts[i+1];
          const q=T.project({u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t,z:a.z+(b.z-a.z)*t,fu:a.fu+(b.fu-a.fu)*t,fv:a.fv+(b.fv-a.fv)*t},m);
          if(BC.reduced&&flowing){ const pa=T.project(a,m), pb=T.project(b,m), an=Math.atan2(pb[1]-pa[1],pb[0]-pa[0])+(I<0?Math.PI:0); g.save(); g.translate(q[0],q[1]); g.rotate(an); g.beginPath(); g.moveTo(5,0); g.lineTo(-3,-3.5); g.lineTo(-3,3.5); g.closePath(); g.fill(); g.restore(); }
          else { g.beginPath(); g.arc(q[0],q[1],2.7,0,7); g.fill(); } }
        g.globalAlpha=1; }
      off+=L; });
  }
  /* meter leads, and the height difference they read */
  function drawLeads(g,m){
    const [r,b]=T.leads; const pin=(p,col)=>{ if(!p) return; const q=T.nodeAt(p.node); g.beginPath(); g.arc(q[0],q[1],6,0,7); g.fillStyle=css(col); g.fill(); g.lineWidth=2; g.strokeStyle=css("--bg"); g.stroke(); };
    if(r&&b){ const a=T.nodeAt(r.node), c=T.nodeAt(b.node), za=T.zs[r.node]||0, zb=T.zs[b.node]||0, dz=Math.abs(za-zb);
      if(dz>.05&&m<1){ const low=za<zb?a:c, hi=za<zb?c:a; g.save(); g.globalAlpha=1-m; g.setLineDash([3,3]); g.lineWidth=1.5; g.strokeStyle=css("--accent"); g.beginPath(); g.moveTo(low[0],low[1]); g.lineTo(low[0],low[1]-dz*geo.hs); g.moveTo(low[0],low[1]-dz*geo.hs); g.lineTo(hi[0],hi[1]); g.stroke(); g.restore(); } }
    pin(r,"--accent"); pin(b,"--ink");
  }
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
  const nodes={g:{at:[0,.9]},e:{at:[0,.9],flat:[0,.3]},t:{at:[0,.68],flat:[0,.3]},n0:{at:[0,0]},f1:{at:[.2,0]},f2:{at:[.44,0]},ra:{at:[.8,0]},rb:{at:[1.68,0]},c1:{at:[2.2,0]},sa:{at:[2.2,.26]},sb:{at:[2.2,.62]},c2:{at:[2.2,.9]}};
  const rLabel=fmt(s.R,"Ω")+(s.rating?" · "+RATING[s.rating]:"");
  const edges=[
   {id:"src",t:"source",a:"g",b:"e",V:s.V,box:.11,label:s.V.toFixed(s.V%1?1:0)+" V",labAt:"b",lab:[0,-8],labf:[-28,44],align:"center"},
   {id:"rs",t:"resistor",a:"e",b:"t",R:INNER_R,rating:20,inner:true,nodots:0,label:s.showInner?INNER_R+" Ω inside":"",lab:[16,50],labf:[16,0],align:"left"},
   {id:"w0",t:"wire",a:"t",b:"n0"},{id:"w1",t:"wire",a:"n0",b:"f1"},
   s.fuse?{id:"fu",t:"fuse",a:"f1",b:"f2",blown:s.fuse==="blown",label:s.fuse==="blown"?"blown":FUSE_A+" A",lab:[-8,-12],labf:[0,-12]}:{id:"fu",t:"wire",a:"f1",b:"f2"},
   {id:"w2",t:"wire",a:"f2",b:"ra"},
   {id:"R",t:"resistor",a:"ra",b:"rb",R:s.R,rating:s.rating||2,open:s.burnt,label:s.burnt?"burned open":rLabel,lab:[s.burnt?-44:-10,24],labf:[0,24],align:"center"},
   {id:"w3",t:"wire",a:"rb",b:"c1"},{id:"w4",t:"wire",a:"c1",b:"sa"},
   {id:"sw",t:"switch",a:"sa",b:"sb",closed:s.closed},
   {id:"w5",t:"wire",a:"sb",b:"c2"},{id:"w6",t:"wire",a:"c2",b:"g"}
  ];
  if(s.shorted) edges.push({id:"sh",t:"wire",a:"ra",b:"rb",via:[[.8,-.13],[1.68,-.13]]});
  return {gnd:"g",vmax:18,nodes,edges};
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
  val:{I:(s,o)=>Math.abs(o.I.src), V:s=>s.V}
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
    setup:s=>{s.V=4;s.R=470;}, ro:["I"], sliders:[{k:"V",label:"Voltage",min:1,max:18,step:.5}],
    target:{of:"V",to:9,tol:.01,show:volts}},
   {id:"target",kind:"hit",prompt:"Drag R until the current reads 20 mA.",
    insight:"The drop stayed the same. More resistance just slows the charge: about 450 Ω passes 20 mA at 9 V.",
    setup:s=>{s.V=9;s.R=2000;}, ro:["I"], sliders:[{k:"R",label:"R",log:[100,4700]}],
    target:{of:"I",to:.02,tol:.02,show:amps}, keep:(s,v)=>{v.hitV=s.V;v.hitR=s.R;}},
   {id:"double",kind:"predict",prompt:"Double the voltage. The current...?",
    insight:"Twice the height, twice the current. With R fixed, charge speed tracks the voltage.",
    setup:(s,v)=>{s.V=9;s.R=v.hitR||450;}, ro:["V","I"],
    choices:[{t:"Halves"},{t:"Stays the same"},{t:"Doubles",ok:1},{t:"Quadruples"}],
    reveal:s=>{s.Vgoal=18;s.Vrate=9;}, settled:s=>s.Vgoal===null, keep:(s,v)=>{v.dblV=s.V;v.dblR=s.R;}},
   {id:"probe",kind:"probe",prompt:"Put the leads across the resistor, then both on one ledge.",
    insight:"A meter reads height difference. Top to bottom of the slope: all of it. One ledge: 0 V.",
    setup:(s,v)=>{s.V=9;s.R=v.hitR||450;}, ro:["V","I"],
    points:[{id:"a",node:"n0",label:"High ledge, back corner"},{id:"b",node:"ra",label:"Top of the resistor"},{id:"c",node:"rb",label:"Bottom of the resistor"},{id:"d",node:"c1",label:"Low ledge, right corner"},{id:"e",node:"c2",label:"Low ledge, front corner"}],
    targets:[{t:"Across R",test:(dv,s)=>Math.abs(dv)>s.V*.5},{t:"One ledge",test:dv=>Math.abs(dv)<.01}]},
   {id:"burn",kind:"do",prompt:"New part, rated ¼ W. Push its power past that until it fails.",
    insight:"Too much current falling too far: heat beat the ¼ W rating. It burned open, leaving a gap.",
    setup:s=>{s.V=9;s.R=470;s.rating=.25;}, ro:["I","P","rate"],
    sliders:[{k:"V",label:"Voltage",min:1,max:18,step:.5},{k:"R",label:"R",log:[100,4700]}],
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
    <div class="lsDots" role="group" aria-label="Lesson progress"></div>
    <p class="lsP" tabindex="-1"></p>
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
    $$(".lsPt,.lsHot",stage).forEach(e=>e.remove()); T.pts=[]; T.hot=null; T.leads=[]; T.ring=null; T.smoke.length=0;
    buildControls(); buildNext();
    T.zs={}; T.heat={}; T.set(W.circuit(s)); sol=T.sol;
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
    sliders=step.sliders||[];
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
  function onEvent(ev){ BC.beep("pop"); T.puff(ev==="burn"?"R":"fu"); }
  function paint(){
    $$(".lsRO .v[data-k]",root).forEach(el=>{ const t=W.ro[el.dataset.k][1](s,sol); if(el.textContent!==t) el.textContent=t; });
    sliders.forEach(sd=>{ const o=$(`#ls-${sd.k}`,ui.c); if(!o) return; const t=sd.k==="V"?(s.V.toFixed(1)+" V"):fmt(s.R,"Ω"), out=o.nextElementSibling; if(out.textContent!==t){ out.textContent=t; o.setAttribute("aria-valuetext",sd.k==="V"?s.V+" volts":s.R+" ohms"); } o.disabled=!!s.burnt; });
    const swapped=step.swap&&step.swap(s), sl=$(".lsSl",ui.c); if(sl) sl.hidden=!!swapped;
    $$(".lsAct",ui.c).forEach(b=>{ const a=step.actions[+b.dataset.a], t=a.label(s), on=!a.when||a.when(s); if(b.textContent!==t) b.textContent=t; b.hidden=!on; });
    cv_alt();
    if(step.kind==="probe") readProbe();
    if(step.kind==="hit") checkHit();
    if(step.kind==="do"&&!ok&&step.goal(s)) success();
    if(step.kind==="predict"&&picked!==null&&!ok&&step.settled(s,sol)&&!W.busy(s)) settlePredict();
    if(step.hot) { T.ring=s.closed?null:L.hotspot; const h=$(".lsHot",stage); if(h) h.classList.toggle("on",!s.closed); }
  }
  function checkHit(){
    const t=step.target, val=W.val[t.of](s,sol), inT=Math.abs(val-t.to)<=t.to*t.tol, cell=$(".lsTarget",root); if(cell) cell.classList.toggle("hit",inT);
    if(ok) return; if(!inT){ clearTimeout(hold); hold=null; return; }
    if(!hold) hold=setTimeout(()=>{ hold=null; const v2=W.val[t.of](s,sol); if(Math.abs(v2-t.to)<=t.to*t.tol) success(); },280);
  }
  function cv_alt(){ const t=`${viewPref==="height"?"Landscape where height is voltage":"Schematic"}: supply ${s.V} volts, resistor ${s.burnt?"burned open":s.R+" ohms"}, ${s.closed?"switch closed":"switch open"}, current ${amps(sol.I.src)}.`; if(T.cv.getAttribute("aria-label")!==t) T.cv.setAttribute("aria-label",t); }

  /* ----- the end: the module's equations, each lit by a value the learner made ----- */
  function showEnd(){
    step=null; ui.p.textContent=L.end.prompt; ui.i.textContent=""; ui.ro.innerHTML=""; ui.c.innerHTML=""; $$(".lsPt,.lsHot",stage).forEach(e=>e.remove());
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
  return {root,terrain:T};
};
BC.terrain={solve,Terrain,TYPES};
})();
