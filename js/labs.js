/* Interactive labs. Each lab: {title, sub, html(), init?(root), run?(root)} */
(function(){
const BC=window.BC, {$,$$,fmt,css,clamp,esc}=BC;
BC.leave=[]; // cleanup callbacks run when the view changes

const rng=(id,label,min,max,step,val)=>`<div class="ctrl"><label for="${id}"><span>${label}</span><output id="${id}-o"></output></label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
const sel=(id,label,opts,val)=>`<div class="ctrl"><label for="${id}"><span>${label}</span></label><select id="${id}">${opts.map(o=>`<option value="${esc(o[0])}"${String(o[0])===String(val)?" selected":""}>${esc(o[1])}</option>`).join("")}</select></div>`;
const ro=(k,id,hl)=>`<div class="ro${hl?" hl":""}"><div class="k">${k}</div><div class="v" id="${id}">—</div></div>`;
const lv=id=>Math.pow(10,+$("#"+id).value);
const out=(id,t)=>{const o=$("#"+id+"-o"); if(o) o.textContent=t;};
const setT=(id,t)=>{const e=$("#"+id); if(e) e.textContent=t;};
const note=(id,text,kind)=>{const n=$("#"+id); if(!n) return; n.className="note"+(kind?" "+kind:""); n.textContent=text;};

/* ---- schematic helpers (canvas) ---- */
function zigH(g,xa,xb,y,amp=7){const n=6,step=(xb-xa)/(n*2);g.beginPath();g.moveTo(xa,y);for(let i=0;i<n*2;i++)g.lineTo(xa+step*(i+.5),y+(i%2?amp:-amp));g.lineTo(xb,y);g.stroke();}
function zigV(g,x,ya,yb,amp=7){const n=6,step=(yb-ya)/(n*2);g.beginPath();g.moveTo(x,ya);for(let i=0;i<n*2;i++)g.lineTo(x+(i%2?amp:-amp),ya+step*(i+.5));g.lineTo(x,yb);g.stroke();}
function line(g,pts){g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.stroke();}
function battV(g,x,ym,label){g.save();g.lineWidth=3;line(g,[[x-16,ym-6],[x+16,ym-6]]);g.lineWidth=5;line(g,[[x-8,ym+6],[x+8,ym+6]]);g.restore();g.fillStyle=css("--muted");g.font="12px 'IBM Plex Mono',monospace";g.textAlign="right";g.fillText("+",x-20,ym-2);if(label){g.textAlign="left";g.fillStyle=css("--ink");g.fillText(label,x+22,ym+4);}}
function gnd(g,x,y){line(g,[[x,y],[x,y+6]]);line(g,[[x-10,y+6],[x+10,y+6]]);line(g,[[x-6,y+10],[x+6,y+10]]);line(g,[[x-2,y+14],[x+2,y+14]]);}
function txt(g,s,x,y,align="center",col="--ink",size=12){g.fillStyle=css(col);g.font=`${size}px 'IBM Plex Mono',monospace`;g.textAlign=align;g.fillText(s,x,y);}
/* rectangle loop: returns point at fraction s of perimeter, going up left side (battery), across top, down right, back along bottom */
function loopPt(r,s){const w=r.x1-r.x0,h=r.y1-r.y0,P=2*(w+h);let d=((s%1)+1)%1*P;
  if(d<h) return [r.x0,r.y1-d]; d-=h; if(d<w) return [r.x0+d,r.y0]; d-=w; if(d<h) return [r.x1,r.y0+d]; d-=h; return [r.x1-d,r.y1];}

/* smoke particles shared by circuit labs */
function smoke(list,x,y){if(BC.reduced) return; list.push({x:x+BC.rand(-6,6),y,vy:BC.rand(-30,-50),vx:BC.rand(-8,8),r:BC.rand(4,8),life:1.6});}
function drawSmoke(g,list,dt){for(let i=list.length-1;i>=0;i--){const p=list[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.r+=6*dt;p.life-=dt*0.7;if(p.life<=0){list.splice(i,1);continue;}g.fillStyle=css("--muted");g.globalAlpha=p.life*0.35;g.beginPath();g.arc(p.x,p.y,p.r,0,7);g.fill();g.globalAlpha=1;}}

const L=BC.LABS={};

/* ================= CH2 ================= */
L.ohm={title:"Ohm's law, live",sub:"watch the charge flow",html:()=>`
  <div class="ctrls">${rng("oh-v","Supply voltage",0.5,24,0.1,9)}${rng("oh-r","Resistance",1,6,0.01,2.672)}
  ${sel("oh-pr","Resistor power rating",[["0.125","⅛ W"],["0.25","¼ W"],["0.5","½ W"],["1","1 W"],["2","2 W"]],"0.25")}
  <p class="note">Dot speed shows current. Resistor color shows how hot it runs. Try 24 V across 22 Ω.</p></div>
  <div class="readout">${ro("Current","oh-i",1)}${ro("Power","oh-p")}${ro("Share of rating","oh-x")}<p class="note" id="oh-n"></p></div>
  <canvas class="plot tall" id="oh-cv" aria-label="Animated circuit: battery and resistor"></canvas>`,
 init(){let s=0; const sm=[]; let shake=0;
  this._st={I:0,heat:0};
  BC.anim(dt=>{const cv=$("#oh-cv"); if(!cv) return; const {g,W,H}=BC.fit(cv); const st=this._st;
   const r={x0:50,x1:W-50,y0:40,y1:H-36}, ym=(r.y0+r.y1)/2, xa=W/2-70, xb=W/2+70;
   const speed=st.I>0?clamp((Math.log10(st.I*1e6)+0.5)/6,0.03,1.4)*0.22:0; s+=speed*dt;
   g.strokeStyle=css("--muted"); g.lineWidth=2;
   line(g,[[r.x0,ym-12],[r.x0,r.y0],[xa,r.y0]]); line(g,[[xb,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1],[r.x0,ym+12]]);
   g.strokeStyle=css("--ink"); battV(g,r.x0,ym,st.V.toFixed(1)+" V");
   const h=Math.min(st.heat,1.4); shake = st.heat>1 ? (BC.reduced?0:BC.rand(-1.5,1.5)) : 0;
   g.save(); g.translate(0,shake); g.lineWidth=3;
   g.strokeStyle = st.heat<0.08?css("--ink"):`hsl(${42-42*Math.min(h,1)} 95% ${st.heat>1?48:55}%)`;
   if(st.heat>0.3){g.shadowColor=`hsl(${30-30*Math.min(h,1)} 100% 50%)`; g.shadowBlur=6+18*Math.min(h,1);} zigH(g,xa,xb,r.y0,9); g.restore();
   txt(g,fmt(st.R,"Ω"),W/2,r.y0-16);
   if(st.heat>1 && Math.random()<dt*14) smoke(sm,W/2+BC.rand(-50,50),r.y0-6); drawSmoke(g,sm,dt);
   g.fillStyle=css("--accent"); const N=Math.max(14,Math.round((W+H)/26));
   for(let i=0;i<N;i++){const [x,y]=loopPt(r,s+i/N); if(x===r.x0&&Math.abs(y-ym)<14) continue; g.beginPath(); g.arc(x,y,3.2,0,7); g.fill();}
   txt(g,"I = "+fmt(st.I,"A"),r.x1-8,r.y1-10,"right","--muted");
   txt(g,"→ conventional current",r.x0+8,r.y1+22,"left","--muted",11);
  });},
 run(){const V=+$("#oh-v").value,R=lv("oh-r"),pr=+$("#oh-pr").value; out("oh-v",V.toFixed(1)+" V"); out("oh-r",fmt(R,"Ω"));
  const I=V/R,P=V*I; Object.assign(this._st,{V,R,I,heat:P/pr});
  setT("oh-i",fmt(I,"A")); setT("oh-p",fmt(P,"W")); setT("oh-x",(P/pr*100).toFixed(0)+"%");
  if(P>pr) note("oh-n","Smoking! Over the power rating. Use a higher-wattage part or more resistance.","bad");
  else if(P>pr/2) note("oh-n","Above half the rating. It works, but it runs hot. Keep resistors under 50% of rated power.","warn");
  else note("oh-n","Comfortably within rating.");}};

L.divider={title:"Voltage divider and loading",sub:"Thevenin in action",html:()=>`
  <div class="ctrls">${rng("dv-vin","Input voltage",1,24,0.1,12)}${rng("dv-r1","R1",2,6,0.01,4)}${rng("dv-r2","R2",2,6,0.01,4)}${rng("dv-rl","Load (far right = nothing attached)",2,7,0.01,7)}</div>
  <div class="readout">${ro("Vout, no load","dv-vu")}${ro("Vout, loaded","dv-vl",1)}${ro("Thevenin resistance","dv-rth")}${ro("Divider current","dv-i")}<p class="note" id="dv-n"></p></div>
  <canvas class="plot tall" id="dv-cv" aria-label="Divider schematic with live voltages"></canvas>`,
 run(){const Vin=+$("#dv-vin").value,R1=lv("dv-r1"),R2=lv("dv-r2"),rlv=+$("#dv-rl").value,RL=rlv>=6.99?Infinity:Math.pow(10,rlv);
  out("dv-vin",Vin.toFixed(1)+" V"); out("dv-r1",fmt(R1,"Ω")); out("dv-r2",fmt(R2,"Ω")); out("dv-rl",RL===Infinity?"none":fmt(RL,"Ω"));
  const Vu=Vin*R2/(R1+R2), R2e=RL===Infinity?R2:R2*RL/(R2+RL), Vl=Vin*R2e/(R1+R2e), Rth=R1*R2/(R1+R2);
  setT("dv-vu",Vu.toFixed(3)+" V"); setT("dv-vl",Vl.toFixed(3)+" V"); setT("dv-rth",fmt(Rth,"Ω")); setT("dv-i",fmt(Vin/(R1+R2e),"A"));
  const drop=(Vu-Vl)/Vu*100;
  if(RL===Infinity) note("dv-n","Nothing attached. Slide the load left to see the output sag as current is drawn.");
  else note("dv-n",`The load drags the output down ${drop.toFixed(1)}%. ${drop>10?"Rule: keep the load at least 10× the Thevenin resistance, or buffer with an op amp follower.":"The load is big compared with the Thevenin resistance, so the divider holds up."}`,drop>10?"warn":"");
  const cv=$("#dv-cv"), {g,W,H}=BC.fit(cv); const xb=70, xr=Math.min(W*0.45,260), xl=Math.min(W-70,xr+170), yt=34, yb=H-34, ym=(yt+yb)/2;
  g.strokeStyle=css("--muted"); g.lineWidth=2;
  line(g,[[xb,ym-12],[xb,yt],[xr,yt],[xr,yt+14]]); line(g,[[xr,ym-30],[xr,ym+30]]); line(g,[[xr,yb-14],[xr,yb],[xb,yb],[xb,ym+12]]);
  g.strokeStyle=css("--ink"); g.lineWidth=2.5; zigV(g,xr,yt+14,ym-30); zigV(g,xr,ym+30,yb-14);
  battV(g,xb,ym,""); txt(g,Vin.toFixed(1)+" V",xb+22,ym+4,"left");
  txt(g,"R1 "+fmt(R1,"Ω"),xr+16,(yt+ym)/2-4,"left"); txt(g,"R2 "+fmt(R2,"Ω"),xr+16,(ym+yb)/2+8,"left");
  g.strokeStyle=css(RL===Infinity?"--line":"--muted"); g.lineWidth=2; g.setLineDash(RL===Infinity?[4,4]:[]);
  line(g,[[xr,ym],[xl,ym],[xl,ym+16]]); line(g,[[xl,yb-14],[xl,yb],[xr,yb]]); g.setLineDash([]);
  if(RL!==Infinity){g.strokeStyle=css("--ink");g.lineWidth=2.5;zigV(g,xl,ym+16,yb-14);txt(g,"Load "+fmt(RL,"Ω"),xl-12,(ym+yb)/2+4,"right");}
  g.fillStyle=css("--accent"); g.beginPath(); g.arc(xr,ym,5,0,7); g.fill();
  txt(g,"Vout = "+Vl.toFixed(2)+" V",xr+14,ym-10,"left","--accent",13);
  // bar meter
  const bx=W-28, bh=yb-yt; g.fillStyle=css("--sunk"); g.fillRect(bx-8,yt,16,bh); g.fillStyle=css("--trace"); const f=Vl/Vin; g.fillRect(bx-8,yb-bh*f,16,bh*f);
  g.strokeStyle=css("--accent"); g.lineWidth=2; line(g,[[bx-12,yb-bh*Vu/Vin],[bx+12,yb-bh*Vu/Vin]]); txt(g,"no-load",bx+0,yt-8,"center","--muted",10);}};

L.rc={title:"RC charging and square waves",sub:"τ = R·C",html:()=>`
  <div class="ctrls">${sel("rc-m","Input",[["step","Switch on once (step)"],["sq","Square wave"]],"step")}${rng("rc-r","R",2,6,0.01,4)}${rng("rc-c","C",-9,-3,0.01,-4)}${rng("rc-p","Square-wave period (in τ)",0.3,20,0.1,6)}</div>
  <div class="readout">${ro("Time constant τ","rc-t",1)}${ro("~99% charged (5τ)","rc-5t")}${ro("Square-wave frequency","rc-f")}<p class="note" id="rc-n"></p></div>
  <canvas class="plot" id="rc-cv" aria-label="Capacitor voltage over time"></canvas>`,
 run(){const m=$("#rc-m").value,R=lv("rc-r"),C=lv("rc-c"),P=+$("#rc-p").value,t=R*C; out("rc-r",fmt(R,"Ω")); out("rc-c",fmt(C,"F")); out("rc-p",P.toFixed(1)+" τ");
  $("#rc-p").closest(".ctrl").style.opacity=m==="sq"?1:.4;
  setT("rc-t",fmt(t,"s")); setT("rc-5t",fmt(5*t,"s")); setT("rc-f",m==="sq"?fmt(1/(P*t),"Hz"):"—");
  const V=5,pts=[],inp=[]; let vc=0;
  if(m==="step"){for(let i=0;i<=200;i++){const x=i/200*5;pts.push([x,V*(1-Math.exp(-x))]);inp.push([x,V]);}
    BC.plot($("#rc-cv"),{x:[0,5],y:[-0.3,V*1.12],xt:[0,1,2,3,4,5].map(k=>[k,k?k+"τ":"0"]),yt:[[0,"0"],[V*.632,"63%"],[V,"5V"]],series:[{pts:inp,color:"--muted",width:1.2,dash:[4,4]},{pts,fill:true}],marks:[[1,V*.632,"63% after 1τ"]]});
    note("rc-n","Each τ closes 63% of the remaining gap. After 5τ it is within 1%.");}
  else{const span=Math.max(3*P,6),N=900;for(let i=0;i<=N;i++){const x=i/N*span, vin=(x%P)<P/2?V:0; vc+=(vin-vc)*(1-Math.exp(-span/N)); pts.push([x,vc]); inp.push([x,vin]);}
    const xt=[];const stp=span>30?10:span>12?4:span>6?2:1;for(let k=0;k<=span;k+=stp)xt.push([k,k+"τ"]);
    BC.plot($("#rc-cv"),{x:[0,span],y:[-0.3,V*1.12],xt,yt:[[0,"0"],[V,"5V"]],series:[{pts:inp,color:"--muted",width:1.2,dash:[4,4]},{pts}],legend:[["input","--muted"],["capacitor","--trace"]]});
    note("rc-n",P<2?"The period is short compared with τ, so the capacitor never catches up. It averages the input. This is a low-pass filter at work.":P>10?"The period is long compared with τ, so the capacitor fully charges and discharges each half-cycle.":"In between: rounded edges. Shorten the period and the output turns into a triangle around the average.");}}};

L.ac={title:"AC, phasors and RMS",sub:"a sine wave is a spinning arrow",html:()=>`
  <div class="ctrls">${sel("ac-pre","Preset",[["us","US mains: 120 V RMS, 60 Hz"],["eu","EU mains: 230 V RMS, 50 Hz"],["lab","Lab signal: 5 V RMS, 1 kHz"]],"us")}${rng("ac-sl","Slow motion",0.1,2,0.05,0.6)}
  <p class="note">The arrow spins once per cycle. Its height over time traces the sine. Slowed down a lot so you can follow it.</p></div>
  <div class="readout">${ro("RMS","ac-rms",1)}${ro("Peak","ac-pk")}${ro("Peak to peak","ac-pp")}${ro("Period","ac-T")}</div>
  <canvas class="plot tall" id="ac-cv" aria-label="Rotating phasor drawing a sine wave"></canvas>`,
 init(){let th=0; const hist=[]; this._st={pk:170,rms:120};
  BC.anim(dt=>{const cv=$("#ac-cv"); if(!cv) return; const {g,W,H}=BC.fit(cv); const st=this._st, sl=+$("#ac-sl").value;
   th+=2*Math.PI*0.5*sl*dt; const R=Math.min(H/2-26,W*0.16), cx=R+24, cy=H/2, x0=cx+R+30, w=W-x0-12;
   g.strokeStyle=css("--line"); g.lineWidth=1; g.beginPath(); g.arc(cx,cy,R,0,7); g.stroke(); line(g,[[cx-R-6,cy],[x0+w,cy]]);
   const ry=R*0.7071; g.setLineDash([4,4]); g.strokeStyle=css("--accent"); line(g,[[x0,cy-ry],[x0+w,cy-ry]]); line(g,[[x0,cy+ry],[x0+w,cy+ry]]); g.setLineDash([]);
   txt(g,"+RMS",x0+w-2,cy-ry-5,"right","--accent",10); txt(g,"+peak",x0+w-2,cy-R-5,"right","--muted",10);
   g.strokeStyle=css("--line"); line(g,[[x0,cy-R],[x0+w,cy-R]]); line(g,[[x0,cy+R],[x0+w,cy+R]]);
   const px=cx+R*Math.cos(th), py=cy-R*Math.sin(th);
   hist.unshift(py); const maxN=Math.floor(w/1.5); if(hist.length>maxN) hist.length=maxN;
   g.strokeStyle=css("--trace"); g.lineWidth=2.5; g.beginPath(); hist.forEach((y,i)=>{const x=x0+i*1.5; i?g.lineTo(x,y):g.moveTo(x,y);}); g.stroke();
   g.strokeStyle=css("--muted"); g.lineWidth=1; g.setLineDash([2,3]); line(g,[[px,py],[x0,py]]); g.setLineDash([]);
   g.strokeStyle=css("--ink"); g.lineWidth=2.5; line(g,[[cx,cy],[px,py]]); g.fillStyle=css("--accent"); g.beginPath(); g.arc(px,py,5,0,7); g.fill(); g.beginPath(); g.arc(x0,py,4,0,7); g.fill();
   txt(g,(st.pk*Math.sin(th)).toFixed(0)+" V",x0+6,py-8,"left","--ink",12);
  });},
 run(){const p=$("#ac-pre").value, d={us:[120,60],eu:[230,50],lab:[5,1000]}[p]; const pk=d[0]*Math.SQRT2; this._st.pk=pk; out("ac-sl",$("#ac-sl").value+"×");
  setT("ac-rms",d[0]+" V"); setT("ac-pk",pk.toFixed(1)+" V"); setT("ac-pp",(2*pk).toFixed(0)+" V"); setT("ac-T",fmt(1/d[1],"s"));}};

/* ================= CH3 ================= */
const COL={0:"#111111",1:"#7a4a1f",2:"#d0281c",3:"#ef7a12",4:"#f2d21b",5:"#2f9a3a",6:"#2357c7",7:"#7c3fb5",8:"#8a8a8a",9:"#f5f5f5","-1":"#c9a227","-2":"#b9bcc2"};
const TCOL={1:"#7a4a1f",2:"#d0281c",0.5:"#2f9a3a",5:"#c9a227",10:"#b9bcc2"};
BC.COL=COL; BC.TCOL=TCOL;
BC.resistorSVG=(id)=>`<svg class="resistorSvg" id="${id}" viewBox="0 0 360 90" role="img" aria-label="Resistor with color bands"><line x1="0" y1="45" x2="360" y2="45" stroke="var(--muted)" stroke-width="4"/><rect x="70" y="18" width="220" height="54" rx="22" fill="#D9C49A" stroke="#a8946a"/><rect class="b1" x="100" y="18" width="16" height="54"/><rect class="b2" x="132" y="18" width="16" height="54"/><rect class="b3" x="164" y="18" width="16" height="54"/><rect class="b4" x="240" y="18" width="16" height="54"/></svg>`;
BC.paintResistor=(svg,a,b,m,t)=>{svg.querySelector(".b1").setAttribute("fill",COL[a]);svg.querySelector(".b2").setAttribute("fill",COL[b]);svg.querySelector(".b3").setAttribute("fill",COL[m]);svg.querySelector(".b4").setAttribute("fill",TCOL[t]);};
L.color={title:"Resistor color code",sub:"4-band",html:()=>{
  const D=[["0","black"],["1","brown"],["2","red"],["3","orange"],["4","yellow"],["5","green"],["6","blue"],["7","violet"],["8","grey"],["9","white"]];
  const M=[["0","black ×1"],["1","brown ×10"],["2","red ×100"],["3","orange ×1k"],["4","yellow ×10k"],["5","green ×100k"],["6","blue ×1M"],["-1","gold ×0.1"],["-2","silver ×0.01"]];
  const T=[["1","brown ±1%"],["2","red ±2%"],["0.5","green ±0.5%"],["5","gold ±5%"],["10","silver ±10%"]];
  return `<div class="ctrls">${sel("cc-1","Band 1 (first digit)",D.slice(1),"4")}${sel("cc-2","Band 2 (second digit)",D,"7")}${sel("cc-3","Band 3 (multiplier)",M,"2")}${sel("cc-4","Band 4 (tolerance)",T,"5")}
  <p class="note">Memory aid: the digits run through the rainbow. Black and brown first, then red-orange-yellow-green-blue-violet, then grey and white.</p></div>
  <div class="readout" style="grid-template-columns:1fr">${BC.resistorSVG("cc-svg")}${ro("Value","cc-v",1)}${ro("Actual value could be anywhere from","cc-range")}
  <a class="btn" href="#arcade" style="text-decoration:none;text-align:center">Practice in Color Code Rush →</a></div>`;},
 run(){const a=+$("#cc-1").value,b=+$("#cc-2").value,m=+$("#cc-3").value,t=+$("#cc-4").value, v=(a*10+b)*Math.pow(10,m);
  BC.paintResistor($("#cc-svg"),a,b,m,t); setT("cc-v",fmt(v,"Ω")+" ±"+t+"%"); setT("cc-range",fmt(v*(1-t/100),"Ω")+" to "+fmt(v*(1+t/100),"Ω"));}};

L.capcode={title:"Capacitor code decoder",sub:"three-digit markings",html:()=>`
  <div class="ctrls"><div class="ctrl"><label for="cp-in"><span>Code printed on the capacitor</span></label><input type="text" id="cp-in" value="104" maxlength="4" inputmode="numeric" autocomplete="off" class="bigInput"></div>
  <div class="gates" id="cp-q">${["101","221","472","103","104","224","105","106"].map(c=>`<button type="button" data-c="${c}">${c}</button>`).join("")}</div></div>
  <div class="readout">${ro("Picofarads","cp-pf")}${ro("Nanofarads","cp-nf",1)}${ro("Microfarads","cp-uf")}<p class="note" id="cp-n">First two digits are the value. The third is how many zeros to add, in picofarads.</p></div>`,
 init(){$("#cp-q").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;$("#cp-in").value=b.dataset.c;this.run();BC.touchLab("capcode");});},
 run(){const s=$("#cp-in").value.trim(); const m=/^(\d)(\d)(\d)$/.exec(s);
  if(!m){["cp-pf","cp-nf","cp-uf"].forEach(i=>setT(i,"—")); note("cp-n","Enter three digits, like 104 or 472.","warn"); return;}
  const pf=(+m[1]*10+ +m[2])*(+m[3]>7?(+m[3]===8?0.01:0.1):Math.pow(10,+m[3])); setT("cp-pf",pf.toLocaleString()+" pF"); setT("cp-nf",+(pf/1e3).toPrecision(4)+" nF"); setT("cp-uf",+(pf/1e6).toPrecision(4)+" µF");
  note("cp-n",`${m[1]}${m[2]} ${+m[3]>7?`× ${+m[3]===8?"0.01":"0.1"} (a third digit of 8 or 9 is a fraction, not zeros)`:`followed by ${m[3]} zero${m[3]==="1"?"":"s"}`} = ${pf.toLocaleString()} pF.${pf===1e5?" 100 nF is the classic decoupling cap. You'll use hundreds of them.":""}`);}};

/* ================= CH4 ================= */
const DIODES={si:{n:"Silicon (1N4148)",vf:0.7},sch:{n:"Schottky (1N5817)",vf:0.32},red:{n:"Red LED",vf:1.9},blue:{n:"Blue LED",vf:3.0},zen:{n:"Zener 5.1 V",vf:0.7,vz:5.1}};
const nVt=0.0517;
/* exp argument capped at 600 only to avoid Infinity (e^600 ≈ 1e260); the bisection range ±15 V never reaches it, so I keeps growing past Vf */
const ex=x=>Math.exp(Math.min(x,600));
function diodeI(d,V){const Is=0.01/ex(d.vf/nVt); let I=Is*(ex(V/nVt)-1); if(d.vz&&V<0) I-=1e-3*ex((-V-d.vz)/0.03); return I;}
function diodeQ(d,Vs,R){let lo=-15,hi=15;for(let k=0;k<80;k++){const m=(lo+hi)/2; ((Vs-m)/R-diodeI(d,m))>0?lo=m:hi=m;} const V=(lo+hi)/2; return {V,I:(Vs-V)/R};}
BC.diodeQ=diodeQ; BC.DIODES=DIODES;
L.diode={title:"Diode I–V curve and load line",sub:"find the operating point",html:()=>`
  <div class="ctrls">${sel("di-t","Diode",Object.entries(DIODES).map(([k,d])=>[k,d.n]),"si")}${rng("di-vs","Source voltage",-10,10,0.05,5)}${rng("di-r","Series resistor",1.3,4,0.01,2.5)}
  <p class="note">The curve is the diode. The straight line is the resistor and source. Where they cross is what actually happens. Flip the source negative to see reverse bias, and try the Zener.</p></div>
  <div class="readout">${ro("Diode voltage","di-v",1)}${ro("Diode current","di-i",1)}${ro("Diode power","di-p")}${ro("Voltage across resistor","di-vr")}<p class="note" id="di-n"></p></div>
  <canvas class="plot tall" id="di-cv" aria-label="Diode I-V curve with load line"></canvas>`,
 run(){const d=DIODES[$("#di-t").value],Vs=+$("#di-vs").value,R=lv("di-r"); out("di-vs",Vs.toFixed(2)+" V"); out("di-r",fmt(R,"Ω"));
  const q=diodeQ(d,Vs,R); setT("di-v",q.V.toFixed(3)+" V"); setT("di-i",fmt(q.I,"A")); setT("di-p",fmt(Math.abs(q.V*q.I),"W")); setT("di-vr",(Vs-q.V).toFixed(3)+" V");
  if(Vs<0 && !d.vz) note("di-n","Reverse biased. Almost no current flows, and the diode takes the whole voltage.");
  else if(Vs<0 && d.vz) note("di-n",Math.abs(Vs)>d.vz?"The Zener has broken down and is holding about 5.1 V. This is how it regulates.":"Not enough reverse voltage to reach the Zener knee yet. Go past −5.1 V.");
  else if(q.I>0.1) note("di-n","Over 100 mA. Fine for a 1N400x rectifier, too much for a small-signal diode or LED.","warn");
  else note("di-n","Forward biased. Notice the diode voltage barely changes even when the current changes a lot.");
  const pts=[];for(let V=-7;V<=5;V+=0.01)pts.push([V,diodeI(d,V)*1000]);
  const ll=[[-7,(Vs+7)/R*1000],[5,(Vs-5)/R*1000]];
  BC.plot($("#di-cv"),{x:[-7,5],y:[-30,45],xt:[-6,-4,-2,0,2,4].map(v=>[v,v+"V"]),yt:[[-20,"−20mA"],[0,"0"],[20,"20"],[40,"40"]],series:[{pts},{pts:ll,color:"--accent",width:1.5,dash:[6,4]}],marks:[[q.V,q.I*1000,`Q: ${q.V.toFixed(2)} V, ${fmt(q.I,"A")}`,q.V>1.5?"right":"left"]],legend:[["diode","--trace"],["load line","--accent"]]});}};

L.bjt={title:"Transistor switch designer",sub:"NPN, low side",html:()=>`
  <div class="ctrls">${rng("bj-vin","Drive voltage (MCU pin)",1.8,12,0.1,3.3)}${rng("bj-ic","Load current",1,500,1,100)}${rng("bj-h","Datasheet hFE (minimum)",20,400,5,100)}
  ${sel("bj-k","Design gain (forced β)",[["10","10 (hard saturation rule of thumb)"],["20","20"],["0","hFE ÷ 2"]],"10")}</div>
  <div class="readout">${ro("Base current","bj-ib")}${ro("Base resistor (exact)","bj-rb")}${ro("Standard value to use","bj-rs",1)}${ro("Transistor heat","bj-p")}<p class="note" id="bj-n"></p></div>
  <canvas class="plot tall" id="bj-cv" aria-label="Low-side NPN switch schematic"></canvas>`,
 run(){const Vin=+$("#bj-vin").value,Ic=+$("#bj-ic").value/1000,h=+$("#bj-h").value,k=+$("#bj-k").value||h/2;
  out("bj-vin",Vin.toFixed(1)+" V"); out("bj-ic",(Ic*1000).toFixed(0)+" mA"); out("bj-h",h);
  const Ib=Ic/k, Rb=(Vin-0.7)/Ib, Rs=BC.e12Down(Rb);
  setT("bj-ib",fmt(Ib,"A")); setT("bj-rb",fmt(Rb,"Ω")); setT("bj-rs",fmt(Rs,"Ω")); setT("bj-p",fmt(0.2*Ic,"W"));
  if(Ib>0.02) note("bj-n","Base current is over 20 mA, more than most MCU pins can give. Use a logic-level MOSFET or a Darlington.","bad");
  else if(Ic>0.2) note("bj-n","Above 200 mA a 2N3904 or BC547 is out of its depth. Use a TIP120 or a logic-level MOSFET.","warn");
  else note("bj-n","Rounded down to an E12 value so the base gets a little extra current. Add a flyback diode if the load is a coil.");
  const {g,W,H}=BC.fit($("#bj-cv")), cx=W/2+20, top=28, bot=H-26, ty=H/2+10;
  g.strokeStyle=css("--muted"); g.lineWidth=2;
  line(g,[[cx+20,top],[cx+20,top+12]]); txt(g,"+V",cx+20,top-8,"center","--muted");
  g.strokeStyle=css("--ink"); g.strokeRect(cx+4,top+12,32,34); txt(g,"LOAD",cx+20,top+33,"center","--ink",10); txt(g,fmt(Ic,"A"),cx+44,top+33,"left","--accent");
  g.strokeStyle=css("--muted"); line(g,[[cx+20,top+46],[cx+20,ty-18],[cx+6,ty-8]]); line(g,[[cx+6,ty+8],[cx+20,ty+18],[cx+20,bot-14]]); gnd(g,cx+20,bot-14);
  g.strokeStyle=css("--ink"); g.lineWidth=3; line(g,[[cx+4,ty-16],[cx+4,ty+16]]); g.lineWidth=2;
  g.fillStyle=css("--ink"); g.beginPath(); g.moveTo(cx+20,ty+18); g.lineTo(cx+10,ty+16); g.lineTo(cx+16,ty+9); g.fill();
  g.strokeStyle=css("--muted"); line(g,[[cx-150,ty],[cx-110,ty]]); line(g,[[cx-50,ty],[cx+4,ty]]); g.strokeStyle=css("--ink"); g.lineWidth=2.5; zigH(g,cx-110,cx-50,ty,7);
  txt(g,"Rb "+fmt(Rs,"Ω"),cx-80,ty-14,"center","--accent"); txt(g,Vin.toFixed(1)+" V pin",cx-154,ty+4,"right","--muted"); txt(g,"Ib "+fmt(Ib,"A"),cx-80,ty+24,"center","--muted",11);}};

/* ================= CH5 ================= */
const LEDS={red:{n:"Red",vf:1.9,c:"#ff3b30"},yel:{n:"Yellow",vf:2.1,c:"#ffc400"},grn:{n:"Green",vf:3.0,c:"#2fd060"},blu:{n:"Blue",vf:3.1,c:"#3a7bff"},wht:{n:"White",vf:3.2,c:"#f4f8ff"}};
const LEDR=[0,...BC.e12List(10,10000)];
L.led={title:"Don't fry the LED",sub:"pick a resistor, see what happens",html:()=>`
  <div class="ctrls">${rng("ld-vs","Supply",2,12,0.1,5)}${sel("ld-c","LED color",Object.entries(LEDS).map(([k,l])=>[k,l.n+" (≈"+l.vf+" V)"]),"red")}${rng("ld-r","Series resistor",0,LEDR.length-1,1,LEDR.indexOf(330))}
  <div class="row2"><button class="btn" type="button" id="ld-fix">Replace LED</button><button class="btn" type="button" id="ld-best">Pick 10 mA for me</button></div></div>
  <div class="readout">${ro("LED current","ld-i",1)}${ro("Brightness","ld-b")}${ro("Resistor power","ld-p")}${ro("Ideal resistor for 10 mA","ld-id")}<p class="note" id="ld-n"></p></div>
  <canvas class="plot tall" id="ld-cv" aria-label="LED circuit with glowing LED"></canvas>`,
 init(){let s=0, over=0; const sm=[]; this._st={I:0,dead:false};
  $("#ld-fix").addEventListener("click",()=>{this._st.dead=false; over=0; this.run();});
  $("#ld-best").addEventListener("click",()=>{const Vs=+$("#ld-vs").value,l=LEDS[$("#ld-c").value]; const r=BC.e12Up((Vs-l.vf)/0.01); const i=LEDR.indexOf(r); if(i>0){$("#ld-r").value=i; this._st.dead=false; over=0; this.run();}});
  BC.anim(dt=>{const cv=$("#ld-cv"); if(!cv) return; const {g,W,H}=BC.fit(cv), st=this._st, l=LEDS[$("#ld-c").value];
   if(!st.dead && st.I>0.04){ over+=dt; if(over>0.35||BC.reduced){ st.dead=true; BC.beep("pop"); BC.S.fried=(BC.S.fried||0)+1; BC.save(); BC.badge("smoke"); for(let k=0;k<16;k++) smoke(sm,W/2+60+BC.rand(-8,8),40); this.run(); } } else over=0;
   const r={x0:50,x1:W-50,y0:46,y1:H-30}, ym=(r.y0+r.y1)/2, ra=W/2-110, rb=W/2-20, lx=W/2+60;
   const I=st.dead?0:st.I; s+=(I>0?clamp((Math.log10(I*1e6)+0.5)/6,0.03,1.4)*0.22:0)*dt;
   g.strokeStyle=css("--muted"); g.lineWidth=2; line(g,[[r.x0,ym-12],[r.x0,r.y0],[ra,r.y0]]); line(g,[[rb,r.y0],[lx-14,r.y0]]); line(g,[[lx+14,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1],[r.x0,ym+12]]);
   g.strokeStyle=css("--ink"); battV(g,r.x0,ym,st.Vs.toFixed(1)+" V");
   if(st.R>0){g.lineWidth=2.5; zigH(g,ra,rb,r.y0,8); txt(g,fmt(st.R,"Ω"),(ra+rb)/2,r.y0-16);} else {g.strokeStyle=css("--bad"); g.lineWidth=2; line(g,[[ra,r.y0],[rb,r.y0]]); txt(g,"no resistor!",(ra+rb)/2,r.y0-16,"center","--bad");}
   const b=st.dead?0:clamp(Math.sqrt(I/0.02),0,1.6);
   if(b>0.02){const grd=g.createRadialGradient(lx,r.y0,2,lx,r.y0,26+40*b); grd.addColorStop(0,l.c); grd.addColorStop(1,"rgba(0,0,0,0)"); g.globalAlpha=Math.min(1,b); g.fillStyle=grd; g.beginPath(); g.arc(lx,r.y0,26+40*b,0,7); g.fill(); g.globalAlpha=1;}
   g.fillStyle=st.dead?"#3a3a3a":(b>0.02?l.c:css("--sunk")); g.strokeStyle=css("--ink"); g.lineWidth=2;
   g.beginPath(); g.moveTo(lx-12,r.y0-12); g.lineTo(lx+10,r.y0); g.lineTo(lx-12,r.y0+12); g.closePath(); g.fill(); g.stroke(); line(g,[[lx+11,r.y0-12],[lx+11,r.y0+12]]);
   if(!st.dead){g.strokeStyle=css("--muted"); g.lineWidth=1.5; line(g,[[lx+2,r.y0-16],[lx+10,r.y0-26]]); line(g,[[lx+10,r.y0-14],[lx+18,r.y0-24]]);}
   else txt(g,"FRIED",lx,r.y0+32,"center","--bad",12);
   drawSmoke(g,sm,dt);
   g.fillStyle=css("--accent"); const N=Math.max(14,Math.round((W+H)/26));
   if(I>0) for(let i=0;i<N;i++){const [x,y]=loopPt(r,s+i/N); if(x===r.x0&&Math.abs(y-ym)<14) continue; g.beginPath(); g.arc(x,y,3,0,7); g.fill();}
  });},
 run(){const Vs=+$("#ld-vs").value,l=LEDS[$("#ld-c").value],R=LEDR[+$("#ld-r").value]; out("ld-vs",Vs.toFixed(1)+" V"); out("ld-r",R?fmt(R,"Ω"):"0 Ω (none)");
  const d={vf:l.vf}, q=diodeQ(d,Vs,R+1.5), st=this._st; Object.assign(st,{Vs,R,I:Math.max(0,q.I)});
  setT("ld-i",st.dead?"0 A":fmt(st.I,"A")); setT("ld-b",st.dead?"dead":Math.min(100,Math.round(Math.sqrt(st.I/0.02)*100))+"%"); setT("ld-p",fmt(st.I*st.I*R,"W"));
  setT("ld-id",Vs>l.vf+0.2?fmt(BC.e12Up((Vs-l.vf)/0.01),"Ω"):"supply too low");
  if(st.dead) note("ld-n","You let out the magic smoke. Small LEDs are rated for about 20–30 mA. Press Replace LED and add more resistance.","bad");
  else if(st.I>0.04) note("ld-n","Way over the rating. It's about to go...","bad");
  else if(st.I>0.025) note("ld-n","Over 25 mA. It's very bright but won't live long.","warn");
  else if(st.I<0.0005) note("ld-n",Vs<l.vf?"The supply is below the LED's forward voltage, so it can't turn on.":"Barely glowing. Use a smaller resistor.");
  else note("ld-n","Safe and bright. Modern LEDs look fine at just 2–10 mA.");}};

/* ================= CH6 ================= */
L.ntc={title:"Thermistor in a divider",sub:"10 kΩ NTC, B = 3950",html:()=>`
  <div class="ctrls">${rng("nt-t","Temperature",-20,100,1,25)}${rng("nt-rf","Fixed resistor",3,5,0.01,4)}${sel("nt-v","Supply",[["3.3","3.3 V"],["5","5 V"]],"3.3")}
  <p class="note">The thermometer is the temperature slider. A fixed resistor equal to the thermistor's 25 °C value gives the most linear response near room temperature.</p></div>
  <div class="readout">${ro("Thermistor resistance","nt-r")}${ro("Output voltage","nt-vo",1)}${ro("10-bit ADC reading","nt-adc")}</div>
  <canvas class="plot" id="nt-cv" aria-label="Output voltage versus temperature"></canvas>`,
 run(){const T=+$("#nt-t").value,Rf=lv("nt-rf"),V=+$("#nt-v").value; out("nt-t",T+" °C"); out("nt-rf",fmt(Rf,"Ω"));
  const Rt=t=>1e4*Math.exp(3950*(1/(t+273.15)-1/298.15)), Vo=t=>V*Rf/(Rt(t)+Rf);
  setT("nt-r",fmt(Rt(T),"Ω")); setT("nt-vo",Vo(T).toFixed(3)+" V"); setT("nt-adc",Math.round(Vo(T)/V*1023));
  const pts=[]; for(let t=-20;t<=100;t+=1) pts.push([t,Vo(t)]);
  BC.plot($("#nt-cv"),{x:[-20,100],y:[0,V],xt:[-20,0,25,50,75,100].map(t=>[t,t+"°C"]),yt:[[0,"0"],[V/2,(V/2).toFixed(2)],[V,V+"V"]],series:[{pts,fill:true}],bands:[[0,V,T<0?"--trace":T>60?"--bad":"--accent"]].slice(0,0),marks:[[T,Vo(T),Vo(T).toFixed(2)+" V",T>60?"right":"left"]]});}};

/* ================= CH7: OSCILLOSCOPE ================= */
const TDIV=[1e-6,2e-6,5e-6,1e-5,2e-5,5e-5,1e-4,2e-4,5e-4,1e-3,2e-3,5e-3,1e-2,2e-2,5e-2,0.1,0.2,0.5];
const VDIV=[0.05,0.1,0.2,0.5,1,2,5];
const WAVES={sine:"Sine",square:"Square",tri:"Triangle",saw:"Sawtooth",pwm:"PWM 25%",noisy:"Noisy sine"};
function waveVal(w,p){switch(w){case"sine":case"noisy":return Math.sin(2*Math.PI*p);case"square":return p<.5?1:-1;case"tri":return 4*Math.abs(p-.5)-1;case"saw":return 2*p-1;case"pwm":return p<.25?1:-1;}return 0;}
L.scope={title:"Oscilloscope simulator",sub:"knobs, trigger and a mystery signal",html:()=>`
  <div class="scopeWrap"><canvas class="scope" id="sc-cv" aria-label="Oscilloscope screen"></canvas>
  <div class="scopeReadout mono" id="sc-meas"></div></div>
  <div class="ctrls">
   <div class="ctrlGroup"><span class="label">Signal generator</span>${sel("sc-w","Waveform",Object.entries(WAVES),"sine")}${rng("sc-f","Frequency",0,5,0.01,3)}${rng("sc-a","Amplitude (peak)",0.1,8,0.05,2)}${rng("sc-o","DC offset",-4,4,0.05,0)}</div>
  </div>
  <div class="ctrls">
   <div class="ctrlGroup"><span class="label">Scope</span>${sel("sc-vd","Volts / division",VDIV.map(v=>[v,fmt(v,"V")]),"1")}${sel("sc-td","Time / division",TDIV.map(v=>[v,fmt(v,"s")]),"0.0002")}${rng("sc-tl","Trigger level",-6,6,0.05,0)}
   <div class="row2">${sel("sc-cp","Coupling",[["dc","DC"],["ac","AC"]],"dc")}${sel("sc-tr","Trigger",[["on","Normal"],["off","Off (free run)"]],"on")}</div>
   <div class="row2"><button class="btn" type="button" id="sc-auto">Autoset</button><button class="btn primary" type="button" id="sc-myst">Mystery signal</button></div></div>
  </div>
  <div class="mystery" id="sc-mp" hidden><b>Mystery signal.</b> The generator is hidden. Use the knobs and the grid to measure it. Count divisions, then multiply.
   <div class="row3"><div class="ctrl"><label for="sc-gf"><span>Your frequency (Hz)</span></label><input type="number" id="sc-gf" step="any"></div><div class="ctrl"><label for="sc-gv"><span>Your peak-to-peak (V)</span></label><input type="number" id="sc-gv" step="any"></div><button class="btn primary" type="button" id="sc-chk">Check</button></div>
   <p class="note" id="sc-mr"></p></div>`,
 init(root){const self=this; self.st={drift:0,myst:null};
  const fOf=()=>Math.pow(10,+$("#sc-f").value);
  const params=()=>self.st.myst||{w:$("#sc-w").value,f:fOf(),a:+$("#sc-a").value,o:+$("#sc-o").value};
  const stats=p=>{let mn=1e9,mx=-1e9,s=0,s2=0;for(let i=0;i<1000;i++){const v=p.o+p.a*waveVal(p.w,i/1000);mn=Math.min(mn,v);mx=Math.max(mx,v);s+=v;s2+=v*v;}return {mn,mx,mean:s/1000,rms:Math.sqrt(s2/1000)};};
  $("#sc-auto").addEventListener("click",()=>{const p=params(), st=stats(p); const want=2.5/p.f/10; let ti=TDIV.findIndex(t=>t>=want); if(ti<0) ti=TDIV.length-1; $("#sc-td").value=TDIV[ti];
    const span=(st.mx-st.mn)||0.1; const vi=VDIV.findIndex(v=>v*6>=span); $("#sc-vd").value=VDIV[vi<0?VDIV.length-1:vi]; $("#sc-tl").value=((st.mx+st.mn)/2).toFixed(2); $("#sc-tr").value="on"; BC.touchLab("scope"); self.run();});
  $("#sc-myst").addEventListener("click",()=>{
    if(self.st.myst){self.st.myst=null; $("#sc-mp").hidden=true; $("#sc-myst").textContent="Mystery signal"; $$("#sc-w,#sc-f,#sc-a,#sc-o").forEach(e=>e.disabled=false); self.run(); return;}
    const fs=[50,60,120,250,440,500,1000,1200,2000,5000,8000,10000,25];
    self.st.myst={w:BC.pick(["sine","square","tri","saw","pwm"]),f:BC.pick(fs)*BC.pick([1,1,1.5,2]),a:+BC.pick([0.5,1,1.5,2,2.5,3,4,5]),o:+BC.pick([0,0,0,1,-1,2])};
    $("#sc-mp").hidden=false; $("#sc-mr").textContent=""; $("#sc-gf").value=""; $("#sc-gv").value=""; $("#sc-myst").textContent="Leave mystery mode"; $$("#sc-w,#sc-f,#sc-a,#sc-o").forEach(e=>e.disabled=true);
    $("#sc-td").value="0.001"; $("#sc-vd").value="5"; $("#sc-tl").value="0"; self.run(); BC.touchLab("scope");});
  $("#sc-chk").addEventListener("click",()=>{const m=self.st.myst; if(!m) return; const gf=+$("#sc-gf").value, gv=+$("#sc-gv").value, vpp=2*m.a;
    const okf=gf>0&&Math.abs(gf-m.f)/m.f<0.1, okv=gv>0&&Math.abs(gv-vpp)/vpp<0.12;
    const r=$("#sc-mr");
    if(okf&&okv){r.className="note good"; r.textContent=`Nailed it: ${fmt(m.f,"Hz")}, ${vpp} V peak-to-peak (${WAVES[m.w].toLowerCase()}${m.o?`, ${m.o} V offset`:""}).`; BC.beep("good"); BC.once("myst",30,"mystery signal solved"); BC.S.scoped=(BC.S.scoped||0)+1; BC.save(); BC.badge("probe"); BC.confetti();
      clearTimeout(self.mt); self.mt=setTimeout(()=>{ const b=$("#sc-myst"); if(b&&self.st.myst===m) b.click(); },1800); BC.leave.push(()=>clearTimeout(self.mt));}
    else {r.className="note bad"; r.textContent=`${okf?"Frequency is right.":"Frequency is off. Measure the time for one full cycle, then take 1 / that time."} ${okv?"Vpp is right.":"Vpp is off. Count divisions from the lowest point to the highest, times volts per division."}`; BC.beep("bad");}});
  BC.anim(dt=>{const cv=$("#sc-cv"); if(!cv) return; const {g,W,H}=BC.fit(cv), p=params(), st=stats(p);
   const vd=+$("#sc-vd").value, td=+$("#sc-td").value, tl=+$("#sc-tl").value, ac=$("#sc-cp").value==="ac", trig=$("#sc-tr").value==="on";
   const dw=W/10, dh=H/8, cy=H/2, mean=ac?st.mean:0, period=1/p.f;
   g.fillStyle=css("--scope-bg"); g.fillRect(0,0,W,H);
   g.strokeStyle=css("--scope-grid"); g.lineWidth=1;
   for(let i=1;i<10;i++){g.globalAlpha=i===5?.9:.45; line(g,[[i*dw,0],[i*dw,H]]);} for(let j=1;j<8;j++){g.globalAlpha=j===4?.9:.45; line(g,[[0,j*dh],[W,j*dh]]);} g.globalAlpha=1;
   for(let i=0;i<50;i++){line(g,[[i*dw/5,cy-3],[i*dw/5,cy+3]]);} for(let j=0;j<40;j++){line(g,[[W/2-3,j*dh/5],[W/2+3,j*dh/5]]);}
   const sig=t=>p.o+p.a*waveVal(p.w,((t/period)%1+1)%1)-mean;
   let t0=0, locked=false;
   if(trig){const N=800;for(let i=0;i<N;i++){const ta=i/N*period, tb=(i+1)/N*period; if(sig(ta)<tl&&sig(tb)>=tl){t0=tb;locked=true;break;}}}
   if(!locked){ self.st.drift+=dt*period*0.37*(trig?1:1); t0=self.st.drift; }
   const cpp=10*td/period; const toY=v=>cy-v/vd*dh; const col=css("--phosphor");
   g.save(); g.strokeStyle=col; g.lineWidth=2; g.shadowColor=col; g.shadowBlur=8;
   if(cpp>250){ const y1=toY(st.mx-mean), y2=toY(st.mn-mean); g.fillStyle=col; g.globalAlpha=.35; g.fillRect(0,Math.min(y1,y2),W,Math.abs(y2-y1)); g.globalAlpha=1; line(g,[[0,y1],[W,y1]]); line(g,[[0,y2],[W,y2]]); }
   else { const N=Math.min(2400,Math.max(500,Math.round(cpp*80))); g.beginPath(); for(let i=0;i<=N;i++){const x=i/N*W, t=t0+(x/dw-1)*td; let v=sig(t); if(p.w==="noisy") v+=BC.rand(-.12,.12)*p.a; const y=clamp(toY(v),-10,H+10); i?g.lineTo(x,y):g.moveTo(x,y);} g.stroke(); }
   g.restore();
   g.fillStyle=css("--accent"); const ty=clamp(toY(tl),4,H-4); g.beginPath(); g.moveTo(W,ty); g.lineTo(W-9,ty-5); g.lineTo(W-9,ty+5); g.fill();
   if(trig){g.beginPath(); g.moveTo(dw,0); g.lineTo(dw-5,-0); g.lineTo(dw,8); g.lineTo(dw+5,0); g.fill();}
   g.font="11px 'IBM Plex Mono',monospace"; g.fillStyle=css("--phosphor"); g.textAlign="left";
   g.fillText(`CH1 ${fmt(vd,"V")}/div  ${ac?"AC":"DC"}`,8,16); g.textAlign="right"; g.fillText(`${fmt(td,"s")}/div`,W-14,16);
   g.textAlign="left"; g.fillStyle=locked?css("--phosphor"):css("--accent"); g.fillText(trig?(locked?"TRIG'D":"NO TRIG — level outside signal"):"FREE RUN",8,H-8);
   const m=$("#sc-meas"); if(m){ m.textContent = self.st.myst ? "Measurements hidden in mystery mode" : `f ${fmt(p.f,"Hz")}   Vpp ${(st.mx-st.mn).toFixed(2)} V   Vrms ${st.rms.toFixed(2)} V   mean ${st.mean.toFixed(2)} V`; }
  });},
 run(){out("sc-f",fmt(Math.pow(10,+$("#sc-f").value),"Hz")); out("sc-a",(+$("#sc-a").value).toFixed(2)+" V"); out("sc-o",(+$("#sc-o").value).toFixed(2)+" V"); out("sc-tl",(+$("#sc-tl").value).toFixed(2)+" V");}};

/* ================= CH8 ================= */
L.opamp={title:"Op amp gain stage",sub:"waveforms and clipping",html:()=>`
  <div class="ctrls">${sel("op-m","Configuration",[["non","Non-inverting: G = 1 + Rf/Rin"],["inv","Inverting: G = −Rf/Rin"]],"non")}${rng("op-rf","Rf",2,6,0.01,4)}${rng("op-ri","Rin",2,6,0.01,3)}${rng("op-vin","Input amplitude (peak)",0.01,3,0.01,0.5)}${rng("op-s","Supply (±)",3,15,0.5,9)}</div>
  <div class="readout">${ro("Gain","op-g")}${ro("Output peak (ideal)","op-vi")}${ro("Output peak (real)","op-vo",1)}<p class="note" id="op-n"></p></div>
  <canvas class="plot" id="op-cv" aria-label="Input and output waveforms"></canvas>`,
 run(){const m=$("#op-m").value,Rf=lv("op-rf"),Ri=lv("op-ri"),A=+$("#op-vin").value,Vs=+$("#op-s").value;
  out("op-rf",fmt(Rf,"Ω")); out("op-ri",fmt(Ri,"Ω")); out("op-vin",A.toFixed(2)+" V"); out("op-s","±"+Vs+" V");
  const G=m==="non"?1+Rf/Ri:-Rf/Ri, lim=Vs-1.5, Vi=Math.abs(G*A), Vo=Math.min(Vi,lim);
  setT("op-g",G.toFixed(2)+"× ("+(20*Math.log10(Math.abs(G))).toFixed(1)+" dB)"); setT("op-vi",Vi.toFixed(2)+" V"); setT("op-vo",Vo.toFixed(2)+" V");
  const clip=Vi>lim;
  note("op-n",clip?`Clipping! The output can't swing past about ±${lim.toFixed(1)} V. Those flat tops sound terrible in audio. Lower the gain or the input.`:m==="inv"?"The output is flipped upside down. The inverting input sits at virtual ground, so the input impedance equals Rin.":"Same shape and phase, just bigger. The input impedance is huge, so the source barely notices it.",clip?"bad":"");
  const pi=[],po=[]; for(let i=0;i<=400;i++){const x=i/400*2, v=A*Math.sin(2*Math.PI*x); pi.push([x,v]); po.push([x,clamp(G*v,-lim,lim)]);}
  const Y=Math.max(Vs,A)*1.05;
  BC.plot($("#op-cv"),{x:[0,2],y:[-Y,Y],xt:[[0,""],[0.5,""],[1,"1 cycle"],[1.5,""],[2,"2"]],yt:[[-Vs,"−"+Vs],[0,"0"],[Vs,"+"+Vs+"V"]],bands:[[lim,Vs,"--bad"],[-Vs,-lim,"--bad"]],series:[{pts:pi,color:"--muted",width:1.5},{pts:po}],legend:[["input","--muted"],["output","--trace"]]});}};

L.hyst={title:"Comparator with hysteresis",sub:"why outputs chatter",html:()=>`
  <div class="ctrls">${rng("hy-n","Noise on input",0,0.4,0.01,0.12)}${rng("hy-h","Hysteresis window",0,0.8,0.01,0)}<button class="btn" type="button" id="hy-new">New noise</button>
  <p class="note">The input is a slow signal with noise on top, like a light sensor at dusk. Watch the output flicker near the threshold, then widen the hysteresis window.</p></div>
  <div class="readout">${ro("Output transitions","hy-c",1)}${ro("Ideal","hy-i")}${ro("Thresholds","hy-th")}<p class="note" id="hy-nt"></p></div>
  <canvas class="plot tall" id="hy-cv" aria-label="Comparator input and output"></canvas>`,
 init(){this.seed=Math.random()*1000; $("#hy-new").addEventListener("click",()=>{this.seed=Math.random()*1000; this.run();});},
 run(){const nz=+$("#hy-n").value,h=+$("#hy-h").value; out("hy-n",nz.toFixed(2)+" V"); out("hy-h",h.toFixed(2)+" V");
  let s=this.seed; const r=()=>{s=(s*9301+49297)%233280; return s/233280-.5;};
  const N=700, pin=[],pout=[]; let st=0,cnt=0, f=0;
  for(let i=0;i<=N;i++){const x=i/N*2; f=f*0.6+r()*0.8; const v=Math.sin(2*Math.PI*x)+nz*2.2*f;
    const hi=h/2, lo=-h/2; const ns = st? (v>lo?1:0) : (v>hi?1:0); if(i&&ns!==st) cnt++; st=ns; pin.push([x,v]); pout.push([x,st?-1.55:-2.45]);}
  setT("hy-c",cnt); setT("hy-i","4"); setT("hy-th",h>0?`+${(h/2).toFixed(2)} / −${(h/2).toFixed(2)} V`:"single, 0 V");
  note("hy-nt",cnt>4?`${cnt-4} extra glitches. A relay or a counter would see each one.`:"Clean switching. Each crossing gives exactly one transition.",cnt>4?"warn":"good");
  BC.plot($("#hy-cv"),{x:[0,2],y:[-2.7,1.8],xt:[],yt:[[1,"+1"],[0,"0"],[-1,"−1"],[-2,"out"]],series:[{pts:pin,color:"--muted",width:1.2},{pts:[[0,h/2],[2,h/2]],color:"--accent",width:1.2,dash:[5,4]},{pts:[[0,-h/2],[2,-h/2]],color:"--accent",width:1.2,dash:[5,4]},{pts:pout,width:2.5}],legend:[["input","--muted"],["threshold","--accent"],["output","--trace"]]});}};

/* ================= CH9 ================= */
let noiseBuf=null;
function getNoise(ac){ if(noiseBuf) return noiseBuf; noiseBuf=ac.createBuffer(1,ac.sampleRate*2,ac.sampleRate); const d=noiseBuf.getChannelData(0); let b=0; for(let i=0;i<d.length;i++){ const w=Math.random()*2-1; b=0.97*b+0.03*w; d[i]=w*0.5+b*3; } return noiseBuf; }
L.filter={title:"RC filter: see it and hear it",sub:"first order",html:()=>`
  <div class="ctrls">${sel("fl-m","Type",[["lp","Low-pass (keeps the bass)"],["hp","High-pass (keeps the treble)"]],"lp")}${rng("fl-r","R",2,6,0.01,3.204)}${rng("fl-c","C",-10,-5,0.01,-7)}${rng("fl-f","Test frequency",0,6,0.01,3.5)}
  <div class="row2"><button class="btn primary" type="button" id="fl-play">▶ Listen through filter</button>${sel("fl-src","Sound",[["noise","Noise (hiss)"],["buzz","Buzz (110 Hz sawtooth)"],["music","Arpeggio"]],"music")}</div>
  <label class="check"><input type="checkbox" id="fl-byp"> Bypass the filter (compare)</label></div>
  <div class="readout">${ro("Cutoff fc","fl-fc",1)}${ro("Gain at test frequency","fl-g")}${ro("Output / input","fl-r2")}${ro("Phase shift","fl-ph")}</div>
  <canvas class="plot" id="fl-cv" aria-label="Frequency response plot"></canvas>
  <canvas class="plot" id="fl-cv2" aria-label="Input and output sine waves at the test frequency"></canvas>`,
 init(){const self=this; let nodes=null, arpT=null;
  const stop=()=>{ if(nodes){ try{nodes.src.stop();}catch(e){} nodes.out.disconnect(); nodes=null; } clearInterval(arpT); arpT=null; const b=$("#fl-play"); if(b) b.textContent="▶ Listen through filter"; };
  BC.leave.push(stop);
  /* one-pole IIR via the bilinear transform: exactly first order (-20 dB/decade) like the plot. A biquad would be 2nd order, and two would be 4th. Coefficients are fixed per node, so each change swaps in a fresh node. */
  self.apply=()=>{ if(!nodes) return; const ac=BC.audio(); if(!ac){ stop(); return; }
   const K=Math.tan(Math.PI*clamp(self.fc,20,20000)/ac.sampleRate), k=1/(1+K), lp=$("#fl-m").value==="lp";
   const f=ac.createIIRFilter(lp?[K*k,K*k]:[k,-k],[1,(K-1)*k]);
   if(nodes.f){ try{nodes.src.disconnect(nodes.f); nodes.f.disconnect();}catch(e){} }
   nodes.src.connect(f); f.connect(nodes.wet); nodes.f=f; const byp=$("#fl-byp").checked; nodes.dry.gain.value=byp?1:0; nodes.wet.gain.value=byp?0:1; };
  $("#fl-byp").addEventListener("change",()=>self.apply());
  $("#fl-src").addEventListener("change",()=>{ if(nodes){stop(); $("#fl-play").click();} });
  $("#fl-play").addEventListener("click",()=>{
   if(nodes){stop();return;} const ac=BC.audio(); if(!ac) return; BC.touchLab("filter");
   const out=ac.createGain(); out.gain.value=0.18; out.connect(ac.destination);
   const wet=ac.createGain(), dry=ac.createGain();
   let src; const kind=$("#fl-src").value;
   if(kind==="noise"){ src=ac.createBufferSource(); src.buffer=getNoise(ac); src.loop=true; }
   else { src=ac.createOscillator(); src.type="sawtooth"; src.frequency.value=110; if(kind==="music"){ const notes=[110,138.6,164.8,220,164.8,138.6]; let k=0; arpT=setInterval(()=>{ src.frequency.setValueAtTime(notes[k++%notes.length],ac.currentTime); },180);} }
   src.connect(dry); wet.connect(out); dry.connect(out); src.start();
   nodes={src,out,f:null,wet,dry}; self.apply(); $("#fl-play").textContent="■ Stop";
  });},
 run(){const m=$("#fl-m").value,R=lv("fl-r"),C=lv("fl-c"),f=lv("fl-f"),fc=1/(2*Math.PI*R*C); this.fc=fc; this.apply&&this.apply();
  out("fl-r",fmt(R,"Ω")); out("fl-c",fmt(C,"F")); out("fl-f",fmt(f,"Hz"));
  const H=x=>{const r=x/fc; return m==="lp"?1/Math.sqrt(1+r*r):r/Math.sqrt(1+r*r);}, dB=x=>20*Math.log10(H(x)), ph=x=>m==="lp"?-Math.atan(x/fc):Math.PI/2-Math.atan(x/fc);
  setT("fl-fc",fmt(fc,"Hz")); setT("fl-g",dB(f).toFixed(1)+" dB"); setT("fl-r2",(H(f)*100).toFixed(1)+"%"); setT("fl-ph",(ph(f)*180/Math.PI).toFixed(0)+"°");
  const pts=[]; for(let i=0;i<=240;i++){const x=Math.pow(10,i/240*6); pts.push([x,dB(x)]);}
  BC.plot($("#fl-cv"),{x:[1,1e6],y:[-60,4],logx:true,bands:[[-60,4,"--trace"]].slice(0,0),xt:[[1,"1"],[10,"10"],[100,"100"],[1e3,"1k"],[1e4,"10k"],[20000,""],[1e5,"100k"],[1e6,"1MHz"]],yt:[[0,"0dB"],[-20,"−20"],[-40,"−40"],[-60,"−60"]],series:[{pts,fill:true}],marks:[[clamp(fc,1,1e6),-3,"−3 dB at fc"],[f,dB(f),"test",f>1e5?"right":"left","--ink"]]});
  const pi=[],po=[]; for(let i=0;i<=300;i++){const x=i/300*2; pi.push([x,Math.sin(2*Math.PI*x)]); po.push([x,H(f)*Math.sin(2*Math.PI*x+ph(f))]);}
  BC.plot($("#fl-cv2"),{x:[0,2],y:[-1.2,1.2],xt:[[1,"1 cycle at "+fmt(f,"Hz")]],yt:[[-1,"−1"],[0,"0"],[1,"+1"]],series:[{pts:pi,color:"--muted",width:1.5},{pts:po}],legend:[["in","--muted"],["out","--trace"]]});}};

/* ================= CH10 ================= */
function pulseWave(ac,D){const n=64,re=new Float32Array(n),im=new Float32Array(n);for(let k=1;k<n;k++){re[k]=Math.sin(2*Math.PI*k*D)/(k*Math.PI);im[k]=(1-Math.cos(2*Math.PI*k*D))/(k*Math.PI);}return ac.createPeriodicWave(re,im);}
L.timer555={title:"555 astable: blink it, hear it",sub:"free-running oscillator",html:()=>`
  <div class="ctrls">${rng("t5-r1","R1",3,6,0.01,3)}${rng("t5-r2","R2",3,6,0.01,4.65)}${rng("t5-c","C",-9,-4,0.01,-5)}
  <div class="ledRow"><div class="led big" id="t5-led"></div><div><b id="t5-ledt">Blinking</b><p class="note" id="t5-ledn"></p></div></div>
  <button class="btn primary" type="button" id="t5-play">♪ Play as a tone</button></div>
  <div class="readout">${ro("Frequency","t5-f",1)}${ro("Duty cycle","t5-d")}${ro("High time","t5-h")}${ro("Low time","t5-l")}</div>
  <canvas class="plot" id="t5-cv" aria-label="555 output and capacitor waveform"></canvas>`,
 init(){const self=this; let ph=0;
  BC.anim(dt=>{const led=$("#t5-led"); if(!led||!self.T) return; const f=1/self.T;
   if(f<=25){ ph=(ph+dt/self.T)%1; led.style.opacity=""; led.classList.toggle("on",ph<self.D); }
   else { led.classList.add("on"); led.style.opacity=(0.25+0.75*self.D).toFixed(2); }});
  $("#t5-play").addEventListener("click",()=>{ const f=1/self.T; if(f<20||f>12000){ BC.toast(f<20?"Too slow to hear. Below 20 Hz you hear clicks, not a tone. Shrink C or the resistors.":"Above 12 kHz. Too high to hear comfortably.",""); return; }
   const ac=BC.audio(); if(!ac) return; const o=ac.createOscillator(), g=ac.createGain(); o.setPeriodicWave(pulseWave(ac,self.D)); o.frequency.value=f; g.gain.setValueAtTime(0.0001,ac.currentTime); g.gain.exponentialRampToValueAtTime(0.12,ac.currentTime+0.02); g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+1.4); o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime+1.45); BC.touchLab("timer555"); });},
 run(){const R1=lv("t5-r1"),R2=lv("t5-r2"),C=lv("t5-c"); out("t5-r1",fmt(R1,"Ω")); out("t5-r2",fmt(R2,"Ω")); out("t5-c",fmt(C,"F"));
  const th=0.693*(R1+R2)*C, tl=0.693*R2*C, T=th+tl, D=th/T; this.T=T; this.D=D;
  setT("t5-f",fmt(1/T,"Hz")); setT("t5-d",(D*100).toFixed(1)+"%"); setT("t5-h",fmt(th,"s")); setT("t5-l",fmt(tl,"s"));
  const f=1/T; setT("t5-ledt",f<=25?"Blinking for real":"Looks steady");
  $("#t5-ledn").textContent=f<=25?`${f.toFixed(2)} times a second, in real time.`:`At ${fmt(f,"Hz")} your eye can't follow (persistence of vision). It looks ${Math.round(D*100)}% bright instead. This is exactly how PWM dimming works.`;
  const o=[],cap=[]; const k=(1-Math.exp(-0.693));
  for(let c=0;c<3;c++){ o.push([c,4.7],[c+D,4.7],[c+D,0.1],[c+1,0.1]); for(let i=0;i<=24;i++){const x=i/24; cap.push([c+x*D, 5/3+(5/3)*(1-Math.exp(-0.693*x))/k]);} for(let i=0;i<=24;i++){const x=i/24; cap.push([c+D+x*(1-D), 10/3-(5/3)*(1-Math.exp(-0.693*x))/k]);} }
  BC.plot($("#t5-cv"),{x:[0,3],y:[-0.3,5.4],xt:[[0,"0"],[1,"T"],[2,"2T"],[3,"3T"]],yt:[[0,"0"],[5/3,"⅓"],[10/3,"⅔"],[5,"Vcc"]],series:[{pts:[[0,5/3],[3,5/3]],color:"--line",width:1,dash:[3,3]},{pts:[[0,10/3],[3,10/3]],color:"--line",width:1,dash:[3,3]},{pts:o},{pts:cap,color:"--accent",width:1.6}],legend:[["output","--trace"],["capacitor","--accent"]]});}};

/* ================= CH11 ================= */
L.rectifier={title:"From AC to DC",sub:"rectifier and smoothing capacitor",html:()=>`
  <div class="ctrls">${sel("rf-m","Rectifier",[["full","Full-wave bridge (4 diodes)"],["half","Half-wave (1 diode)"]],"full")}${rng("rf-v","Transformer output (peak)",5,24,0.5,12)}${rng("rf-c","Smoothing capacitor",-6,-1.7,0.01,-3)}${rng("rf-i","Load current",10,1000,10,200)}${sel("rf-f","Mains",[["60","60 Hz"],["50","50 Hz"]],"60")}</div>
  <div class="readout">${ro("Output ripple (Vpp)","rf-rp",1)}${ro("Average DC","rf-dc")}${ro("Formula estimate","rf-est")}${ro("Minimum voltage","rf-min")}<p class="note" id="rf-n"></p></div>
  <canvas class="plot tall" id="rf-cv" aria-label="Rectified and smoothed waveform"></canvas>`,
 run(){const m=$("#rf-m").value,Vp=+$("#rf-v").value,C=lv("rf-c"),I=+$("#rf-i").value/1000,f=+$("#rf-f").value;
  out("rf-v",Vp+" V"); out("rf-c",fmt(C,"F")); out("rf-i",(I*1000).toFixed(0)+" mA");
  const T=1/f, N=2400, span=3*T, dt=span/N, drop=m==="full"?1.4:0.7; let vc=0; const pin=[],prc=[],pout=[]; let mn=1e9,mx=-1e9,sum=0,cnt=0;
  for(let i=0;i<=N*2;i++){const t=i*dt, s=Vp*Math.sin(2*Math.PI*f*t), r=Math.max(0,(m==="full"?Math.abs(s):s)-drop); vc=Math.max(r,vc-I/C*dt); vc=Math.max(vc,0);
    if(i>=N){const x=(i-N)*dt*1000; pin.push([x,s]); prc.push([x,r]); pout.push([x,vc]); if(i>N*1.3){mn=Math.min(mn,vc);mx=Math.max(mx,vc);sum+=vc;cnt++;}}}
  const rp=mx-mn, est=I/((m==="full"?2:1)*f*C);
  setT("rf-rp",rp.toFixed(2)+" V"); setT("rf-dc",(sum/cnt).toFixed(2)+" V"); setT("rf-est",est.toFixed(2)+" V"); setT("rf-min",mn.toFixed(2)+" V");
  note("rf-n",rp>Vp*0.3?"Huge ripple. The capacitor drains between peaks. Make it bigger or reduce the load.":rp>1?`Feed this into a 5 V regulator and it needs about ${(5+2).toFixed(0)} V at the bottom of each dip. Minimum here is ${mn.toFixed(1)} V.`:"Smooth enough to feed a linear regulator.",rp>Vp*0.3?"bad":rp>1?"warn":"good");
  const ms=span*1000;
  BC.plot($("#rf-cv"),{x:[0,ms],y:[-Vp*1.1,Vp*1.15],xt:[0,1,2,3].map(k=>[k*T*1000,(k*T*1000).toFixed(0)+"ms"]),yt:[[-Vp,"−"+Vp],[0,"0"],[Vp,"+"+Vp+"V"]],series:[{pts:pin,color:"--muted",width:1,dash:[4,4]},{pts:prc,color:"--accent",width:1.3},{pts:pout,width:2.6}],legend:[["AC in","--muted"],["rectified","--accent"],["smoothed out","--trace"]]});}};

L.reg={title:"Linear regulator heat check",sub:"78xx / LDO",html:()=>`
  <div class="ctrls">${rng("rg-vin","Input voltage",3,30,0.1,12)}${sel("rg-vo","Output",[["3.3","3.3 V"],["5","5 V"],["9","9 V"],["12","12 V"]],"5")}${rng("rg-i","Load current",10,1500,10,500)}${sel("rg-t","Regulator type",[["2","7805-style (≈2 V dropout)"],["0.3","LDO (≈0.3 V dropout)"]],"2")}</div>
  <div class="readout">${ro("Heat in regulator","rg-p",1)}${ro("Efficiency","rg-e")}${ro("Buck converter heat (≈90%)","rg-b")}${ro("TO-220 temp rise, no heatsink","rg-tr")}<p class="note" id="rg-n"></p></div>
  <div class="heatbar"><span class="label">Linear</span><div class="hb"><i id="rg-hb1"></i></div><span class="label">Buck</span><div class="hb"><i id="rg-hb2"></i></div></div>`,
 run(){const Vin=+$("#rg-vin").value,Vo=+$("#rg-vo").value,I=+$("#rg-i").value/1000,dr=+$("#rg-t").value;
  out("rg-vin",Vin.toFixed(1)+" V"); out("rg-i",(I*1000).toFixed(0)+" mA");
  if(Vin-Vo<dr){["rg-p","rg-e","rg-b","rg-tr"].forEach(i=>setT(i,"—")); note("rg-n",`The input is below output + dropout (${(Vo+dr).toFixed(1)} V needed). The regulator can't regulate.`,"bad"); return;}
  const P=(Vin-Vo)*I, bp=Vo*I/0.9-Vo*I, rise=P*50;
  setT("rg-p",fmt(P,"W")); setT("rg-e",(Vo/Vin*100).toFixed(0)+"%"); setT("rg-b",fmt(bp,"W")); setT("rg-tr","+"+rise.toFixed(0)+" °C");
  $("#rg-hb1").style.width=Math.min(100,P/6*100)+"%"; $("#rg-hb2").style.width=Math.min(100,bp/6*100)+"%";
  note("rg-n",rise>100?"Without a heatsink the junction would pass 125 °C and the chip shuts down. Use a heatsink or a buck converter.":P>1?"Too hot to touch. Add a heatsink.":"Fine without a heatsink.",rise>100?"bad":P>1?"warn":"good");}};

/* ================= CH12 ================= */
L.logic={title:"Logic gate playground",sub:"click the inputs",html:()=>`
  <div class="ctrls"><div class="gates" id="lg-g" role="group" aria-label="Gate type">${["AND","OR","NAND","NOR","XOR","XNOR","NOT"].map((g,i)=>`<button type="button" data-g="${g}" aria-pressed="${i===0}">${g}</button>`).join("")}</div>
  <div class="toggles"><div class="sw"><button type="button" id="lg-a" aria-pressed="false" aria-label="Input A"></button>A</div><div class="sw" id="lg-bw"><button type="button" id="lg-b" aria-pressed="false" aria-label="Input B"></button>B</div><span class="mono" style="color:var(--muted)">→</span><svg id="lg-sym" width="90" height="56" viewBox="0 0 90 56" aria-hidden="true"></svg><span class="mono" style="color:var(--muted)">→</span><div class="sw"><div class="led" id="lg-o"></div>OUT</div></div>
  <p class="note" id="lg-expr"></p></div>
  <div class="tablewrap"><table class="tt" id="lg-tt"></table></div>`,
 init(){let gate="AND"; const F=BC.GATES;
  const EX={AND:"OUT = A · B. Both must be 1.",OR:"OUT = A + B. Either one is enough.",NAND:"OUT = NOT(A · B). A universal gate: you can build any logic from NANDs alone.",NOR:"OUT = NOT(A + B). Also universal.",XOR:"OUT = A ⊕ B. 1 when the inputs differ. It's the heart of a binary adder.",XNOR:"OUT = NOT(A ⊕ B). 1 when the inputs match.",NOT:"OUT = NOT A. An inverter."};
  const A=$("#lg-a"),B=$("#lg-b");
  const draw=()=>{const a=+(A.getAttribute("aria-pressed")==="true"),b=+(B.getAttribute("aria-pressed")==="true"),one=gate==="NOT";
   $("#lg-bw").hidden=one; const o=F[gate](a,b); $("#lg-o").classList.toggle("on",!!o); $("#lg-expr").textContent=EX[gate]; $("#lg-sym").innerHTML=BC.gateSVG(gate);
   const rows=one?[[0],[1]]:[[0,0],[0,1],[1,0],[1,1]];
   $("#lg-tt").innerHTML=`<tr><th>A</th>${one?"":"<th>B</th>"}<th>OUT</th></tr>`+rows.map(r=>`<tr class="${(r[0]===a&&(one||r[1]===b))?"cur":""}"><td>${r[0]}</td>${one?"":`<td>${r[1]}</td>`}<td>${F[gate](r[0],r[1])}</td></tr>`).join("");};
  [A,B].forEach(el=>el.addEventListener("click",()=>{el.setAttribute("aria-pressed",el.getAttribute("aria-pressed")!=="true");BC.beep("click");BC.touchLab("logic");draw();}));
  $("#lg-g").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;gate=b.dataset.g;$$("#lg-g button").forEach(x=>x.setAttribute("aria-pressed",x===b));BC.touchLab("logic");draw();});
  draw();}};
BC.GATES={AND:(a,b)=>a&b,OR:(a,b)=>a|b,NAND:(a,b)=>1-(a&b),NOR:(a,b)=>1-(a|b),XOR:(a,b)=>a^b,XNOR:(a,b)=>1-(a^b),NOT:a=>1-a};
BC.gateSVG=function(g){const s='stroke="var(--ink)" stroke-width="2.2" fill="var(--surface)"';
  const inv=["NAND","NOR","XNOR","NOT"].includes(g), tip=g==="NOT"?62:64;
  let body;
  if(g==="AND"||g==="NAND") body=`<path d="M18 8 H40 A20 20 0 0 1 40 48 H18 Z" ${s}/>`;
  else if(g==="NOT") body=`<path d="M22 8 L60 28 L22 48 Z" ${s}/>`;
  else body=`<path d="M16 8 Q40 8 62 28 Q40 48 16 48 Q28 28 16 8 Z" ${s}/>`+(g.includes("X")?`<path d="M10 8 Q22 28 10 48" fill="none" stroke="var(--ink)" stroke-width="2.2"/>`:"");
  const ins=g==="NOT"?`<line x1="0" y1="28" x2="22" y2="28" stroke="var(--muted)" stroke-width="2"/>`:`<line x1="0" y1="18" x2="22" y2="18" stroke="var(--muted)" stroke-width="2"/><line x1="0" y1="38" x2="22" y2="38" stroke="var(--muted)" stroke-width="2"/>`;
  const end=inv?`<circle cx="${tip+4}" cy="28" r="4" ${s}/><line x1="${tip+8}" y1="28" x2="90" y2="28" stroke="var(--muted)" stroke-width="2"/>`:`<line x1="${g==="NOT"?60:62}" y1="28" x2="90" y2="28" stroke="var(--muted)" stroke-width="2"/>`;
  return ins+body+end;};

L.bits={title:"Bit flipper",sub:"binary, hex and a counter",html:()=>`
  <div class="bitRow" id="bt-row">${[7,6,5,4,3,2,1,0].map(i=>`<div class="bit"><button type="button" data-b="${i}" aria-pressed="false" aria-label="Bit ${i}">0</button><span class="mono">${1<<i}</span></div>`).join("")}</div>
  <div class="readout four">${ro("Decimal","bt-d",1)}${ro("Hex","bt-h")}${ro("Signed (two's complement)","bt-s")}${ro("ASCII character","bt-a")}</div>
  <div class="row2 wrapRow"><button class="btn" type="button" data-op="inc">+1</button><button class="btn" type="button" data-op="dec">−1</button><button class="btn" type="button" data-op="shl">Shift left (×2)</button><button class="btn" type="button" data-op="shr">Shift right (÷2)</button><button class="btn" type="button" data-op="not">Invert</button><button class="btn" type="button" data-op="clr">Clear</button><button class="btn primary" type="button" data-op="run">▶ Run counter</button></div>
  <p class="note">Each switch is worth double the one to its right. Run the counter and watch the rightmost bit flicker fastest. Each bit toggles at half the rate of the one before it, which is how a counter chip divides frequency.</p>`,
 init(){const self=this; self.v=65; let acc=0, runOn=false;
  const draw=()=>{const v=self.v; $$("#bt-row button").forEach(b=>{const on=(v>>+b.dataset.b)&1; b.setAttribute("aria-pressed",!!on); b.textContent=on;});
   setT("bt-d",v); setT("bt-h","0x"+v.toString(16).toUpperCase().padStart(2,"0")); setT("bt-s",v>127?v-256:v); setT("bt-a",v>=32&&v<127?`'${String.fromCharCode(v)}'`:"(control)");};
  $("#bt-row").addEventListener("click",e=>{const b=e.target.closest("button"); if(!b) return; self.v^=(1<<+b.dataset.b); BC.beep("click"); BC.touchLab("bits"); draw();});
  $("#bt-row").parentElement.addEventListener("click",e=>{const b=e.target.closest("[data-op]"); if(!b) return; const op=b.dataset.op; BC.touchLab("bits");
   if(op==="run"){runOn=!runOn; b.textContent=runOn?"■ Stop counter":"▶ Run counter"; return;}
   self.v=({inc:v=>(v+1)&255,dec:v=>(v+255)&255,shl:v=>(v<<1)&255,shr:v=>v>>1,not:v=>(~v)&255,clr:()=>0})[op](self.v); draw();});
  BC.anim(dt=>{ if(!runOn) return; acc+=dt; if(acc>0.12){acc=0; self.v=(self.v+1)&255; draw();} },()=>runOn);
  draw();}};

L.adc={title:"ADC: from smooth to steps",sub:"quantization",html:()=>`
  <div class="ctrls">${rng("ad-n","Resolution (bits)",1,16,1,3)}${sel("ad-ref","Reference voltage",[["5","5 V"],["3.3","3.3 V"],["1.1","1.1 V internal"]],"5")}${rng("ad-v","Input voltage",0,1,0.001,0.4)}</div>
  <div class="readout">${ro("Steps","ad-st")}${ro("Step size (1 LSB)","ad-lsb")}${ro("Reading","ad-code",1)}${ro("Voltage it represents","ad-back")}</div>
  <canvas class="plot" id="ad-cv" aria-label="Sine wave and its quantized version"></canvas>`,
 run(){const n=+$("#ad-n").value,ref=+$("#ad-ref").value,V=+$("#ad-v").value*ref, steps=Math.pow(2,n), code=Math.min(steps-1,Math.floor(V/ref*steps));
  out("ad-n",n+" bit"); out("ad-v",V.toFixed(3)+" V");
  setT("ad-st",steps.toLocaleString()); setT("ad-lsb",fmt(ref/steps,"V")); setT("ad-code",code+" (0x"+code.toString(16).toUpperCase()+")"); setT("ad-back",(code*ref/steps).toFixed(4)+" V");
  const s=[],q=[]; for(let i=0;i<=600;i++){const x=i/600, v=ref*(0.5+0.42*Math.sin(2*Math.PI*x*1.5)); s.push([x,v]); q.push([x,Math.floor(v/ref*steps)/steps*ref]);}
  BC.plot($("#ad-cv"),{x:[0,1],y:[0,ref],xt:[],yt:[[0,"0"],[ref/2,(ref/2).toFixed(2)],[ref,ref+"V"]],series:[{pts:s,color:"--muted",width:1.5},{pts:q,width:2.2},{pts:[[0,V],[1,V]],color:"--accent",width:1,dash:[4,4]}],legend:[["analog","--muted"],["what the ADC sees","--trace"]]});}};

/* ================= CH13 ================= */
L.pwm={title:"PWM: speed and brightness",sub:"duty cycle",html:()=>`
  <div class="ctrls">${rng("pw-d","Duty cycle",0,100,1,30)}${rng("pw-v","Supply",3.3,24,0.1,12)}
  <p class="note">The fan spins up and down with inertia, like a real motor. The LED looks dimmer because your eye averages the fast flashing.</p></div>
  <div class="readout">${ro("Average voltage","pw-avg",1)}${ro("Arduino analogWrite()","pw-aw")}${ro("Fan speed","pw-rpm")}</div>
  <div class="pwmVis"><canvas id="pw-fan" aria-label="Spinning fan"></canvas><div class="led big" id="pw-led"></div></div>
  <canvas class="plot" id="pw-cv" aria-label="PWM waveform"></canvas>`,
 init(){const self=this; let ang=0, w=0;
  BC.anim(dt=>{const cv=$("#pw-fan"); if(!cv) return; const D=+$("#pw-d").value/100, target=D*(+$("#pw-v").value/12)*14; w=BC.reduced?target:w+(target-w)*Math.min(1,dt*1.8); ang+=w*dt;
   setT("pw-rpm",Math.round(w/(2*Math.PI)*60*20)+" rpm");
   const {g,W,H}=BC.fit(cv), cx=W/2, cy=H/2, R=Math.min(W,H)/2-8; g.strokeStyle=css("--line"); g.lineWidth=2; g.beginPath(); g.arc(cx,cy,R,0,7); g.stroke();
   for(let k=0;k<5;k++){const a=ang+k*2*Math.PI/5; g.save(); g.translate(cx,cy); g.rotate(a); g.fillStyle=css(k===0?"--accent":"--trace"); g.globalAlpha=.85; g.beginPath(); g.ellipse(R*0.5,0,R*0.42,R*0.16,0.35,0,7); g.fill(); g.restore();}
   g.globalAlpha=1; g.fillStyle=css("--ink"); g.beginPath(); g.arc(cx,cy,R*0.14,0,7); g.fill();});},
 run(){const D=+$("#pw-d").value/100,V=+$("#pw-v").value; out("pw-d",(D*100).toFixed(0)+"%"); out("pw-v",V.toFixed(1)+" V");
  setT("pw-avg",(D*V).toFixed(2)+" V"); setT("pw-aw",Math.round(D*255)); const led=$("#pw-led"); led.classList.toggle("on",D>0); led.style.opacity=D>0?(0.15+0.85*D).toFixed(2):"";
  const pts=[[0,0]]; for(let k=0;k<4;k++){pts.push([k,0],[k,D>0?V:0],[k+D,D>0?V:0],[k+D,0]);} pts.push([4,0]);
  BC.plot($("#pw-cv"),{x:[0,4],y:[-V*0.08,V*1.12],xt:[[0,"0"],[1,"T"],[2,"2T"],[3,"3T"],[4,"4T"]],yt:[[0,"0"],[V,V.toFixed(1)+"V"]],series:[{pts},{pts:[[0,D*V],[4,D*V]],color:"--accent",width:1.8,dash:[6,4]}],marks:[[3.98,D*V,"average "+(D*V).toFixed(1)+" V","right"]]});}};

/* ================= CH15 ================= */
L.servo={title:"Hobby servo",sub:"pulse width sets angle",html:()=>`
  <div class="ctrls">${rng("sv-p","Pulse width",0.6,2.4,0.01,1.5)}<div class="row2 wrapRow"><button class="btn" type="button" data-pw="1">1.0 ms</button><button class="btn" type="button" data-pw="1.5">1.5 ms</button><button class="btn" type="button" data-pw="2">2.0 ms</button><button class="btn" type="button" id="sv-sweep">Sweep</button></div></div>
  <div class="readout">${ro("Commanded angle","sv-a",1)}${ro("Duty cycle (20 ms frame)","sv-d")}<p class="note" id="sv-n"></p></div>
  <canvas class="plot tall" id="sv-cv" aria-label="Servo horn and pulse train"></canvas>`,
 init(){const self=this; let cur=90, sweep=false, sp=0;
  self.$=self.$||{}; this.root=this.root;
  document.addEventListener("click",self._h=e=>{const b=e.target.closest("[data-pw]"); if(b&&$("#sv-p")){ $("#sv-p").value=b.dataset.pw; sweep=false; self.run(); BC.touchLab("servo"); }});
  BC.leave.push(()=>document.removeEventListener("click",self._h));
  $("#sv-sweep").addEventListener("click",()=>{sweep=!sweep; BC.touchLab("servo");});
  BC.anim((dt,t)=>{const cv=$("#sv-cv"); if(!cv) return; if(sweep){sp+=dt; $("#sv-p").value=(1.5+0.5*Math.sin(sp*1.6)).toFixed(3); self.run();}
   const pw=+$("#sv-p").value, tgt=clamp((pw-1)*180,0,180); const mv=600*dt*(60/0.12)/600; cur=BC.reduced?tgt:cur+clamp(tgt-cur,-mv,mv);
   const {g,W,H}=BC.fit(cv), cx=Math.min(W*0.3,170), cy=H*0.5;
   g.fillStyle=css("--sunk"); g.strokeStyle=css("--line"); g.lineWidth=1.5; g.fillRect(cx-60,cy-36,120,72); g.strokeRect(cx-60,cy-36,120,72);
   g.strokeStyle=css("--line"); g.beginPath(); g.arc(cx,cy,64,Math.PI,2*Math.PI); g.stroke();
   for(let a=0;a<=180;a+=45){const r=a*Math.PI/180; line(g,[[cx-Math.cos(r)*58,cy-Math.sin(r)*58],[cx-Math.cos(r)*66,cy-Math.sin(r)*66]]); txt(g,a+"°",cx-Math.cos(r)*80,cy-Math.sin(r)*80+4,"center","--muted",10);}
   const r=cur*Math.PI/180; g.save(); g.translate(cx,cy); g.rotate(-r+Math.PI); g.fillStyle=css("--surface"); g.strokeStyle=css("--ink"); g.lineWidth=2; g.beginPath(); g.roundRect?g.roundRect(-6,-6,62,12,6):g.rect(-6,-6,62,12); g.fill(); g.stroke(); g.restore();
   g.fillStyle=css("--accent"); g.beginPath(); g.arc(cx,cy,7,0,7); g.fill();
   const x0=cx+110, w=W-x0-14, yb=cy+30, yt=cy-30; if(w>120){ g.strokeStyle=css("--trace"); g.lineWidth=2; g.beginPath(); g.moveTo(x0,yb); const frame=w/2; for(let k=0;k<2;k++){const xs=x0+k*frame, pwx=pw/20*frame*3; g.lineTo(xs,yb); g.lineTo(xs,yt); g.lineTo(xs+pwx,yt); g.lineTo(xs+pwx,yb);} g.lineTo(x0+w,yb); g.stroke();
     txt(g,pw.toFixed(2)+" ms",x0+4,yt-8,"left","--ink",11); txt(g,"20 ms frame (pulse drawn 3× wider)",x0,yb+18,"left","--muted",10); }
  },()=>sweep);},
 run(){const pw=+$("#sv-p").value; out("sv-p",pw.toFixed(2)+" ms"); setT("sv-a",Math.round(clamp((pw-1)*180,0,180))+"°"); setT("sv-d",(pw/20*100).toFixed(1)+"%");
  note("sv-n",pw<1||pw>2?"Outside the usual 1–2 ms range. Many servos go further, but push too far and they grind against their end stops.":"The servo's own controller compares this pulse with its position sensor and drives the motor until they match.",pw<1||pw>2?"warn":"");}};

const SEQ={wave:[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]],full:[[1,1,0,0],[0,1,1,0],[0,0,1,1],[1,0,0,1]],half:[[1,0,0,0],[1,1,0,0],[0,1,0,0],[0,1,1,0],[0,0,1,0],[0,0,1,1],[0,0,0,1],[1,0,0,1]]};
L.stepper={title:"Stepper motor sequencer",sub:"energize coils in order",html:()=>`
  <div class="ctrls">${sel("st-m","Drive mode",[["wave","Wave drive (one coil)"],["full","Full step (two coils, more torque)"],["half","Half step (smoother)"]],"full")}${rng("st-s","Run speed",1,30,1,4)}
  <div class="row2 wrapRow"><button class="btn" type="button" id="st-ccw">⟲ Step</button><button class="btn" type="button" id="st-cw">Step ⟳</button><button class="btn primary" type="button" id="st-run">▶ Run</button></div></div>
  <div class="readout">${ro("Steps taken","st-n",1)}${ro("Real shaft angle (1.8° motor)","st-a")}${ro("Coils on (A B A′ B′)","st-c")}<p class="note">The drawing shows one electrical cycle as a quarter turn. A real 200-step motor needs 50 of these cycles per revolution.</p></div>
  <canvas class="plot tall" id="st-cv" aria-label="Stepper motor coils and rotor"></canvas>`,
 init(){const self=this; self.i=0; self.n=0; let run=false, acc=0, ang=0;
  const step=d=>{self.i+=d; self.n+=d; BC.beep("click"); BC.touchLab("stepper"); self.run();};
  $("#st-cw").addEventListener("click",()=>step(1)); $("#st-ccw").addEventListener("click",()=>step(-1));
  $("#st-run").addEventListener("click",e=>{run=!run; e.target.textContent=run?"■ Stop":"▶ Run"; BC.touchLab("stepper");});
  $("#st-m").addEventListener("change",()=>{self.i=0;});
  BC.anim(dt=>{const cv=$("#st-cv"); if(!cv) return; if(run){acc+=dt; const per=1/+$("#st-s").value; while(acc>per){acc-=per; self.i++; self.n++; self.run();}}
   const s=self.seq(); const pos=[[0,-1],[1,0],[0,1],[-1,0]]; let vx=0,vy=0; s.forEach((on,k)=>{if(on){vx+=pos[k][0];vy+=pos[k][1];}});
   const tgt=Math.atan2(vy,vx); let d=tgt-ang; while(d>Math.PI)d-=2*Math.PI; while(d<-Math.PI)d+=2*Math.PI; ang+=BC.reduced?d:d*Math.min(1,dt*14);
   const {g,W,H}=BC.fit(cv), cx=W/2, cy=H/2, R=Math.min(H/2-20,110);
   ["A","B","A′","B′"].forEach((nm,k)=>{const [px,py]=pos[k], x=cx+px*R, y=cy+py*R, on=s[k];
     g.save(); g.translate(x,y); g.rotate(Math.atan2(py,px)); g.fillStyle=on?css("--accent"):css("--sunk"); g.strokeStyle=css("--line"); g.lineWidth=1.5;
     if(on){g.shadowColor=css("--accent"); g.shadowBlur=16;} g.fillRect(-14,-18,28,36); g.shadowBlur=0; g.strokeRect(-14,-18,28,36);
     g.strokeStyle=on?css("--surface"):css("--muted"); for(let j=-12;j<=12;j+=6) line(g,[[-10,j],[10,j]]); g.restore();
     txt(g,nm,cx+px*(R+30),cy+py*(R+30)+4,"center",on?"--accent":"--muted",12);});
   g.strokeStyle=css("--line"); g.lineWidth=1.5; g.beginPath(); g.arc(cx,cy,R*0.55,0,7); g.stroke();
   g.save(); g.translate(cx,cy); g.rotate(ang); g.fillStyle=css("--bad"); g.beginPath(); g.moveTo(R*0.5,0); g.lineTo(0,-10); g.lineTo(0,10); g.fill(); g.fillStyle=css("--trace"); g.beginPath(); g.moveTo(-R*0.5,0); g.lineTo(0,-10); g.lineTo(0,10); g.fill(); g.restore();
   txt(g,"N",cx+Math.cos(ang)*R*0.28,cy+Math.sin(ang)*R*0.28+4,"center","--surface",11);
  },()=>run);},
 seq(){const S=SEQ[$("#st-m").value]; return S[((this.i%S.length)+S.length)%S.length];},
 run(){out("st-s",$("#st-s").value+" steps/s"); const half=$("#st-m").value==="half"; setT("st-n",this.n); setT("st-a",(this.n*(half?0.9:1.8)).toFixed(1)+"°"); setT("st-c",this.seq().join(" "));}};

/* ================= CH16 ================= */
L.db={title:"Decibel converter",sub:"voltage and power",html:()=>`
  <div class="ctrls">${rng("db-x","Gain in dB",-60,60,0.5,6)}<div class="gates" id="db-q">${[-20,-6,-3,0,3,6,10,20,40].map(v=>`<button type="button" data-v="${v}">${v>0?"+":""}${v} dB</button>`).join("")}</div></div>
  <div class="readout">${ro("Voltage ratio","db-v",1)}${ro("Power ratio","db-p")}<p class="note">Worth memorizing: +6 dB ≈ 2× voltage, +20 dB = 10× voltage, +3 dB ≈ 2× power, +10 dB = 10× power.</p></div>
  <canvas class="plot" id="db-cv" aria-label="Voltage and power ratio bars"></canvas>`,
 init(){$("#db-q").addEventListener("click",e=>{const b=e.target.closest("button"); if(!b) return; $("#db-x").value=b.dataset.v; this.run(); BC.touchLab("db");});},
 run(){const x=+$("#db-x").value; out("db-x",(x>0?"+":"")+x+" dB"); const v=Math.pow(10,x/20),p=Math.pow(10,x/10), f=r=>r<0.01||r>=1000?r.toExponential(2)+"×":(+r.toPrecision(3))+"×";
  setT("db-v",f(v)); setT("db-p",f(p));
  const pts=[],pp=[]; for(let d=-60;d<=60;d+=0.5){pts.push([d,Math.log10(Math.pow(10,d/20))]); pp.push([d,Math.log10(Math.pow(10,d/10))]);}
  BC.plot($("#db-cv"),{x:[-60,60],y:[-6,6],xt:[-60,-40,-20,0,20,40,60].map(d=>[d,d+"dB"]),yt:[[-6,"10⁻⁶"],[-3,"10⁻³"],[0,"1×"],[3,"10³"],[6,"10⁶"]],series:[{pts,color:"--trace"},{pts:pp,color:"--accent"}],marks:[[x,Math.log10(v),"V "+f(v),x>20?"right":"left","--trace"],[x,Math.log10(p),"P "+f(p),x>20?"right":"left","--accent"]],legend:[["voltage ratio","--trace"],["power ratio","--accent"]]});}};

L.tone={title:"Tone lab and hearing test",sub:"20 Hz to 20 kHz",html:()=>`
  <div class="ctrls">${rng("tn-f","Frequency",1.3,4.3,0.001,2.643)}${sel("tn-w","Waveform",[["sine","Sine (pure)"],["triangle","Triangle"],["square","Square (odd harmonics)"],["sawtooth","Sawtooth (all harmonics)"]],"sine")}${rng("tn-v","Volume",0,0.3,0.01,0.08)}
  <div class="row2 wrapRow"><button class="btn primary" type="button" id="tn-play">▶ Play</button><button class="btn" type="button" id="tn-test">How high can you hear?</button></div>
  <p class="note">Keep the volume low, especially with headphones. Young ears hear up to about 17–20 kHz, and the limit drops with age.</p></div>
  <div class="readout">${ro("Frequency","tn-fo",1)}${ro("Period","tn-T")}${ro("Wavelength in air","tn-wl")}${ro("Musical note (nearest)","tn-nt")}<p class="note" id="tn-n"></p></div>`,
 init(){const self=this; let o=null,g=null,sweep=null;
  const stop=()=>{ if(o){ try{o.stop();}catch(e){} o=null; } if(sweep){cancelAnimationFrame(sweep.raf); sweep=null;} const b=$("#tn-play"); if(b) b.textContent="▶ Play"; const t=$("#tn-test"); if(t) t.textContent="How high can you hear?"; };
  BC.leave.push(stop);
  const start=()=>{const ac=BC.audio(); if(!ac) return false; o=ac.createOscillator(); g=ac.createGain(); o.type=$("#tn-w").value; o.frequency.value=self.f; g.gain.value=+$("#tn-v").value; o.connect(g).connect(ac.destination); o.start(); $("#tn-play").textContent="■ Stop"; BC.touchLab("tone"); return true;};
  self.upd=()=>{ if(o){ o.type=$("#tn-w").value; const t=o.context.currentTime; o.frequency.setTargetAtTime(self.f,t,0.01); g.gain.setTargetAtTime(+$("#tn-v").value,t,0.02);} };
  $("#tn-play").addEventListener("click",()=>{ if(o&&!sweep){stop();} else {stop(); start();} });
  $("#tn-test").addEventListener("click",()=>{
   if(sweep){ const f=self.f; stop(); BC.S.hi.hearing=Math.max(BC.S.hi.hearing||0,Math.round(f)); BC.save(); note("tn-n",`You stopped hearing it around ${fmt(f,"Hz")}. ${f>16000?"Excellent high-frequency hearing.":f>12000?"Typical adult range.":"Try lower volume and a quiet room, or check your speakers. Many laptop speakers roll off early."}`,"good"); BC.once("hearing",10,"hearing test"); return; }
   stop(); $("#tn-w").value="sine"; $("#tn-f").value=Math.log10(8000); self.run(); if(!start()) return; $("#tn-test").textContent="I can't hear it any more"; $("#tn-play").textContent="■ Stop";
   const t0=performance.now(); sweep={raf:0}; const step=()=>{ if(!sweep) return; const k=Math.min(1,(performance.now()-t0)/18000); const f=8000*Math.pow(22000/8000,k); $("#tn-f").value=Math.log10(f); self.run(); if(k<1) sweep.raf=requestAnimationFrame(step); else { stop(); note("tn-n","You heard all the way to 22 kHz? Either superhuman ears or your speakers are making distortion you can hear.","warn"); } }; sweep.raf=requestAnimationFrame(step);});},
 run(){const f=Math.pow(10,+$("#tn-f").value); this.f=f; out("tn-f",fmt(f,"Hz")); out("tn-v",Math.round(+$("#tn-v").value/0.3*100)+"%");
  setT("tn-fo",fmt(f,"Hz")); setT("tn-T",fmt(1/f,"s")); setT("tn-wl",fmt(343/f,"m"));
  const n=Math.round(12*Math.log2(f/440)), names=["A","A♯","B","C","C♯","D","D♯","E","F","F♯","G","G♯"]; setT("tn-nt",names[((n%12)+12)%12]+(4+Math.floor((n+9)/12)));
  this.upd&&this.upd();}};

/* ================= NETWORKS ================= */
L.network={title:"Resistor network builder",sub:"series, parallel and Kirchhoff",html:()=>`
  <div class="ctrls">${sel("nw-t","Arrangement",[["series","All in series"],["parallel","All in parallel"],["mixed","R1 in series with (R2 || R3)"]],"mixed")}${rng("nw-v","Supply",1,24,0.1,12)}${rng("nw-1","R1",1,5,0.01,3)}${rng("nw-2","R2",1,5,0.01,3.301)}${rng("nw-3","R3",1,5,0.01,3.672)}</div>
  <div class="readout">${ro("Total resistance","nw-req",1)}${ro("Supply current","nw-i")}${ro("Total power","nw-p")}<p class="note" id="nw-n"></p></div>
  <canvas class="plot tall" id="nw-cv" aria-label="Resistor network with the voltage and current of each resistor"></canvas>`,
 run(){const t=$("#nw-t").value,V=+$("#nw-v").value,R=[lv("nw-1"),lv("nw-2"),lv("nw-3")]; out("nw-v",V.toFixed(1)+" V"); R.forEach((r,i)=>out("nw-"+(i+1),fmt(r,"Ω")));
  const par=(a,b)=>a*b/(a+b); let Req,v=[],c=[];
  if(t==="series"){Req=R[0]+R[1]+R[2]; const I=V/Req; c=[I,I,I]; v=R.map(r=>I*r);}
  else if(t==="parallel"){Req=1/(1/R[0]+1/R[1]+1/R[2]); v=[V,V,V]; c=R.map(r=>V/r);}
  else {const p=par(R[1],R[2]); Req=R[0]+p; const I=V/Req; const vp=I*p; v=[I*R[0],vp,vp]; c=[I,vp/R[1],vp/R[2]];}
  const I=V/Req; setT("nw-req",fmt(Req,"Ω")); setT("nw-i",fmt(I,"A")); setT("nw-p",fmt(V*I,"W"));
  note("nw-n",t==="series"?`Kirchhoff's voltage law: ${v.map(x=>x.toFixed(2)).join(" + ")} = ${V.toFixed(2)} V. The same current flows through every resistor.`:t==="parallel"?`Kirchhoff's current law: ${c.map(x=>fmt(x,"A")).join(" + ")} = ${fmt(I,"A")}. Every resistor sees the full ${V.toFixed(1)} V.`:`R1 carries all ${fmt(I,"A")}. That current splits at the node: ${fmt(c[1],"A")} through R2 and ${fmt(c[2],"A")} through R3. The smaller resistor takes the bigger share.`);
  const {g,W,H}=BC.fit($("#nw-cv")), xb=56, yt=44, yb=H-40, ym=(yt+yb)/2, Pm=Math.max(...v.map((x,i)=>x*c[i]));
  const res=(i,x1,y1,x2,y2)=>{const p=v[i]*c[i]/Pm; g.strokeStyle=p>0.66?css("--accent"):css("--ink"); g.lineWidth=2.5; if(y1===y2) zigH(g,x1,x2,y1,7); else zigV(g,x1,y1,y2,7);
    const lx=y1===y2?(x1+x2)/2:x1+12, ly=y1===y2?y1-30:(y1+y2)/2-10, al=y1===y2?"center":"left";
    txt(g,"R"+(i+1)+" "+fmt(R[i],"Ω"),lx,ly,al,"--ink",11); txt(g,v[i].toFixed(2)+" V · "+fmt(c[i],"A"),lx,ly+14,al,"--trace",11);};
  g.strokeStyle=css("--muted"); g.lineWidth=2; battV(g,xb,ym,""); txt(g,V.toFixed(1)+" V",xb+22,ym+4,"left");
  if(t==="series"){const xa=W*0.25,xm=W*0.5,xr=W-60; line(g,[[xb,ym-12],[xb,yt],[xa,yt]]); line(g,[[xa+90,yt],[xm,yt]]); line(g,[[xm+90,yt],[xr,yt],[xr,ym-30]]); line(g,[[xr,ym+30],[xr,yb],[xb,yb],[xb,ym+12]]);
    res(0,xa,yt,xa+90,yt); res(1,xm,yt,xm+90,yt); g.strokeStyle=css("--ink"); res(2,xr,ym-30,xr,ym+30);}
  else if(t==="parallel"){const xs=[W*0.38,W*0.6,W*0.82]; g.strokeStyle=css("--muted"); line(g,[[xb,ym-12],[xb,yt],[xs[2],yt]]); line(g,[[xs[2],yb],[xb,yb],[xb,ym+12]]);
    xs.forEach((x,i)=>{g.strokeStyle=css("--muted"); g.lineWidth=2; line(g,[[x,yt],[x,ym-30]]); line(g,[[x,ym+30],[x,yb]]); g.fillStyle=css("--muted"); g.beginPath(); g.arc(x,yt,3,0,7); g.fill(); res(i,x,ym-30,x,ym+30);});}
  else {const xa=W*0.24,x2=W*0.58,x3=W*0.84; g.strokeStyle=css("--muted"); line(g,[[xb,ym-12],[xb,yt],[xa,yt]]); line(g,[[xa+90,yt],[x3,yt]]); line(g,[[x3,yb],[xb,yb],[xb,ym+12]]);
    res(0,xa,yt,xa+90,yt); [x2,x3].forEach((x,k)=>{g.strokeStyle=css("--muted"); g.lineWidth=2; line(g,[[x,yt],[x,ym-30]]); line(g,[[x,ym+30],[x,yb]]); res(k+1,x,ym-30,x,ym+30);});
    g.fillStyle=css("--accent"); g.beginPath(); g.arc(x2,yt,4,0,7); g.fill();}}};

/* ================= ADDER ================= */
L.adder={title:"4-bit ripple-carry adder",sub:"XOR and AND doing arithmetic",html:()=>`
  <div class="adder" id="ad4">
   <div class="adRow"><span class="label">A</span>${[3,2,1,0].map(i=>`<button type="button" data-r="a" data-b="${i}" aria-pressed="false" aria-label="A bit ${i}">0</button>`).join("")}<b class="mono" id="ad4-a">0</b></div>
   <div class="adRow"><span class="label">B</span>${[3,2,1,0].map(i=>`<button type="button" data-r="b" data-b="${i}" aria-pressed="false" aria-label="B bit ${i}">0</button>`).join("")}<b class="mono" id="ad4-b">0</b></div>
   <div class="adRow carry"><span class="label">carry</span><span class="cy" id="ad4-c4" title="carry out"></span>${[3,2,1].map(i=>`<span class="cy" id="ad4-c${i}"></span>`).join("")}<span class="cy off"></span><span></span></div>
   <div class="adRow sum"><span class="label">sum</span><div class="led sm" id="ad4-co"></div>${[3,2,1,0].map(i=>`<div class="led sm" id="ad4-s${i}"></div>`).join("")}<b class="mono" id="ad4-s">0</b></div>
  </div>
  <div class="readout"><div class="ro hl"><div class="k">Result</div><div class="v" id="ad4-eq">0 + 0 = 0</div></div><p class="note" id="ad4-n">Each column is a full adder. Sum = A ⊕ B ⊕ carry-in. A carry ripples left whenever at least two of the three inputs are 1. Try 7 + 9, or 15 + 1 to see a carry race all the way across.</p></div>`,
 init(){const st={a:0,b:0}; const root=$("#ad4");
  const draw=()=>{let c=0; const cs=[0]; let s=0; for(let i=0;i<4;i++){const a=(st.a>>i)&1,b=(st.b>>i)&1, sum=a^b^c; c=(a&b)|(c&(a^b)); s|=sum<<i; cs.push(c);}
   $$("#ad4 button").forEach(btn=>{const on=(st[btn.dataset.r]>>+btn.dataset.b)&1; btn.setAttribute("aria-pressed",!!on); btn.textContent=on;});
   for(let i=0;i<4;i++) $("#ad4-s"+i).classList.toggle("on",!!((s>>i)&1)); $("#ad4-co").classList.toggle("on",!!cs[4]);
   for(let i=1;i<=4;i++) $("#ad4-c"+i).classList.toggle("on",!!cs[i]);
   const total=s+(cs[4]<<4); setT("ad4-a",st.a); setT("ad4-b",st.b); setT("ad4-s",total); setT("ad4-eq",`${st.a} + ${st.b} = ${total}`);
   if(cs[4]) note("ad4-n",`Carry out! The answer ${total} doesn't fit in 4 bits (max 15). In a 4-bit register you'd see ${s}. That's overflow.`,"warn");
   else note("ad4-n","Each column is a full adder. Sum = A ⊕ B ⊕ carry-in. A carry ripples left whenever at least two of the three inputs are 1. Try 7 + 9, or 15 + 1 to see a carry race all the way across.");};
  root.addEventListener("click",e=>{const b=e.target.closest("button"); if(!b) return; st[b.dataset.r]^=(1<<+b.dataset.b); BC.beep("click"); BC.touchLab("adder"); draw();});
  draw();}};

/* ================= CH18-20: schematics and packages ================= */
/* SVG schematic kit. Parts return {s: body markup, p: pins [{x,y,bx,by,k,nm}]}; (x,y) is the connection point,
   (bx,by) the body end of the lead. lead() draws a pin's lead; nets are attached by the caller. */
const SK={
  w:(pts,a="")=>`<polyline class="wire"${a} points="${pts.map(p=>p.join(",")).join(" ")}"/>`,
  t:(x,y,s,c="",anc="start")=>`<text x="${x}" y="${y}" class="${c}" text-anchor="${anc}">${esc(s)}</text>`,
  jn:(x,y,a="")=>`<circle class="jn"${a} cx="${x}" cy="${y}" r="2.6"/>`,
  nc:(x,y)=>`<path class="ncx" d="M${x-4} ${y-4}l8 8M${x+4} ${y-4}l-8 8"/>`,
  lead:(p,a="")=>`<line class="lead"${a} x1="${p.bx}" y1="${p.by}" x2="${p.x}" y2="${p.y}"/>`,
  pwr:(x,y,n,a="")=>`<g class="sym"${a}><path class="wire" d="M${x} ${y}v-10M${x-6} ${y-10}h12"/><text x="${x}" y="${y-14}" text-anchor="middle" class="pl">${esc(n)}</text></g>`,
  gnd:(x,y,a="")=>`<g class="sym"${a}><path class="wire" d="M${x} ${y}v5M${x-8} ${y+5}h16M${x-5} ${y+9}h10M${x-2} ${y+13}h4"/></g>`,
  lbl:(x,y,s,anc="start",a="")=>`<text x="${x}" y="${y-4}" text-anchor="${anc}" class="nl"${a}>${esc(s)}</text>`,
  /* two-pin parts: o "h" (pin 1 left) or "v" (pin 1 top), len between connection points */
  two(x,y,o,len,draw){ const h=o==="h", p1={x,y,k:1}, p2=h?{x:x+len,y,k:2}:{x,y:y+len,k:2}, m=len/2;
    const r=draw(h,h?x+m:x,h?y:y+m); p1.bx=h?x+m-r.half:x; p1.by=h?y:y+m-r.half; p2.bx=h?x+m+r.half:x; p2.by=h?y:y+m+r.half; return {s:r.s,p:[p1,p2]}; },
  res(x,y,o,len=50){ return SK.two(x,y,o,len,(h,cx,cy)=>({half:14,s:h?`<rect class="body" x="${cx-14}" y="${cy-5}" width="28" height="10"/>`:`<rect class="body" x="${cx-5}" y="${cy-14}" width="10" height="28"/>`})); },
  fb(x,y,o,len=40){ return SK.two(x,y,o,len,(h,cx,cy)=>({half:10,s:`<rect class="fillb" x="${cx-10}" y="${cy-4}" width="20" height="8" transform="rotate(${h?-30:60} ${cx} ${cy})"/>`})); },
  /* pol: +1 marks pin 1 positive, -1 marks pin 2 positive */
  cap(x,y,o,len=40,pol=0){ return SK.two(x,y,o,len,(h,cx,cy)=>{ const g=3, pl=(d,pos)=>pol&&!pos?(h?`<rect class="fillb" x="${cx+d-1.5}" y="${cy-9}" width="3" height="18"/>`:`<rect class="fillb" x="${cx-9}" y="${cy+d-1.5}" width="18" height="3"/>`):(h?`<path class="body" d="M${cx+d} ${cy-9}v18"/>`:`<path class="body" d="M${cx-9} ${cy+d}h18"/>`);
    const plus=pol?(()=>{const d=pol>0?-g-6:g+6; return h?SK.t(cx+d,cy-10,"+","pn","middle"):SK.t(cx-14,cy+d+3,"+","pn","middle");})():"";
    return {half:g, s:pl(-g,pol>0)+pl(g,pol<0)+plus}; }); },
  /* diode/LED, horizontal or vertical; anode at the first connection point unless rev; KiCad numbering: 1 = K, 2 = A */
  dio(x,y,o,len=40,led=false,rev=false){ const r=SK.two(x,y,o,len,(h,cx,cy)=>{ const s=rev?-1:1, tri=h?`M${cx-7*s} ${cy-7}L${cx+7*s} ${cy}L${cx-7*s} ${cy+7}Z`:`M${cx-7} ${cy-7*s}L${cx} ${cy+7*s}L${cx+7} ${cy-7*s}Z`, bar=h?`M${cx+7*s} ${cy-7}v14`:`M${cx-7} ${cy+7*s}h14`;
      const ar=led?(h?`<path class="body thin" d="M${cx} ${cy-10}l6 -8M${cx+6} ${cy-10}l6 -8M${cx+3} ${cy-17}l3 -1 0 3M${cx+9} ${cy-17}l3 -1 0 3"/>`:`<path class="body thin" d="M${cx+10} ${cy}l8 -6M${cx+10} ${cy+6}l8 -6M${cx+16} ${cy-7}l2 0 -1 3M${cx+16} ${cy-1}l2 0 -1 3"/>`):"";
      return {half:7,s:`<path class="body" d="${tri}"/><path class="body" d="${bar}"/>`+ar}; });
    const [a,b]=r.p; if(rev){a.k=1;a.nm="K";b.k=2;b.nm="A";} else {a.k=2;a.nm="A";b.k=1;b.nm="K";} return r; },
  sw(x,y,len=50){ const m=x+len/2; return {s:`<circle class="body" cx="${m-12}" cy="${y}" r="2.2"/><circle class="body" cx="${m+12}" cy="${y}" r="2.2"/><path class="body" d="M${m-12} ${y-6}h24M${m} ${y-6}v-6M${m-5} ${y-12}h10"/>`,
    p:[{x,y,bx:m-14,by:y,k:1},{x:x+len,y,bx:m+14,by:y,k:2}]}; },
  tp(x,y){ return {s:`<circle class="body" cx="${x}" cy="${y-16}" r="4"/>`,p:[{x,y,bx:x,by:y-12,k:1}]}; },
  mot(x,y,len=60){ const cy=y+len/2; return {s:`<circle class="body" cx="${x}" cy="${cy}" r="12"/>`+SK.t(x,cy+4,"M","pl","middle"),p:[{x,y,bx:x,by:cy-12,k:1},{x,y:y+len,bx:x,by:cy+12,k:2}]}; },
  /* N-channel MOSFET: gate connection at (x,y), drain 30 up, source 30 down */
  nmos(x,y){ const c=x+22, r=x+30; return {s:`<path class="body" d="M${x+16} ${y-10}v20M${c} ${y-12}v6M${c} ${y-3}v6M${c} ${y+6}v6M${c} ${y-9}H${r}M${c} ${y+9}H${r}M${c} ${y}H${r}V${y+9}"/><path class="fillb" d="M${c+1} ${y}l5 -3v6z"/>`,
    p:[{x,y,bx:x+16,by:y,k:1,nm:"G"},{x:r,y:y-30,bx:r,by:y-9,k:2,nm:"D"},{x:r,y:y+30,bx:r,by:y+9,k:3,nm:"S"}]}; },
  /* IC box; pins [{side:"l"|"r"|"t"|"b", at, k, nm}], lead length 10 */
  ic(x,y,w,h,pins){ let s=`<rect class="body" x="${x}" y="${y}" width="${w}" height="${h}"/>`; const P=pins.map(q=>{ const L=10;
      const e=q.side==="l"?{bx:x,by:y+q.at,x:x-L,y:y+q.at}:q.side==="r"?{bx:x+w,by:y+q.at,x:x+w+L,y:y+q.at}:q.side==="t"?{bx:x+q.at,by:y,x:x+q.at,y:y-L}:{bx:x+q.at,by:y+h,x:x+q.at,y:y+h+L};
      const nm=q.nm||"", ov=nm.indexOf("~"), name=nm.replace("~","");
      if(q.side==="l"){ s+=SK.t(x+4,e.y+3,name,"pn2"); s+=SK.t(x-2,e.y-3,q.k,"pn","end"); if(ov>=0) s+=`<path class="body thin" d="M${x+4+ov*5.4} ${e.y-6}h${(name.length-ov)*5.4}"/>`; }
      else if(q.side==="r"){ s+=SK.t(x+w-4,e.y+3,name,"pn2","end"); s+=SK.t(x+w+2,e.y-3,q.k,"pn"); }
      else if(q.side==="t"){ s+=SK.t(e.x,y+12,name,"pn2","middle"); s+=SK.t(e.x+3,y-3,q.k,"pn"); }
      else { s+=SK.t(e.x,y+h-5,name,"pn2","middle"); s+=SK.t(e.x+3,y+h+9,q.k,"pn"); }
      return Object.assign(e,{k:q.k,nm:name,nc:q.nc}); });
    return {s,p:P}; },
  conn(x,y,n){ return {s:`<rect class="body" x="${x}" y="${y}" width="20" height="${n*20}"/>`+Array.from({length:n},(_,i)=>SK.t(x+10,y+14+i*20,i+1,"pn","middle")).join(""),
    p:Array.from({length:n},(_,i)=>({x:x+30,y:y+10+i*20,bx:x+20,by:y+10+i*20,k:i+1}))}; }
};
const refv=(x,y,ref,val,anc="start")=>SK.t(x,y,ref,"ref",anc)+(val?SK.t(x,y+11,val,"val",anc):"");

/* ---- Trace the net ---- */
const NT=(()=>{
  const parts=[], wires=[], marks=[];
  const add=(ref,val,pt,nets,label)=>{ parts.push({ref,val,pt,nets,label}); };
  /* power entry */
  add("J1","5V IN",SK.conn(30,60,2),["VBUS","GND"],[40,40,"middle"]);
  add("FB1","600R",SK.fb(90,70,"h",40),["VBUS","VIN"],[110,46,"middle"]);
  add("C1","1u",SK.cap(160,70,"v",40),["VIN","GND"],[172,84]);
  add("U1","AP2112K-3.3",SK.ic(210,58,60,44,[{side:"l",at:12,k:1,nm:"VIN"},{side:"l",at:32,k:3,nm:"EN"},{side:"b",at:30,k:2,nm:"GND"},{side:"r",at:12,k:5,nm:"VOUT"},{side:"r",at:32,k:4,nm:"NC",nc:1}]),["VIN","VIN","GND","+3V3","nc"],[210,40]);
  add("C2","1u",SK.cap(310,70,"v",40),["+3V3","GND"],[322,84]);
  add("TP1","",SK.tp(340,70),["+3V3"],[348,56]);
  /* MCU */
  add("U2","ATtiny85",SK.ic(300,210,80,120,[{side:"t",at:40,k:8,nm:"VCC"},{side:"b",at:40,k:4,nm:"GND"},{side:"l",at:90,k:1,nm:"PB5/~RESET"},
    {side:"r",at:15,k:5,nm:"PB0"},{side:"r",at:35,k:6,nm:"PB1",nc:1},{side:"r",at:55,k:7,nm:"PB2",nc:1},{side:"r",at:75,k:2,nm:"PB3"},{side:"r",at:95,k:3,nm:"PB4",nc:1}]),
    ["+3V3","GND","NRST","PB0","nc","nc","BTN","nc"],[296,226,"end"]);
  add("C3","100n",SK.cap(250,195,"v",40),["+3V3","GND"],[237,211,"end"]);
  /* reset RC */
  add("R3","10k",SK.res(110,200,"v",50),["+3V3","NRST"],[120,222]);
  add("C4","100n",SK.cap(110,280,"v",40),["NRST","GND"],[120,296]);
  /* LED and button */
  add("R1","330",SK.res(410,225,"h",50),["PB0","LEDA"],[435,206,"middle"]);
  add("D1","RED",SK.dio(480,225,"h",40,true),["LEDA","GND"],[500,243,"middle"]);
  add("R2","10k",SK.res(470,325,"v",50),["+3V3","BTN"],[480,347]);
  add("SW1","",SK.sw(500,375,50),["BTN","GND"],[525,358,"middle"]);
  const W=(n,pts)=>wires.push({n,pts});
  W("VBUS",[[60,70],[90,70]]); W("GND",[[60,90],[70,90],[70,110]]);
  W("VIN",[[130,70],[200,70]]); W("VIN",[[200,90],[180,90],[180,70]]);
  W("+3V3",[[280,70],[400,70]]); W("+3V3",[[340,192],[340,200]]);
  W("NRST",[[110,250],[110,280],[180,280]]); W("NRST",[[290,300],[250,300]]);
  W("PB0",[[390,225],[410,225]]); W("LEDA",[[460,225],[480,225]]); W("GND",[[520,225],[550,225],[550,240]]);
  W("BTN",[[390,285],[420,285]]); W("BTN",[[420,375],[500,375]]); W("GND",[[550,375],[570,375],[570,385]]);
  const M=(n,kind,x,y,s)=>marks.push({n,kind,x,y,s});
  [[160,70],[180,70]].forEach(p=>M("VIN","jn",...p)); [[310,70],[340,70]].forEach(p=>M("+3V3","jn",...p)); M("NRST","jn",110,280); M("BTN","jn",470,375);
  [[70,110],[160,110],[240,112],[310,110],[250,235],[340,340],[110,320],[550,240],[570,385]].forEach(p=>M("GND","gnd",...p));
  [[400,70],[340,192],[250,195],[110,200],[470,325]].forEach(p=>M("+3V3","pwr",...p,"+3V3"));
  M("VBUS","lbl",64,70,"VBUS"); M("NRST","lbl",140,280,"NRST"); M("NRST","lbl",254,300,"NRST"); M("BTN","lbl",394,285,"BTN"); M("BTN","lbl",424,375,"BTN");
  const NAME={VBUS:"VBUS",VIN:"unnamed",GND:"GND","+3V3":"+3V3",NRST:"NRST",PB0:"unnamed",LEDA:"unnamed",BTN:"BTN"};
  const WHY={VBUS:"Named by a local label. The ferrite bead FB1 separates it from the regulator input.",
    VIN:"No label, so the netlist names it after one of its pins. EN is tied to VIN, which keeps U1 always on.",
    GND:"Nine GND symbols and almost no wire between them. Power symbols with the same name are one net.",
    "+3V3":"Five +3V3 power symbols join U1's output to every part that needs it. TP1 gives a probe somewhere to land.",
    NRST:"Two NRST labels join the reset RC to pin 1 with no wire across the page.",
    PB0:"U2 pin 5 drives the LED through R1. No label, so the netlist names it after a pin.",
    LEDA:"Between R1 and the LED anode. D1 is numbered the KiCad way: pin 1 is the cathode, pin 2 the anode.",
    BTN:"R2 holds BTN at 3.3 V; pressing SW1 pulls it to 0 V. A label on each side joins U2 pin 2 to the button."};
  return {parts,wires,marks,NAME,WHY};
})();
L.nettrace={title:"Trace the net",sub:"click any pin or wire",html:()=>{
  let s="", pins=[], i=0;
  NT.parts.forEach(pt=>{ const P=pt.pt; s+=`<g class="part">${P.s}${refv(pt.label[0],pt.label[1],pt.ref,pt.val,pt.label[2])}</g>`;
    P.p.forEach((p,j)=>{ const n=pt.nets[j], name=p.nm?`${pt.ref} pin ${p.k}, ${p.nm}`:`${pt.ref} pin ${p.k}`;
      pins.push(`<g class="pin" data-net="${n}" data-m="${pt.ref}.${p.k}" data-nm="${esc(p.nm||"")}" role="button" tabindex="${i++?-1:0}" aria-label="${esc(name)}">${SK.lead(p)}<circle class="hit" cx="${p.x}" cy="${p.y}" r="7"/>${n==="nc"?SK.nc(p.x,p.y):""}</g>`); }); });
  NT.wires.forEach(w=>{ s+=SK.w(w.pts,` data-net="${w.n}"`)+`<polyline class="hitw" data-net="${w.n}" points="${w.pts.map(p=>p.join(",")).join(" ")}"/>`; });
  NT.marks.forEach(m=>{ const a=` data-net="${m.n}"`; s+=m.kind==="jn"?SK.jn(m.x,m.y,a):m.kind==="gnd"?SK.gnd(m.x,m.y,a):m.kind==="pwr"?SK.pwr(m.x,m.y,m.s,a):SK.lbl(m.x,m.y,m.s,"start",a); });
  return `<div class="schWrap"><svg class="sch" id="nt-sv" viewBox="0 0 620 405" role="group" aria-label="Schematic: 3.3 V regulator, ATtiny85 with decoupling, reset RC, LED and button. Use arrow keys to move between pins.">${s}${pins.join("")}</svg></div>
  <div class="readout four">${ro("Net","nt-n",1)}${ro("Pins","nt-c")}<div class="ro wide"><div class="k">Members</div><div class="v sm" id="nt-m">—</div></div><p class="note" id="nt-w">Click a pin or a wire. Arrow keys step through the pins; Enter selects.</p></div>`;},
 init(root){ const sv=$("#nt-sv",root), pins=$$(".pin",sv);
  const pick=(n,el)=>{ $$("[data-net]",sv).forEach(e=>e.classList.toggle("on",n==="nc"?e===el:e.dataset.net===n));
   if(n==="nc"){ setT("nt-n","not connected"); setT("nt-c","1"); setT("nt-m",el.dataset.m+` (${el.dataset.nm})`); note("nt-w","A no-connect flag: the pin is left open on purpose, so ERC doesn't report it."); return; }
   const mem=pins.filter(p=>p.dataset.net===n).map(p=>p.dataset.m+(p.dataset.nm?` (${p.dataset.nm})`:""));
   setT("nt-n",NT.NAME[n]); setT("nt-c",mem.length); setT("nt-m",mem.join(", ")); note("nt-w",NT.WHY[n]); };
  const choose=(el,n)=>{ pick(n,el); BC.beep("click"); BC.touchLab("nettrace"); };
  sv.addEventListener("click",e=>{ const el=e.target.closest("[data-net]"); if(!el) return; if(el.classList.contains("pin")){ pins.forEach(p=>p.tabIndex=-1); el.tabIndex=0; } choose(el,el.dataset.net); });
  sv.addEventListener("keydown",e=>{ const el=e.target.closest(".pin"); if(!el) return; let i=pins.indexOf(el);
   if(e.key==="Enter"||e.key===" "){ e.preventDefault(); choose(el,el.dataset.net); return; }
   const d={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[e.key]; let j=d?(i+d+pins.length)%pins.length:e.key==="Home"?0:e.key==="End"?pins.length-1:-1;
   if(e.key==="Escape"){ $$("[data-net]",sv).forEach(x=>x.classList.remove("on")); setT("nt-n","—"); setT("nt-c","—"); setT("nt-m","—"); return; }
   if(j<0) return; e.preventDefault(); pins.forEach(p=>p.tabIndex=-1); pins[j].tabIndex=0; pins[j].focus(); choose(pins[j],pins[j].dataset.net); });
 }};

/* ---- Find the mistake ---- */
/* each puzzle: title, draw() -> svg markup with target groups, targets {id:[label, box, why]}, bad: id */
const MZ=(()=>{
  const tg=(id,label,box,inner)=>`<g class="tg" data-t="${id}" role="button" tabindex="0" aria-label="${esc(label)}">${inner}<rect class="hitb" x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}"/></g>`;
  const part=(P,ref,val,lx,ly,anc)=>P.s+P.p.map(p=>SK.lead(p)).join("")+refv(lx,ly,ref,val,anc);
  const ncs=P=>P.p.filter(p=>p.nc).map(p=>SK.nc(p.x,p.y)).join("");
  const mcu=(x,y,w,h,pins)=>SK.ic(x,y,w,h,pins);
  const Z=[];
  /* 1: LED with no series resistor */
  Z.push({title:"Status LED",bad:"D1",draw(){ const U=mcu(100,50,80,100,[{side:"t",at:40,k:1,nm:"VDD"},{side:"b",at:40,k:8,nm:"VSS"},{side:"r",at:60,k:5,nm:"PA5"}]), C=SK.cap(40,40,"v",40), D=SK.dio(260,110,"h",40,true);
    return SK.pwr(140,30,"+3V3")+SK.w([[140,30],[140,40]])+SK.gnd(140,160)+SK.pwr(40,40,"+3V3")+SK.gnd(40,80)+SK.gnd(330,125)+SK.w([[300,110],[330,110],[330,125]])
     +tg("U1","U1, microcontroller",[95,45,90,110],part(U,"U1","MCU",182,46))
     +tg("C1","C1, 100 nF capacitor",[26,35,50,50],part(C,"C1","100n",52,56))
     +tg("D1","D1, red LED, wired from PA5 to ground",[190,92,115,32],SK.w([[190,110],[260,110]])+part(D,"D1","RED",280,135,"middle")); },
   why:{U1:"U1 has its supply, its ground and its decoupling capacitor.",C1:"C1 is U1's 100 nF decoupling capacitor.",
    D1:"D1 has no series resistor. The LED clamps PA5 near its forward voltage and the current is limited only by the pin's driver, far beyond its rating. Put 220 to 470 Ω between PA5 and the anode."}});
  /* 2: electrolytic reversed */
  Z.push({title:"12 V to 5 V",bad:"C1",draw(){ const J=SK.conn(20,60,2), C1=SK.cap(110,70,"v",40,-1), U=SK.ic(170,55,60,40,[{side:"l",at:15,k:1,nm:"IN"},{side:"b",at:30,k:2,nm:"GND"},{side:"r",at:15,k:3,nm:"OUT"}]), C2=SK.cap(290,70,"v",40);
    return SK.w([[50,90],[60,90],[60,120]])+SK.gnd(60,120)+SK.w([[50,70],[160,70]])+SK.jn(110,70)+SK.gnd(110,110)+SK.gnd(200,105)+SK.w([[240,70],[330,70]])+SK.jn(290,70)+SK.gnd(290,110)+SK.pwr(330,70,"+5V")
     +tg("J1","J1, 12 V input connector",[15,50,40,70],part(J,"J1","12V IN",30,38,"middle"))
     +tg("C1","C1, 100 µF electrolytic capacitor",[96,72,60,40],part(C1,"C1","100u 25V",122,86))
     +tg("U1","U1, 7805 regulator",[160,40,80,72],part(U,"U1","7805",170,36))
     +tg("C2","C2, 100 nF ceramic capacitor",[276,72,56,40],part(C2,"C2","100n",302,86)); },
   why:{J1:"J1 brings in 12 V on pin 1 and ground on pin 2.",U1:"The 7805 pinout is input 1, ground 2, output 3, as drawn.",C2:"C2 is ceramic, so it has no polarity.",
    C1:"C1's + terminal is on the GND side, so 12 V sits across it backwards. A reversed electrolytic leaks, heats up and can vent. Turn it round: + to the 12 V net."}});
  /* 3: I2C without pull-ups */
  Z.push({title:"Sensor on I²C",bad:"BUS",draw(){ const U1=mcu(40,50,70,100,[{side:"t",at:35,k:1,nm:"VDD"},{side:"b",at:35,k:2,nm:"VSS"},{side:"r",at:35,k:7,nm:"SDA"},{side:"r",at:65,k:6,nm:"SCL"}]),
      U2=mcu(240,50,70,100,[{side:"t",at:35,k:4,nm:"VDD"},{side:"b",at:35,k:1,nm:"GND"},{side:"l",at:35,k:3,nm:"SDA"},{side:"l",at:65,k:2,nm:"SCL"}]), C=SK.cap(345,40,"v",40);
    return SK.pwr(75,30,"+3V3")+SK.w([[75,30],[75,40]])+SK.gnd(75,160)+SK.pwr(275,30,"+3V3")+SK.w([[275,30],[275,40]])+SK.gnd(275,160)+SK.pwr(345,40,"+3V3")+SK.gnd(345,80)
     +tg("U1","U1, microcontroller",[35,45,80,110],part(U1,"U1","MCU",40,172))
     +tg("U2","U2, sensor",[235,45,80,110],part(U2,"U2","SENSOR",240,172))
     +tg("C1","C1, 100 nF capacitor",[330,35,46,50],part(C,"C1","100n",352,94))
     +tg("BUS","SDA and SCL lines between U1 and U2",[120,70,110,55],SK.w([[120,85],[230,85]])+SK.w([[120,115],[230,115]])+SK.lbl(150,85,"SDA")+SK.lbl(150,115,"SCL")); },
   why:{U1:"U1's SDA and SCL pins go to the matching pins on the sensor.",U2:"U2 has power, ground and its own decoupling capacitor.",C1:"C1 decouples U2's supply pin.",
    BUS:"I²C pins are open-drain: they pull a line low but never drive it high. With no pull-up resistors to 3.3 V the lines never return high and nothing communicates. Add one resistor per line, 2.2 to 10 kΩ."}});
  /* 4: MOSFET gate floating */
  Z.push({title:"Motor driver",bad:"Q1",draw(){ const U=mcu(30,90,60,80,[{side:"t",at:30,k:1,nm:"VDD"},{side:"b",at:30,k:2,nm:"VSS"},{side:"r",at:40,k:9,nm:"PB1"}]), R=SK.res(130,130,"h",50), Q=SK.nmos(200,130), Mo=SK.mot(230,40,60), D=SK.dio(290,40,"v",60,false,true);
    return SK.pwr(60,80,"+3V3")+SK.gnd(60,180)+SK.w([[100,130],[130,130]])+SK.w([[180,130],[200,130]])+SK.gnd(230,160)+SK.pwr(230,26,"+12V")+SK.w([[230,26],[230,40]])+SK.w([[290,40],[290,32],[230,32]])+SK.jn(230,32)+SK.w([[290,100],[230,100]])+SK.jn(230,100)
     +tg("U1","U1, microcontroller",[25,85,80,90],part(U,"U1","MCU",34,186))
     +tg("R1","R1, 100 Ω gate resistor",[125,112,60,30],part(R,"R1","100",155,109,"middle"))
     +tg("Q1","Q1, N-channel MOSFET",[195,100,48,62],part(Q,"Q1","AO3400",244,146))
     +tg("M1","M1, DC motor",[212,42,36,56],part(Mo,"M1","",206,74,"end"))
     +tg("D1","D1, diode across the motor",[276,42,30,56],part(D,"D1","1N5819",302,66)); },
   why:{U1:"U1's PB1 drives the gate through R1.",R1:"R1, 100 Ω, limits the gate charging current and damps ringing.",M1:"The motor sits between +12 V and the drain: a normal low-side switch.",
    D1:"D1 is the flyback diode, cathode to +12 V. It carries the motor current when Q1 turns off.",
    Q1:"Nothing holds Q1's gate low. While the MCU starts up its pin is a high-impedance input, so the gate floats: the motor can twitch, or Q1 can sit half on and overheat. Add 10 to 100 kΩ from gate to source."}});
  /* 5: LDO without output capacitor */
  Z.push({title:"3.3 V rail",bad:"U1",draw(){ const J=SK.conn(15,50,2), C1=SK.cap(95,60,"v",40), U1=SK.ic(140,45,60,40,[{side:"l",at:15,k:1,nm:"VIN"},{side:"l",at:30,k:3,nm:"EN"},{side:"b",at:30,k:2,nm:"GND"},{side:"r",at:15,k:5,nm:"VOUT"}]),
      U2=mcu(250,110,70,60,[{side:"t",at:35,k:1,nm:"VDD"},{side:"b",at:35,k:8,nm:"VSS"}]), C2=SK.cap(345,100,"v",40);
    return SK.w([[45,80],[55,80],[55,105]])+SK.gnd(55,105)+SK.w([[45,60],[130,60]])+SK.jn(95,60)+SK.gnd(95,100)+SK.w([[130,75],[115,75],[115,60]])+SK.jn(115,60)+SK.gnd(170,95)+SK.w([[210,60],[250,60]])+SK.pwr(250,60,"+3V3")
     +SK.pwr(285,90,"+3V3")+SK.w([[285,90],[285,100]])+SK.gnd(285,180)+SK.pwr(345,100,"+3V3")+SK.gnd(345,140)
     +tg("J1","J1, 5 V input connector",[10,40,40,60],part(J,"J1","5V IN",25,32,"middle"))
     +tg("C1","C1, 1 µF capacitor",[80,62,30,40],part(C1,"C1","1u",88,76,"end"))
     +tg("U1","U1, AP2112K-3.3 regulator",[125,30,95,70],part(U1,"U1","AP2112K-3.3",140,30))
     +tg("U2","U2, microcontroller",[245,105,80,70],part(U2,"U2","MCU",240,128,"end"))
     +tg("C2","C2, 100 nF capacitor",[330,102,46,40],part(C2,"C2","100n",352,116)); },
   why:{J1:"J1 brings in 5 V.",C1:"C1 is U1's input capacitor.",U2:"U2 runs from +3V3 and has C2 as its decoupling capacitor.",C2:"C2 decouples U2's supply pin.",
    U1:"U1's output has no capacitor. An LDO needs one close to VOUT, often at least 1 µF, to be stable, and oscillates without it. C2 is U2's decoupling capacitor, not the regulator's output capacitor."}});
  /* 6: reverse-protection diode backwards */
  Z.push({title:"Battery input",bad:"D1",draw(){ const J=SK.conn(15,60,2), D=SK.dio(80,70,"h",40,false,true), C1=SK.cap(145,70,"v",40), U=SK.ic(180,55,60,40,[{side:"l",at:15,k:1,nm:"IN"},{side:"b",at:30,k:2,nm:"GND"},{side:"r",at:15,k:3,nm:"OUT"}]), C2=SK.cap(290,70,"v",40);
    return SK.w([[45,70],[80,70]])+SK.w([[45,90],[55,90],[55,115]])+SK.gnd(55,115)+SK.w([[120,70],[170,70]])+SK.jn(145,70)+SK.gnd(145,110)+SK.gnd(210,105)+SK.w([[250,70],[330,70]])+SK.jn(290,70)+SK.gnd(290,110)+SK.pwr(330,70,"+5V")
     +tg("J1","J1, 9 V battery connector",[10,50,40,70],part(J,"J1","9V BAT",25,40,"middle"))
     +tg("D1","D1, series diode",[74,50,52,34],part(D,"D1","1N5819",100,52,"middle"))
     +tg("C1","C1, 10 µF capacitor",[130,72,40,40],part(C1,"C1","10u",137,86,"end"))
     +tg("U1","U1, 7805 regulator",[170,40,80,72],part(U,"U1","7805",180,36))
     +tg("C2","C2, 100 nF capacitor",[276,72,56,40],part(C2,"C2","100n",302,86)); },
   why:{J1:"J1 brings the battery in: + on pin 1, − on pin 2.",C1:"C1 is the regulator's input capacitor.",U1:"The 7805 pinout is input 1, ground 2, output 3, as drawn.",C2:"C2 is the regulator's output capacitor.",
    D1:"D1's cathode bar faces the battery, so it blocks the correct polarity and conducts when the battery goes in backwards: the opposite of its job. Turn it round, anode to the battery."}});
  /* 7: four-way junction */
  Z.push({title:"ADC input filter",bad:"JN",draw(){ const R1=SK.res(150,30,"v",50), R2=SK.res(150,120,"v",50), C=SK.cap(90,100,"v",40), U=mcu(260,40,80,100,[{side:"t",at:40,k:1,nm:"VDD"},{side:"b",at:40,k:8,nm:"VSS"},{side:"l",at:60,k:3,nm:"ADC0"}]);
    return SK.w([[100,30],[150,30]])+SK.lbl(102,30,"VBAT")+SK.w([[150,80],[150,120]])+SK.w([[150,100],[90,100]])+SK.w([[150,100],[250,100]])+SK.gnd(150,170)+SK.gnd(90,140)+SK.pwr(300,30,"+3V3")+SK.gnd(300,150)
     +tg("R1","R1, 100 kΩ resistor",[136,36,40,50],part(R1,"R1","100k",160,52))
     +tg("R2","R2, 33 kΩ resistor",[136,124,40,44],part(R2,"R2","33k",160,142))
     +tg("C1","C1, 100 nF capacitor",[74,104,32,34],part(C,"C1","100n",78,116,"end"))
     +tg("JN","the junction where four wires meet",[140,90,20,20],SK.jn(150,100))
     +tg("U1","U1, microcontroller",[255,35,90,110],part(U,"U1","MCU",345,36)); },
   why:{R1:"R1 and R2 divide VBAT down into the ADC's range.",R2:"R2 is the bottom of the divider.",C1:"C1 filters the divider output and gives the ADC's sampling capacitor a charge to draw on.",U1:"ADC0 reads the divided voltage.",
    JN:"Four wires meet at one dot. KiCad treats it as a connection, but if the dot is lost in a printout or a zoomed-out PDF it reads as two wires crossing. Move C1's wire a grid step down so the node becomes two T-junctions."}});
  /* 8: label typo splits the net */
  Z.push({title:"Sensor supply",bad:"LBL",draw(){ const C1=SK.cap(32,55,"v",40), U1=SK.ic(80,40,60,40,[{side:"l",at:15,k:1,nm:"VIN"},{side:"l",at:30,k:3,nm:"EN"},{side:"b",at:30,k:2,nm:"GND"},{side:"r",at:15,k:5,nm:"VOUT"}]), C2=SK.cap(180,55,"v",40),
      U2=SK.ic(270,100,70,60,[{side:"l",at:20,k:1,nm:"VS"},{side:"r",at:20,k:2,nm:"VOUT"},{side:"b",at:35,k:3,nm:"GND"}]), C3=SK.cap(230,120,"v",40);
    return SK.w([[8,55],[70,55]])+SK.lbl(8,55,"VBUS")+SK.jn(32,55)+SK.gnd(32,95)+SK.w([[70,70],[62,70],[62,55]])+SK.jn(62,55)+SK.gnd(110,90)+SK.w([[150,55],[230,55]])+SK.jn(180,55)+SK.gnd(180,95)+SK.lbl(192,55,"VCC_3V3")
     +SK.w([[200,120],[260,120]])+SK.jn(230,120)+SK.gnd(230,160)+SK.gnd(305,170)+SK.w([[350,120],[378,120]])+SK.lbl(352,120,"TEMP")
     +tg("C1","C1, 1 µF capacitor",[22,57,34,40],part(C1,"C1","1u",42,72))
     +tg("U1","U1, AP2112K-3.3 regulator",[66,14,90,82],part(U1,"U1","AP2112K-3.3",80,22))
     +tg("C2","C2, 1 µF capacitor",[166,57,34,40],part(C2,"C2","1u",190,72))
     +tg("LBL","the VCC label on U2's supply",[198,104,32,20],SK.lbl(202,120,"VCC"))
     +tg("C3","C3, 100 nF capacitor",[216,124,48,36],part(C3,"C3","100n",242,140))
     +tg("U2","U2, temperature sensor",[265,95,80,75],part(U2,"U2","TEMP SENSOR",272,186)); },
   why:{C1:"C1 is the regulator's input capacitor.",U1:"EN is tied to VIN, and both capacitors are in place.",C2:"C2 is the regulator's output capacitor.",C3:"C3 decouples U2's supply pin.",U2:"U2's pins are wired as its datasheet expects.",
    LBL:"U2's supply label reads VCC; the regulator's output is VCC_3V3. Labels connect only by exact name, so U2 has no power. ERC reports its power-input pin as not driven."}});
  return Z;
})();
L.mistake={title:"Find the mistake",sub:"one wrong part per schematic",html:()=>`
  <div class="ctrls"><div class="gates" id="mz-nav" role="group" aria-label="Puzzles">${MZ.map((z,i)=>`<button type="button" data-i="${i}" aria-pressed="${i===0}" aria-label="Puzzle ${i+1}, ${esc(z.title)}">${i+1}</button>`).join("")}</div>
  <p class="mzTask"><b id="mz-h"></b> One thing on this schematic is wrong. Click it.</p></div>
  <div class="readout">${ro("Puzzles solved","mz-f",1)}${ro("This one","mz-s")}</div>
  <div class="schWrap"><svg class="sch mz" id="mz-sv" viewBox="0 0 380 200" role="group" aria-label="Schematic puzzle. Each part is a button."></svg></div>
  <p class="note" id="mz-n" aria-live="polite"></p>
  <div class="row2"><button class="btn" type="button" id="mz-next">Next puzzle →</button></div>`,
 init(root){ let cur=0, done=false;
  const solved=i=>!!BC.S.xpOnce["mistake-"+i];
  const stat=()=>{ setT("mz-f",`${MZ.filter((_,i)=>solved(i)).length} of ${MZ.length}`); setT("mz-s",done?"found":solved(cur)?"solved before":"not yet");
   $$("#mz-nav button",root).forEach(b=>{ const i=+b.dataset.i; b.setAttribute("aria-pressed",i===cur); b.classList.toggle("right",solved(i)); b.textContent=(solved(i)?"✓ ":"")+(i+1); }); };
  const show=i=>{ cur=i; done=false; const z=MZ[i]; $("#mz-sv",root).innerHTML=z.draw(); setT("mz-h",`${i+1}. ${z.title}.`); note("mz-n",""); stat(); };
  const hit=t=>{ const z=MZ[cur], g=t.dataset.t; BC.touchLab("mistake");
   if(g===z.bad){ done=true; t.classList.add("ok"); note("mz-n",z.why[g],"good"); BC.beep("good"); BC.once("mistake-"+cur,10,"mistake found"); stat(); }
   else { t.classList.add("miss"); note("mz-n",`${t.getAttribute("aria-label").split(",")[0]} is fine. ${z.why[g]}`,"bad"); BC.beep("bad"); } };
  const sv=$("#mz-sv",root);
  sv.addEventListener("click",e=>{ const t=e.target.closest(".tg"); if(t) hit(t); });
  sv.addEventListener("keydown",e=>{ const t=e.target.closest(".tg"); if(t&&(e.key==="Enter"||e.key===" ")){ e.preventDefault(); hit(t); } });
  $("#mz-nav",root).addEventListener("click",e=>{ const b=e.target.closest("button"); if(b) show(+b.dataset.i); });
  $("#mz-next",root).addEventListener("click",()=>{ const nx=MZ.findIndex((_,i)=>i>cur&&!solved(i)), any=MZ.findIndex((_,i)=>!solved(i)); show(nx>=0?nx:any>=0?any:(cur+1)%MZ.length); });
  show(Math.max(0,MZ.findIndex((_,i)=>!solved(i))));
 }};

/* ---- True size ---- */
/* typical body sizes (mm). k: chip | gull | qfn | bga | dip | axial. Pads follow a simple illustrative rule, not a library footprint. */
const PKG=[
 {id:"0402",name:"0402 (1005 metric)",k:"chip",L:1.0,W:0.5,t:0.25,pins:2,fp:"R_0402_1005Metric",why:"Common in phones and dense modules. Hard to solder by hand without magnification."},
 {id:"0603",name:"0603 (1608 metric)",k:"chip",L:1.6,W:0.8,t:0.3,pins:2,fp:"R_0603_1608Metric",why:"The everyday passive on small boards. Hand-solderable with a fine tip."},
 {id:"0805",name:"0805 (2012 metric)",k:"chip",L:2.0,W:1.25,t:0.4,pins:2,fp:"R_0805_2012Metric",why:"Easy to hand-solder. Higher power and voltage ratings than 0603."},
 {id:"1206",name:"1206 (3216 metric)",k:"chip",L:3.2,W:1.6,t:0.5,pins:2,fp:"R_1206_3216Metric",why:"Used where power or voltage matters; a 1206 resistor is typically rated ¼ W."},
 {id:"sot23",name:"SOT-23",k:"gull",L:2.9,W:1.3,span:2.4,lw:0.4,foot:0.45,p:0.95,pins:3,rows:[[-0.95,0.95],[0]],fp:"SOT-23",why:"Pins 1 and 2 on one side, 1.9 mm apart; pin 3 opposite. The package is standard, the pinout is not: check it for every MPN."},
 {id:"soic8",name:"SOIC-8",k:"gull",L:4.9,W:3.9,span:6.0,lw:0.42,foot:0.8,p:1.27,pins:8,fp:"SOIC-8_3.9x4.9mm_P1.27mm",why:"The easiest IC package to hand-solder. A wider 5.3 mm body version also exists, with a different footprint."},
 {id:"tssop16",name:"TSSOP-16",k:"gull",L:5.0,W:4.4,span:6.4,lw:0.25,foot:0.6,p:0.65,pins:16,fp:"TSSOP-16_4.4x5mm_P0.65mm",why:"Drag-solderable with flux, but bridges between pins are common."},
 {id:"qfn32",name:"QFN-32",k:"qfn",L:5,W:5,p:0.5,tl:0.4,tw:0.25,ep:3.45,pins:32,fp:"QFN-32-1EP_5x5mm_P0.5mm_EP3.45x3.45mm",why:"Terminals sit under the body edge, and the exposed pad in the middle must be soldered, usually to GND. The ESP32-C6 chip is a 5 × 5 mm QFN too."},
 {id:"bga100",name:"LFBGA-100",k:"bga",L:10,W:10,p:0.8,n:10,ball:0.45,pins:100,fp:"LFBGA-100_10x10mm_Layout10x10_P0.8mm",why:"Balls on a grid under the whole body. Inner balls need vias and usually more board layers, and only X-ray can inspect the joints."},
 {id:"dip8",name:"DIP-8",k:"dip",L:9.27,W:6.35,p:2.54,row:7.62,pins:8,fp:"DIP-8_W7.62mm",why:"Through-hole, 2.54 mm (0.1 in) pitch with rows 7.62 mm apart: fits breadboards and perfboard."},
 {id:"axial",name:"Axial resistor, ¼ W",k:"axial",L:6.3,W:2.5,p:10.16,pins:2,fp:"R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal",why:"A through-hole resistor laid flat. The footprint's holes sit 10.16 mm apart, well beyond the body."}
];
/* geometry in mm, centred on 0,0: body rect, leads [x,y,w,h] or balls [x,y,r], pads, pin 1 position, half extents */
function pkgGeo(k){
  const g={body:[-k.L/2,-k.W/2,k.L,k.W],leads:[],balls:[],pads:[],holes:[],pin1:null,pitch:null};
  if(k.k==="chip"){ [-1,1].forEach(s=>{ g.leads.push([s<0?-k.L/2:k.L/2-k.t,-k.W/2,k.t,k.W]); const a=k.L/2-k.t-0.05, b=k.L/2+0.3; g.pads.push([s<0?-b:a,-(k.W+0.1)/2,b-a,k.W+0.1]); }); }
  else if(k.k==="gull"){ const rows=k.rows||(()=>{const n=k.pins/2; const xs=Array.from({length:n},(_,i)=>(i-(n-1)/2)*k.p); return [xs,xs];})();
    const pw=Math.min(k.lw+0.15,k.p-0.2);
    rows.forEach((xs,r)=>xs.forEach(x=>{ const s=r?-1:1; g.leads.push([x-k.lw/2,s>0?k.W/2:-k.span/2,k.lw,k.span/2-k.W/2]); const a=k.span/2-k.foot-0.15, b=k.span/2+0.35; g.pads.push([x-pw/2,s>0?a:-b,pw,b-a]); }));
    g.pin1=[rows[0][0],k.W/2-0.45]; g.pitch=k.rows?[rows[0][0],rows[1][0]]:[rows[0][0],rows[0][1]]; }
  else if(k.k==="qfn"){ const n=k.pins/4, xs=Array.from({length:n},(_,i)=>(i-(n-1)/2)*k.p), h=k.L/2, pw=k.tw+0.03;
    xs.forEach(x=>{ [[x,h-k.tl/2,k.tw,k.tl],[x,-h+k.tl/2,k.tw,k.tl],[h-k.tl/2,x,k.tl,k.tw],[-h+k.tl/2,x,k.tl,k.tw]].forEach(([cx,cy,w,hh])=>g.leads.push([cx-w/2,cy-hh/2,w,hh])); });
    xs.forEach(x=>{ const a=h-k.tl-0.05, b=h+0.3, L=b-a; [[x-pw/2,a,pw,L],[x-pw/2,-b,pw,L],[a,x-pw/2,L,pw],[-b,x-pw/2,L,pw]].forEach(r=>g.pads.push(r)); });
    g.pads.push([-k.ep/2,-k.ep/2,k.ep,k.ep]); g.leads.push([-k.ep/2,-k.ep/2,k.ep,k.ep]); g.pin1=[-h+0.6,-h+0.6]; g.pitch=[xs[0],xs[1]]; g.hidden=true; }
  else if(k.k==="bga"){ for(let i=0;i<k.n;i++) for(let j=0;j<k.n;j++){ const x=(i-(k.n-1)/2)*k.p, y=(j-(k.n-1)/2)*k.p; g.balls.push([x,y,k.ball/2]); g.pads.push([x,y,0.2]); }
    g.pin1=[-k.L/2+0.6,-k.W/2+0.6]; const x0=-(k.n-1)/2*k.p; g.pitch=[x0,x0+k.p]; g.hidden=true; }
  else if(k.k==="dip"){ const n=k.pins/2; for(let i=0;i<n;i++){ const x=(i-(n-1)/2)*k.p; [1,-1].forEach(s=>{ g.leads.push([x-0.25,s>0?k.W/2:-k.row/2,0.5,k.row/2-k.W/2]); g.pads.push([x,s*k.row/2,0.8]); g.holes.push([x,s*k.row/2,0.4]); }); }
    g.pin1=[-(n-1)/2*k.p,k.W/2-1]; g.sq=[-(n-1)/2*k.p,k.row/2]; g.pitch=[-(n-1)/2*k.p,-(n-1)/2*k.p+k.p]; }
  else if(k.k==="axial"){ [-1,1].forEach(s=>{ g.leads.push([s<0?-k.p/2:k.L/2,-0.3,k.p/2-k.L/2,0.6]); g.pads.push([s*k.p/2,0,0.8]); g.holes.push([s*k.p/2,0,0.4]); }); g.round=true; }
  const xs=[], ys=[]; const box=r=>{xs.push(r[0],r[0]+r[2]); ys.push(r[1],r[1]+r[3]);};
  box(g.body); g.leads.forEach(box); g.pads.forEach(p=>p.length===4?box(p):box([p[0]-p[2],p[1]-p[2],2*p[2],2*p[2]])); g.balls.forEach(b=>box([b[0]-b[2],b[1]-b[2],2*b[2],2*b[2]]));
  g.ext=[Math.max(-Math.min(...xs),Math.max(...xs)),Math.max(-Math.min(...ys),Math.max(...ys))];
  const r2=v=>Math.ceil(v*20-1e-9)/20; g.court=[r2(g.ext[0]+0.25),r2(g.ext[1]+0.25)];   /* courtyard: 0.25 mm around everything, on a 0.05 mm grid */
  return g;
}
const pR=(r,c,a="")=>`<rect class="${c}" x="${+r[0].toFixed(3)}" y="${+r[1].toFixed(3)}" width="${+r[2].toFixed(3)}" height="${+r[3].toFixed(3)}"${a}/>`;
const pC=(c,cl)=>`<circle class="${cl}" cx="${+c[0].toFixed(3)}" cy="${+c[1].toFixed(3)}" r="${c[2]}"/>`;
/* package at true size: body and leads only */
function pkgTrue(k,g){ return (g.hidden?"":g.leads.map(r=>pR(r,"pkl")).join(""))+(k.k==="axial"?`<rect class="pkb" x="${-k.L/2}" y="${-k.W/2}" width="${k.L}" height="${k.W}" rx="${k.W/2}"/>`:pR(g.body,"pkb")); }
function pkgBig(k,g){ const pads=g.pads.map(p=>p.length===4?pR(p,"pad"):pC(p,"pad")).join("")+(g.sq?pR([g.sq[0]-0.8,g.sq[1]-0.8,1.6,1.6],"pad"):"")+g.holes.map(h=>pC(h,"hole")).join("");
  const body=k.k==="axial"?`<rect class="pbo" x="${-k.L/2}" y="${-k.W/2}" width="${k.L}" height="${k.W}" rx="${k.W/2}"/>`:pR(g.body,"pbo");
  const leads=g.leads.map(r=>pR(r,g.hidden?"plh":"plo")).join("")+g.balls.map(b=>pC(b,"plh")).join("");
  const court=pR([-g.court[0],-g.court[1],2*g.court[0],2*g.court[1]],"crt");
  const p1=g.pin1?`<circle class="p1" cx="${g.pin1[0]}" cy="${g.pin1[1]}" r="${Math.max(0.12,Math.min(k.L,k.W)/18)}"/>`:"";
  return court+pads+leads+body+p1; }
function pkgDims(k,g,fs){ const e=g.ext, y=e[1]+fs*1.6, x=e[0]+fs*0.8, t=(x,y,s,a="middle",rot)=>`<text class="dim" x="${x}" y="${y}" text-anchor="${a}" font-size="${fs}"${rot?` transform="rotate(-90 ${x} ${y})"`:""}>${s}</text>`;
  let s=`<path class="dl" d="M${-k.L/2} ${y}H${k.L/2}M${-k.L/2} ${y-fs*.4}v${fs*.8}M${k.L/2} ${y-fs*.4}v${fs*.8}"/>`+t(0,y+fs*1.2,`${k.L} mm`);
  s+=`<path class="dl" d="M${x} ${-k.W/2}V${k.W/2}M${x-fs*.4} ${-k.W/2}h${fs*.8}M${x-fs*.4} ${k.W/2}h${fs*.8}"/>`+t(x+fs*1.3,0,`${k.W} mm`,"middle",1);
  if(g.pitch){ const [a,b]=g.pitch, py=-(e[1]+fs*0.9); s+=`<path class="dl acc" d="M${a} ${py}H${b}M${a} ${py-fs*.4}v${fs*.8}M${b} ${py-fs*.4}v${fs*.8}"/>`+t((a+b)/2,py-fs*0.7,`${k.p} mm`,"middle"); }
  return s; }
L.truesize={title:"True size",sub:"packages at 1 : 1 on your screen",html:()=>{ const pm=BC.S.pxmm||96/25.4;
  return `<div class="ctrls"><div class="pkgPick" id="ts-p" role="group" aria-label="Package">${PKG.map((k,i)=>`<button type="button" data-i="${i}" aria-pressed="${i===1}"><svg aria-hidden="true"></svg><span>${esc(k.name.split(" (")[0])}</span></button>`).join("")}</div>
   <details class="cal" id="ts-cal"><summary>Calibrate to your screen</summary>
    <p class="note">Hold a bank card against the screen and drag the slider until the outline matches its long edge, 85.6 mm.</p>
    ${rng("ts-k","Screen scale",2,9,0.01,pm.toFixed(2))}
    <div class="cardBox" id="ts-cb"><svg id="ts-card" aria-label="Outline of a bank card, 85.6 by 54 millimetres, at the current scale"></svg></div>
    <div class="row2"><div class="ctrl"><label for="ts-d"><span>Or enter the screen diagonal, in inches</span></label><input type="text" inputmode="decimal" id="ts-d" autocomplete="off" placeholder="13.3"></div><button class="btn" type="button" id="ts-da">Apply</button><button class="btn" type="button" id="ts-r">Reset</button></div>
    <p class="note" id="ts-cn" aria-live="polite"></p></details></div>
  <div class="readout">${ro("Package","ts-n",1)}${ro("Body, typical","ts-b")}${ro("Pitch","ts-pi")}${ro("Pins","ts-c")}${ro("Body area","ts-a")}<div class="ro wide"><div class="k">KiCad footprint</div><div class="v sm" id="ts-fp">—</div></div><p class="note" id="ts-w"></p></div>
  <div class="tsTrue"><div class="label" id="ts-tl">actual size</div><svg id="ts-ts" role="img"></svg></div>
  <div class="tsBig"><svg id="ts-big" role="img"></svg><p class="label tsKey"><i class="kp"></i>pads (land pattern) <i class="kb"></i>part body <i class="kc"></i>courtyard <i class="k1"></i>pin 1</p></div>`;},
 init(root){ const self=this; self.i=1;
  $("#ts-p",root).addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return; self.i=+b.dataset.i; $$("#ts-p button",root).forEach(x=>x.setAttribute("aria-pressed",x===b)); BC.beep("click"); BC.touchLab("truesize"); self.run(); });
  const setK=(v,msg)=>{ v=clamp(v,2,9); $("#ts-k").value=v.toFixed(2); BC.S.pxmm=v; BC.save(); note("ts-cn",msg,"good"); self.run(); };
  $("#ts-da",root).addEventListener("click",()=>{ const d=parseFloat($("#ts-d").value.replace(",",".")); if(!(d>=3&&d<=100)){ note("ts-cn","Enter the diagonal in inches, between 3 and 100.","bad"); return; }
   const v=Math.hypot(screen.width,screen.height)/(d*25.4); if(v<2||v>9){ note("ts-cn","That diagonal gives an unlikely scale for this screen. Use the card instead.","bad"); return; } setK(v,`Set from a ${d} in diagonal.`); BC.touchLab("truesize"); });
  $("#ts-r",root).addEventListener("click",()=>{ delete BC.S.pxmm; BC.save(); $("#ts-k").value=(96/25.4).toFixed(2); note("ts-cn","Back to the browser's nominal 96 px per inch."); self.run(); });
  $("#ts-k",root).addEventListener("input",()=>{ BC.S.pxmm=+$("#ts-k").value; BC.save(); note("ts-cn",""); });
 },
 run(){ const k=PKG[this.i??1], g=pkgGeo(k), pm=+$("#ts-k").value, cal=!!BC.S.pxmm;
  out("ts-k",pm.toFixed(2)+" px/mm"+(cal?"":" (nominal)"));
  /* picker thumbnails at true size */
  $$("#ts-p button svg").forEach((s,i)=>{ const q=PKG[i], gg=pkgGeo(q), e=gg.ext; s.setAttribute("viewBox",`${-e[0]} ${-e[1]} ${2*e[0]} ${2*e[1]}`); s.setAttribute("width",(2*e[0]*pm).toFixed(1)); s.setAttribute("height",(2*e[1]*pm).toFixed(1)); s.innerHTML=pkgTrue(q,gg); });
  /* true size next to a ruler */
  const host=$("#ts-ts").parentElement, avail=Math.max(120,host.clientWidth-4), e=g.ext, n=Math.max(5,Math.min(40,Math.floor(avail/pm)-1)), Wmm=n+1, Hmm=2*e[1]+8;
  let rl=""; for(let i=0;i<=n;i++){ const h=i%10===0?3:i%5===0?2:1.2; rl+=`<path class="tick" d="M${i} ${Hmm-4}v${-h}"/>`; if(i%10===0) rl+=`<text class="rt" x="${i}" y="${Hmm-0.3}" text-anchor="middle">${i}</text>`; }
  const tsv=$("#ts-ts"); tsv.setAttribute("viewBox",`-0.5 0 ${Wmm} ${Hmm}`); tsv.setAttribute("width",(Wmm*pm).toFixed(1)); tsv.setAttribute("height",(Hmm*pm).toFixed(1));
  tsv.setAttribute("aria-label",`${k.name} at actual size above a millimetre ruler`);
  tsv.innerHTML=`<path class="tick" d="M0 ${Hmm-4}H${n}"/>${rl}<g transform="translate(${e[0]} ${e[1]+1})">${pkgTrue(k,g)}</g>`;
  setT("ts-tl",cal?"actual size":"actual size, if your screen is at 96 px per inch; calibrate below");
  /* magnified footprint */
  const c=g.court, fs=Math.max(c[0],c[1])/8, pad=fs*3.4, vb=[-c[0]-pad,-c[1]-pad,2*c[0]+2*pad,2*c[1]+2*pad];
  const big=$("#ts-big"); big.setAttribute("viewBox",vb.join(" ")); big.setAttribute("aria-label",`${k.name} footprint, magnified: pads, body outline, courtyard and dimensions`);
  big.innerHTML=pkgBig(k,g)+pkgDims(k,g,fs);
  setT("ts-n",k.name); setT("ts-b",`${k.L} × ${k.W} mm`); setT("ts-pi",k.k==="chip"?"— (two terminals)":k.k==="axial"?`${k.p} mm between holes`:`${k.p} mm`); setT("ts-c",k.k==="qfn"?`${k.pins} + exposed pad`:String(k.pins));
  setT("ts-a",`${+(k.L*k.W).toPrecision(3)} mm²`); setT("ts-fp",k.fp); note("ts-w",k.why);
  /* calibration card: landscape if it fits, else portrait */
  const cb=$("#ts-cb"), cw=cb.clientWidth||300, land=85.6*pm+4<=cw, cwmm=land?85.6:53.98, chmm=land?53.98:85.6, card=$("#ts-card");
  card.setAttribute("viewBox",`-0.3 -0.3 ${cwmm+0.6} ${chmm+0.6}`); card.setAttribute("width",((cwmm+0.6)*pm).toFixed(1)); card.setAttribute("height",((chmm+0.6)*pm).toFixed(1));
  card.innerHTML=`<rect class="card" x="0" y="0" width="${cwmm}" height="${chmm}" rx="3.18"/><text class="rt" x="${cwmm/2}" y="${chmm/2}" text-anchor="middle">85.6 × 54 mm</text>`;
 }};

/* ================= CH21-22: layout and manufacturing ================= */
/* PCB kit, millimetres. A shape is {l: layer, k: kind, ...}. Layers: F.Cu, B.Cu, F.Mask (openings), F.Paste, F.Silkscreen, Edge.Cuts, Drill, NPTH, Rats.
   Kinds: r rect {x,y,w,h,rx}, c circle {x,y,r}, t track {pts,w}, p filled path {d} (even-odd), o outline rect {x,y,w,h,rx}, s text {x,y,s,z,a}. */
const PB=(()=>{
  const n=v=>+(+v).toFixed(3);
  const pad=(x,y,w,h,o={})=>{ const r=[{l:"F.Cu",k:"r",x:x-w/2,y:y-h/2,w,h,rx:o.rx??Math.min(w,h)*0.2}];
    if(!o.nomask) r.push({l:"F.Mask",k:"r",x:x-w/2-0.05,y:y-h/2-0.05,w:w+0.1,h:h+0.1,rx:o.rx??Math.min(w,h)*0.2});
    if(!o.nopaste) r.push({l:"F.Paste",k:"r",x:x-w/2,y:y-h/2,w,h,rx:o.rx??Math.min(w,h)*0.2}); return r; };
  const tht=(x,y,d,dr,sq)=>{ const cu=l=>sq?{l,k:"r",x:x-d/2,y:y-d/2,w:d,h:d,rx:0}:{l,k:"c",x,y,r:d/2};
    return [cu("F.Cu"),cu("B.Cu"),Object.assign(cu("F.Mask"),sq?{x:x-d/2-0.05,y:y-d/2-0.05,w:d+0.1,h:d+0.1}:{r:d/2+0.05}),{l:"Drill",k:"c",x,y,r:dr/2}]; };
  const via=(x,y,d=0.6,dr=0.3)=>[{l:"F.Cu",k:"c",x,y,r:d/2},{l:"B.Cu",k:"c",x,y,r:d/2},{l:"Drill",k:"c",x,y,r:dr/2}];
  const trk=(pts,w,l="F.Cu")=>({l,k:"t",pts,w});
  const txt=(x,y,s,z=0.8,a="middle")=>({l:"F.Silkscreen",k:"s",x,y,s,z,a});
  const sl=(pts,w=0.15)=>({l:"F.Silkscreen",k:"t",pts,w});
  const circ=(cx,cy,r)=>`M${n(cx-r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2*r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2*r)} 0Z`;
  const rectP=(x,y,w,h)=>`M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`;
  /* one shape as SVG; cls on the element */
  const geo=(s,cls)=>{ const c=cls?` class="${cls}"`:"";
    if(s.k==="r") return `<rect${c} x="${n(s.x)}" y="${n(s.y)}" width="${n(s.w)}" height="${n(s.h)}"${s.rx?` rx="${n(s.rx)}"`:""}/>`;
    if(s.k==="c") return `<circle${c} cx="${n(s.x)}" cy="${n(s.y)}" r="${n(s.r)}"/>`;
    if(s.k==="t") return `<polyline${c} points="${s.pts.map(p=>n(p[0])+","+n(p[1])).join(" ")}" stroke-width="${n(s.w)}"/>`;
    if(s.k==="p") return `<path${c} d="${s.d}" fill-rule="evenodd"/>`;
    if(s.k==="o") return `<rect${c} x="${n(s.x)}" y="${n(s.y)}" width="${n(s.w)}" height="${n(s.h)}"${s.rx?` rx="${n(s.rx)}"`:""}/>`;
    if(s.k==="s") return `<text${c} x="${n(s.x)}" y="${n(s.y)}" font-size="${n(s.z)}" text-anchor="${s.a}">${esc(s.s)}</text>`;
    return ""; };
  const of=(S,l)=>S.filter(s=>s.l===l);
  /* the board as made: green mask over copper, exposed copper only inside mask openings */
  const stack=(S,id)=>{ const ed=of(S,"Edge.Cuts")[0], open=of(S,"F.Mask");
    const cu=of(S,"F.Cu"), fill=s=>s.k==="t"?"pcT":"pcF";
    return `<defs><clipPath id="${id}-m">${open.map(s=>geo(s)).join("")}</clipPath></defs>`
      +geo(Object.assign({},ed,{k:"r"}),"pcBoard")
      +of(S,"B.Cu").map(s=>geo(s,"pcB "+fill(s))).join("")
      +open.map(s=>geo(s,"pcOpen")).join("")
      +cu.map(s=>geo(s,"pcCu "+fill(s))).join("")
      +`<g clip-path="url(#${id}-m)">${cu.map(s=>geo(s,"pcLit "+fill(s))).join("")}</g>`
      +of(S,"Drill").concat(of(S,"NPTH")).map(s=>geo(s,"pcHole")).join("")
      +of(S,"F.Silkscreen").map(s=>geo(s,"pcSilk "+(s.k==="t"?"pcT":"pcF"))).join("")
      +geo(ed,"pcEdge")+of(S,"Rats").map(s=>geo(s,"pcRat")).join(""); };
  /* one layer as its Gerber or drill file shows it: dark shapes on a light sheet */
  const layer=(S,l)=>{ const ls=l==="Drill"?of(S,"Drill").concat(of(S,"NPTH")):of(S,l);
    return ls.map(s=>geo(s,"gbS "+(s.k==="t"?"pcT":s.k==="o"?"gbO":"pcF"))).join(""); };
  return {pad,tht,via,trk,txt,sl,circ,rectP,geo,stack,layer};
})();

/* ---- Trace width (IPC-2221) ---- */
const ipcArea=(I,dT,k)=>Math.pow(I/(k*Math.pow(dT,0.44)),1/0.725);   /* mil² */
L.tracew={title:"Trace width",sub:"IPC-2221 calculator, drawn to scale",html:()=>`
  <div class="ctrls">${rng("tw-i","Current",0.1,10,0.05,1)}${rng("tw-t","Allowed temperature rise",5,60,1,10)}
   <div class="row2">${sel("tw-oz","Copper weight",[["0.5","0.5 oz (18 µm)"],["1","1 oz (35 µm)"],["2","2 oz (70 µm)"]],"1")}${sel("tw-l","Layer",[["ext","Outer (F.Cu, B.Cu)"],["int","Inner"]],"ext")}</div>
   <p class="note">IPC-2221 is a curve fit to old, conservative charts. The newer IPC-2152 also counts board thickness and nearby planes, and finds inner layers run about as cool as outer ones.</p></div>
  <div class="readout">${ro("Width","tw-w",1)}${ro("Width, mil","tw-m")}${ro("Cross-section","tw-a")}${ro("Resistance per 10 mm","tw-r")}${ro("Heat per 10 mm","tw-p")}<p class="note" id="tw-n"></p></div>
  <div class="twWrap"><svg id="tw-sv" role="img"></svg><p class="label" id="tw-g">grid 0.1 mm · heavy lines 1 mm · upper trace 0.2 mm for comparison</p></div>`,
 run(){ const I=+$("#tw-i").value, dT=+$("#tw-t").value, oz=+$("#tw-oz").value, ext=$("#tw-l").value==="ext", k=ext?0.048:0.024;
  out("tw-i",fmt(I,"A")); out("tw-t",dT+" °C");
  const A=ipcArea(I,dT,k), mil=A/(1.378*oz), w=mil*0.0254, t=0.035*oz, R=1.72e-8*0.01/(w*1e-3*t*1e-3);
  setT("tw-w",`${+w.toPrecision(3)} mm`); setT("tw-m",`${+mil.toPrecision(3)} mil`); setT("tw-a",`${+A.toPrecision(3)} mil² · ${+(w*t).toPrecision(2)} mm²`);
  setT("tw-r",fmt(R,"Ω")); setT("tw-p",fmt(I*I*R,"W"));
  note("tw-n",w<0.127?`Narrower than a typical 0.127 mm fab minimum. Draw it at 0.15 to 0.2 mm; heat is not the limit here.`:w>3?`Over 3 mm: use a copper pour, a heavier copper weight or the same net on two layers.`:`Round up to a tidy value. The trace's resistance drops ${fmt(I*R,"V")} per 10 mm at this current.`,w<0.127||w>3?"warn":"");
  /* to scale: viewBox in mm */
  const H=Math.max(1.2,Math.ceil((w+0.9)*10)/10), W=+(H*2.6).toFixed(1), y0=H*0.62, sv=$("#tw-sv");
  const st=W>40?10:1; let g=""; for(let i=0;i<=Math.round(W*10);i+=st) g+=`<path class="${i%10?"twg":"twG"}" d="M${(i/10).toFixed(1)} 0V${H}"/>`;
  for(let j=0;j<=Math.round(H*10);j+=st) g+=`<path class="${j%10?"twg":"twG"}" d="M0 ${(j/10).toFixed(1)}H${W}"/>`;
  const ry=Math.min(0.35,y0-w/2-0.15), fs=H*0.075;
  g+=`<rect class="twCu" x="0" y="${(ry-0.1).toFixed(3)}" width="${W}" height="0.2"/>`;
  g+=`<rect class="twCu hl" x="0" y="${(y0-w/2).toFixed(4)}" width="${W}" height="${w.toFixed(4)}"/>`;
  const dx=W*0.9; g+=`<path class="twD" d="M${dx} ${(y0-w/2).toFixed(4)}V${(y0+w/2).toFixed(4)}M${dx-fs*0.5} ${(y0-w/2).toFixed(4)}h${fs}M${dx-fs*0.5} ${(y0+w/2).toFixed(4)}h${fs}"/>`;
  g+=`<text class="twT" x="${(dx-fs*0.8).toFixed(3)}" y="${(y0+w/2+fs*1.3).toFixed(3)}" font-size="${fs.toFixed(3)}" text-anchor="end">${+w.toPrecision(3)} mm</text>`;
  setT("tw-g",st>1?"grid 1 mm · upper trace 0.2 mm for comparison":"grid 0.1 mm · heavy lines 1 mm · upper trace 0.2 mm for comparison");
  sv.setAttribute("viewBox",`0 0 ${W} ${H}`); sv.setAttribute("aria-label",`A ${+w.toPrecision(3)} mm trace drawn to scale on a 0.1 mm grid, next to a 0.2 mm signal trace`); sv.innerHTML=g; }};

/* ---- Decoupling loop ---- */
/* Geometry in mm. The loop is unrolled into a rectangle: path length ℓ on the top layer by height h to the plane.
   By the image method a trace over a plane has half the inductance of a two-wire rectangle ℓ × 2h (rectangular-loop formula, round-wire equivalent radius). */
const DC=(()=>{
  const mu=4e-7*Math.PI, ash=Math.asinh;
  const rectL=(a,b,r)=>{ a*=1e-3; b*=1e-3; r*=1e-3; const d=Math.hypot(a,b); return mu/Math.PI*(a*Math.log(2*a/r)+b*Math.log(2*b/r)+2*d-a*ash(a/b)-b*ash(b/a)-2*(a+b)); };
  const IC={x0:11.8,x1:15.6,y0:1.2,y1:8.8}, PX=10.95, PW=1.5, PH=0.6, PY=[2.46,3.73,5.0,6.27,7.54], VDD=[PX,3.73], GND=[PX,5.0], GV=[9.6,5.0];
  const CAP={L:1.0,pw:0.55,ph:0.62}, VIA=0.3, CLR=0.15, R_EQ=0.075;   /* 0402 pads at ±0.5 mm; via pad radius; clearance; 0.3 mm trace */
  const dir=r=>[[1,0],[0,-1],[-1,0],[0,1]][r];   /* where pad 1 points: right, up, left, down */
  const pads=s=>{ const d=dir(s.r), h=CAP.L/2; return [[s.cx+d[0]*h,s.cy+d[1]*h],[s.cx-d[0]*h,s.cy-d[1]*h]]; };
  const padBox=(p,r)=>{ const w=r%2?CAP.ph:CAP.pw, h=r%2?CAP.pw:CAP.ph; return [p[0]-w/2,p[1]-h/2,w,h]; };
  const boxD=(b,x,y)=>{ const dx=Math.max(b[0]-x,0,x-(b[0]+b[2])), dy=Math.max(b[1]-y,0,y-(b[1]+b[3])); return Math.hypot(dx,dy); };
  const boxBox=(a,b)=>Math.hypot(Math.max(0,a[0]-(b[0]+b[2]),b[0]-(a[0]+a[2])),Math.max(0,a[1]-(b[1]+b[3]),b[1]-(a[1]+a[3])));
  const fixedBoxes=PY.map(y=>[PX-PW/2,y-PH/2,PW,PH]).concat([[IC.x0,IC.y0,IC.x1-IC.x0,IC.y1-IC.y0],[GV[0],GND[1]-0.15,PX-PW/2-GV[0],0.3]]);
  const ok=s=>{ const P=pads(s), B=P.map(p=>padBox(p,s.r)), v=[s.vx,s.vy];
    if(B.some(b=>b[0]<0.4||b[1]<0.4||b[0]+b[2]>15.6||b[1]+b[3]>9.6)) return false;
    if(v[0]<0.7||v[1]<0.7||v[0]>15.3||v[1]>9.3) return false;
    if(B.some(b=>fixedBoxes.some(f=>boxBox(b,f)<CLR)||boxD(b,GV[0],GV[1])<VIA+CLR)) return false;
    if(fixedBoxes.some(f=>boxD(f,v[0],v[1])<VIA+CLR)||Math.hypot(v[0]-GV[0],v[1]-GV[1])<2*VIA+CLR) return false;
    if(B.some(b=>boxD(b,v[0],v[1])<VIA+0.1)) return false;
    return true; };
  /* loop path on the top layer: VDD pad → C pad 1 → C pad 2 → C via, then IC GND via → GND pad → (die) → VDD pad */
  const calc=(s,h)=>{ const P=pads(s), d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
    const segs=[d(VDD,P[0]),CAP.L,d(P[1],[s.vx,s.vy]),d(GV,GND),d(GND,VDD)], l=segs.reduce((a,b)=>a+b,0);
    const Lh=rectL(l,2*h,R_EQ)/2; return {P,l,A:l*h,L:Lh}; };
  const PRE={good:{cx:9.2,cy:3.73,r:0,vx:7.9,vy:3.73,t:"At the pin"},start:{cx:3.2,cy:8.2,r:0,vx:2.0,vy:8.2,t:"Far away"},via:{cx:9.2,cy:3.73,r:0,vx:2.5,vy:1.5,t:"Via far from the pad"}};
  return {IC,PX,PW,PH,PY,VDD,GND,GV,CAP,VIA,pads,padBox,ok,calc,PRE};
})();
L.decoup={title:"Decoupling loop",sub:"drag the capacitor and its via",html:()=>`
  <div class="ctrls"><div class="gates" id="dc-pre" role="group" aria-label="Placements">${Object.entries(DC.PRE).map(([k,p])=>`<button type="button" data-p="${k}" aria-pressed="${k==="start"}">${esc(p.t)}</button>`).join("")}</div>
   <div class="row2">${sel("dc-h","Stackup",[["0.2","4-layer, 0.2 mm"],["1.6","2-layer, 1.6 mm"]],"0.2")}${sel("dc-f","Frequency",[["1e7","10 MHz"],["1e8","100 MHz"],["5e8","500 MHz"]],"1e8")}</div>
   <div class="row2"><button class="btn" type="button" id="dc-rot">Rotate C1</button></div>
   <p class="note">Drag C1 or its via. With the keyboard: Tab to either, arrow keys move 0.1 mm, Shift + arrow 0.5 mm, R rotates C1. Goal: on the 4-layer stackup, get the loop under 2.5 nH.</p></div>
  <div class="readout">${ro("Loop inductance ≈","dc-l",1)}${ro("Impedance ≈","dc-z")}${ro("Loop path ℓ","dc-p")}${ro("Loop area ℓ × h ≈","dc-a")}${ro("Resonance with 100 nF ≈","dc-r")}<p class="note" id="dc-n" aria-live="polite"></p></div>
  <div class="dcWrap"><svg class="dcSv" id="dc-sv" viewBox="0 0 16 10" aria-label="Top view of an IC's power pins, capacitor C1, its ground via and the IC's ground via"></svg>
   <p class="label">Approximate. Red marks the path ℓ on the top layer; the return runs in the plane directly beneath it. The loop is unrolled into a rectangle ℓ by h, the height down to the plane. By the image method that has half the inductance of a two-wire rectangle ℓ × 2h; a 0.3 mm trace counts as a 0.075 mm round wire. The capacitor's own construction, the IC package and current spreading are ignored, so compare placements rather than trusting the absolute value.</p></div>`,
 init(root){ const self=this, sv=$("#dc-sv",root), I=DC.IC, n=v=>+v.toFixed(3);
  self.s=Object.assign({},DC.PRE.start);
  /* static: grid, IC, pads, IC ground via and its trace */
  let st=`<rect class="pcBoard" x="0" y="0" width="16" height="10"/>`;
  for(let i=1;i<16;i++) st+=`<path class="dcGrid" d="M${i} 0V10"/>`; for(let j=1;j<10;j++) st+=`<path class="dcGrid" d="M0 ${j}H16"/>`;
  st+=`<rect class="dcChip" x="${I.x0}" y="${I.y0}" width="${n(I.x1-I.x0)}" height="${n(I.y1-I.y0)}"/><text class="dcTx" x="${n((I.x0+I.x1)/2)}" y="5.2" font-size="0.7" text-anchor="middle">U1</text>`;
  st+=`<polyline class="dcTr" points="${DC.GND[0]},${DC.GND[1]} ${DC.GV[0]},${DC.GV[1]}" stroke-width="0.3"/>`;
  DC.PY.forEach((y,i)=>{ st+=`<rect class="dcPad" x="${n(DC.PX-DC.PW/2)}" y="${n(y-DC.PH/2)}" width="${DC.PW}" height="${DC.PH}" rx="0.1"/>`; });
  st+=`<text class="dcTx" x="${n(I.x0+0.25)}" y="${n(3.73+0.22)}" font-size="0.55">VDD</text><text class="dcTx" x="${n(I.x0+0.25)}" y="${n(5.0+0.22)}" font-size="0.55">GND</text>`;
  st+=`<circle class="dcVia" cx="${DC.GV[0]}" cy="${DC.GV[1]}" r="${DC.VIA}"/><circle class="pcHole" cx="${DC.GV[0]}" cy="${DC.GV[1]}" r="0.15"/>`;
  st+=`<path class="dcScale" d="M0.6 9.4h1M0.6 9.25v0.3M1.6 9.25v0.3"/><text class="dcTx" x="1.1" y="9.1" font-size="0.5" text-anchor="middle">1 mm</text>`;
  sv.innerHTML=st+`<g id="dc-dyn"></g>
   <g class="dcDrag" id="dc-c" tabindex="0" role="button" aria-roledescription="draggable" aria-label="Capacitor C1, 100 nF. Arrow keys move it, R rotates."></g>
   <g class="dcDrag" id="dc-v" tabindex="0" role="button" aria-roledescription="draggable" aria-label="C1's ground via. Arrow keys move it."></g>`;
  const cG=$("#dc-c",sv), vG=$("#dc-v",sv);
  const pt=e=>{ const m=sv.getScreenCTM(); if(!m) return null; const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse()); return [p.x,p.y]; };
  const snap=v=>Math.round(v*10)/10;
  const tryS=ns=>{ if(DC.ok(ns)){ self.s=ns; $$("#dc-pre button",root).forEach(b=>b.setAttribute("aria-pressed","false")); self.run(); BC.touchLab("decoup"); return true; } return false; };
  let drag=null;
  const down=(e,what)=>{ if(e.button>0) return; const p=pt(e); if(!p) return; e.preventDefault(); (what==="c"?cG:vG).focus({preventScroll:true});
    drag={what,id:e.pointerId,ox:p[0]-(what==="c"?self.s.cx:self.s.vx),oy:p[1]-(what==="c"?self.s.cy:self.s.vy)}; try{ e.currentTarget.setPointerCapture(e.pointerId); }catch(_){} };
  const move=e=>{ if(!drag||e.pointerId!==drag.id) return; const p=pt(e); if(!p) return; const x=snap(p[0]-drag.ox), y=snap(p[1]-drag.oy), s=self.s;
    if(drag.what==="c"){ if(x!==s.cx||y!==s.cy){ if(!tryS(Object.assign({},s,{cx:x,cy:y}))&&!tryS(Object.assign({},s,{cx:x}))) tryS(Object.assign({},s,{cy:y})); } }
    else if(x!==s.vx||y!==s.vy){ if(!tryS(Object.assign({},s,{vx:x,vy:y}))&&!tryS(Object.assign({},s,{vx:x}))) tryS(Object.assign({},s,{vy:y})); } };
  const up=e=>{ if(drag&&e.pointerId===drag.id) drag=null; };
  [[cG,"c"],[vG,"v"]].forEach(([g,w])=>{ g.addEventListener("pointerdown",e=>down(e,w)); g.addEventListener("pointermove",move); g.addEventListener("pointerup",up); g.addEventListener("pointercancel",up);
   g.addEventListener("keydown",e=>{ const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key], s=self.s;
    if(w==="c"&&(e.key==="r"||e.key==="R")){ e.preventDefault(); rot(); return; }
    if(!d) return; e.preventDefault(); const k=e.shiftKey?0.5:0.1, r=v=>Math.round(v*10)/10;
    const ns=w==="c"?Object.assign({},s,{cx:r(s.cx+d[0]*k),cy:r(s.cy+d[1]*k)}):Object.assign({},s,{vx:r(s.vx+d[0]*k),vy:r(s.vy+d[1]*k)});
    if(!tryS(ns)) note("dc-n","Blocked: parts and vias need about 0.15 mm of clearance, and C1 stays off the IC.","warn"); }); });
  const rot=()=>{ const s=self.s; for(let i=1;i<4;i++){ if(tryS(Object.assign({},s,{r:(s.r+i)%4}))){ BC.beep("click"); return; } } note("dc-n","No room to rotate here. Move C1 first.","warn"); };
  $("#dc-rot",root).addEventListener("click",rot);
  $("#dc-pre",root).addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return; self.s=Object.assign({},DC.PRE[b.dataset.p]); $$("#dc-pre button",root).forEach(x=>x.setAttribute("aria-pressed",x===b)); BC.beep("click"); BC.touchLab("decoup"); self.run(); });
 },
 run(){ const sv=$("#dc-sv"); if(!sv||!this.s) return; const s=this.s, h=+$("#dc-h").value, f=+$("#dc-f").value, c=DC.calc(s,h), n=v=>+v.toFixed(3);
  const P=c.P, B=P.map(p=>DC.padBox(p,s.r)), body=s.r%2?[s.cx-0.28,s.cy-0.5,0.56,1.0]:[s.cx-0.5,s.cy-0.28,1.0,0.56];
  /* traces and the loop path */
  const pl=a=>a.map(p=>n(p[0])+","+n(p[1])).join(" ");
  $("#dc-dyn",sv).innerHTML=`<polyline class="dcTr" points="${DC.VDD[0]},${DC.VDD[1]} ${n(P[0][0])},${n(P[0][1])}" stroke-width="0.3"/><polyline class="dcTr" points="${n(P[1][0])},${n(P[1][1])} ${s.vx},${s.vy}" stroke-width="0.3"/>
   <polyline class="dcLoop" points="${pl([DC.VDD,P[0],P[1],[s.vx,s.vy]])}"/><polyline class="dcLoop" points="${pl([DC.GV,DC.GND,DC.VDD])}"/>`;
  $("#dc-c",sv).innerHTML=`<rect class="dcHit" x="${n(body[0]-0.45)}" y="${n(body[1]-0.45)}" width="${n(body[2]+0.9)}" height="${n(body[3]+0.9)}"/>`+B.map(b=>`<rect class="dcPad" x="${n(b[0])}" y="${n(b[1])}" width="${n(b[2])}" height="${n(b[3])}" rx="0.06"/>`).join("")
   +`<rect class="dcBody" x="${n(body[0]+(s.r%2?0.06:0.2))}" y="${n(body[1]+(s.r%2?0.2:0.06))}" width="${n(body[2]-(s.r%2?0.12:0.4))}" height="${n(body[3]-(s.r%2?0.4:0.12))}"/>`
   +`<text class="dcTx" x="${n(P[0][0])}" y="${n(P[0][1]+0.17)}" font-size="0.45" text-anchor="middle">1</text><text class="dcTx" x="${n(s.cx+(s.r%2?0.75:0))}" y="${n(s.cy+(s.r%2?0.2:-0.55))}" font-size="0.55" text-anchor="${s.r%2?"start":"middle"}">C1</text>`;
  $("#dc-v",sv).innerHTML=`<circle class="dcHit" cx="${s.vx}" cy="${s.vy}" r="0.75"/><circle class="dcVia" cx="${s.vx}" cy="${s.vy}" r="${DC.VIA}"/><circle class="pcHole" cx="${s.vx}" cy="${s.vy}" r="0.15"/>`;
  const Lh=c.L, Z=2*Math.PI*f*Lh, fr=1/(2*Math.PI*Math.sqrt(Lh*100e-9)), Xc=1/(2*Math.PI*f*100e-9);
  setT("dc-l",fmt(Lh,"H")); setT("dc-z",fmt(Z,"Ω")+" at "+fmt(f,"Hz")); setT("dc-p",`${c.l.toFixed(1)} mm`); setT("dc-a",`${c.A.toFixed(2)} mm²`); setT("dc-r",fmt(fr,"Hz"));
  const good=h<1&&Lh<2.5e-9;
  note("dc-n",good?`Under 2.5 nH. The 100 nF itself is only ${fmt(Xc,"Ω")} at ${fmt(f,"Hz")}; the loop's ${fmt(Z,"Ω")} is what the IC sees.`
   :h>1?`On 2-layer, the return runs 1.6 mm down on B.Cu: every millimetre of path costs about three times as much as on 4-layer.`
   :`The path is ${c.l.toFixed(1)} mm. Shorten the trace from VDD to C1 and put C1's via right at its ground pad.`,good?"good":"");
  if(good){ BC.once("decoup-good",10,"decoupling loop under 2.5 nH"); }
 }};

/* ---- DRC sleuth ---- */
/* each board: title, shapes S, items [{id, bad, label, box [x,y,w,h] in mm, why}] */
const DRB=(()=>{ const {pad,tht,via,trk,txt,sl,circ,rectP}=PB, edge={l:"Edge.Cuts",k:"o",x:1,y:1,w:24,h:16,rx:1}, B=[];
  const soic=(cx,cy,sp)=>[-1.905,-0.635,0.635,1.905].flatMap(d=>[...pad(cx-sp/2,cy+d,1.5,0.6),...pad(cx+sp/2,cy+d,1.5,0.6)]);
  /* 1: I²C sensor breakout */
  B.push({title:"Sensor breakout",S:[edge,
    ...tht(3.5,4.2,1.7,1.0,1),...tht(3.5,6.74,1.7,1.0),...tht(3.5,9.28,1.7,1.0),...tht(3.5,11.82,1.7,1.0),
    sl([[2.2,2.9],[4.8,2.9],[4.8,13.1],[2.2,13.1],[2.2,2.9]]),txt(3.5,2.55,"J1"),
    ...soic(16.5,8,5.4),sl([[14.9,5.3],[18.1,5.3]]),sl([[14.9,10.7],[18.1,10.7]]),{l:"F.Silkscreen",k:"c",x:12.75,y:5.35,r:0.2},txt(16.5,8.3,"U1"),
    ...pad(21.6,5.0,1.0,0.95),...pad(21.6,6.6,1.0,0.95),txt(21.6,6.88,"C1"),
    trk([[3.5,4.2],[5.5,4.2],[8.4,1.3],[19.4,1.3],[21.6,3.5],[21.6,5.0]],0.4),
    trk([[19.2,6.095],[20.5,6.095],[21.6,5.0]],0.3),
    trk([[3.5,6.74],[5.2,6.74],[6.06,7.6],[10.5,7.6],[12.005,6.095],[13.8,6.095]],0.25),
    trk([[3.5,9.28],[5.2,9.28],[6.55,7.93],[10.9,7.93],[11.465,7.365],[13.8,7.365]],0.25),
    trk([[13.8,8.635],[12.6,8.635],[12.6,9.905]],0.25),trk([[13.8,9.905],[12.6,9.905],[12.6,10.6]],0.3),trk([[21.6,6.6],[22.6,6.6],[22.6,10.6]],0.3),
    {l:"F.Cu",k:"p",d:rectP(1.5,10.4,23,6.1)+circ(3.5,11.82,1.15)+circ(21.5,13.6,2.1)},trk([[2.2,11.82],[4.8,11.82]],0.4),trk([[3.5,10.5],[3.5,13.14]],0.4),
    {l:"NPTH",k:"c",x:21.5,y:13.6,r:1.6}],
   items:[
    {id:"clr",bad:1,label:"SDA and SCL where they run side by side",box:[6.5,7.2,4.4,1.1],why:"Clearance. SDA and SCL run 0.33 mm apart centre to centre at 0.25 mm wide, leaving a 0.08 mm gap against a typical 0.127 mm minimum. The fab may etch them into one. Move one trace; DRC reports a clearance violation."},
    {id:"edge",bad:1,label:"the VCC trace along the top edge",box:[8.6,0.6,10.6,1.25],why:"Copper at the edge. The VCC trace runs 0.1 mm from Edge.Cuts. Routing the outline can nick it or leave it bare at the edge, where it can short to an enclosure. Keep copper 0.3 mm or more from routed edges; DRC checks board edge clearance."},
    {id:"silk",bad:1,label:"the C1 label",box:[20.9,6.05,1.4,1.1],why:"Silkscreen on a pad. The C1 label crosses C1's ground pad, and ink there stops solder wetting. Fabs usually clip silkscreen out of mask openings, leaving a broken label. Move the text off the pad; DRC flags silkscreen clipped by solder mask."},
    {id:"th",bad:0,label:"J1 pin 4 and the ground pour",box:[2.1,10.4,2.8,2.8],why:"A thermal relief: four spokes join the pad to the pour, so a soldering iron can still heat it."},
    {id:"mh",bad:0,label:"the mounting hole",box:[19.6,11.7,3.8,3.8],why:"An unplated M3 mounting hole with copper kept well back, so a screw or standoff can't touch any net."},
    {id:"c1",bad:0,label:"the trace from U1 pin 8 to C1",box:[19.2,4.6,1.6,1.9],why:"U1's supply pin reaches C1 over a short trace, and C1's ground runs straight down into the pour."},
    {id:"p1",bad:0,label:"U1's pin 1 dot",box:[12.25,4.85,1.0,1.0],why:"The pin 1 dot sits beside pad 1, off the copper, where it stays visible after assembly."}]});
  /* 2: 5 V to 3.3 V regulator */
  B.push({title:"3.3 V regulator",S:[edge,
    {l:"B.Cu",k:"p",d:rectP(6.2,1.5,18.3,15)+circ(22.5,7.73,1.6)},
    ...tht(22.5,7.73,1.7,1.0,1),...tht(22.5,10.27,1.7,1.0),txt(22.5,5.75,"J1"),txt(22.5,12.9,"5V",0.7),
    ...tht(3.5,7.73,1.7,1.0,1),...tht(3.5,10.27,1.7,1.0),txt(3.5,5.75,"J2"),txt(3.5,12.9,"3V3",0.7),
    ...pad(10.7,12.2,1.2,1.8),...pad(13,12.2,1.2,1.8),...pad(15.3,12.2,1.2,1.8),...pad(13,5.9,3.6,2.0),
    sl([[9.6,7.4],[9.6,10.8]]),sl([[16.4,7.4],[16.4,10.8]]),txt(13,9.3,"U1"),
    ...pad(17.9,11.25,1.4,1.0),...pad(17.9,13.15,1.4,1.0),txt(19.6,12.5,"C1",0.7,"start"),
    ...pad(7.6,6.25,1.4,1.0),...pad(7.6,8.15,1.4,1.0),txt(5.9,7.45,"C2",0.7,"end"),
    ...pad(18.2,3.2,0.9,0.95),...pad(19.8,3.2,0.9,0.95),...pad(21.0,3.2,0.9,0.95),...pad(22.6,3.2,0.9,0.95),txt(19.0,2.15,"R1",0.6),txt(21.8,2.15,"D1",0.6),
    trk([[22.5,7.73],[19.8,7.73],[17.9,9.63],[17.9,11.25],[15.3,11.25],[15.3,12.2]],1.0),
    trk([[21.0,7.73],[18.2,6.16],[18.2,3.2]],0.25),trk([[19.8,3.2],[21.0,3.2]],0.25),trk([[22.6,3.2],[23.6,3.2]],0.25),...via(23.6,3.2),
    trk([[13,5.9],[6.0,5.9],[4.17,7.73],[3.5,7.73]],0.8),trk([[13,11.3],[13,6.9]],0.6),
    trk([[10.7,12.2],[10.7,14.0]],0.5),...via(10.7,14.0),trk([[17.9,13.15],[17.9,14.5]],0.5),...via(17.9,14.5),
    trk([[7.6,8.15],[7.6,9.6]],0.4),...via(7.6,9.6,0.45,0.4),
    {l:"Rats",k:"t",pts:[[3.5,10.27],[7.6,9.6]],w:0.06}],
   items:[
    {id:"ring",bad:1,label:"the via under C2",box:[6.9,8.9,1.4,1.4],why:"Annular ring. This via has a 0.4 mm drill in a 0.45 mm pad, leaving 0.025 mm of copper around the hole. Any drill wander breaks out of the pad. Use 0.3 mm in 0.6 mm, like the other vias; DRC checks the annular width."},
    {id:"rats",bad:1,label:"J2 pin 2 and the thin line beside it",box:[4.5,9.35,2.3,1.2],why:"Unconnected. A ratsnest line still joins J2 pin 2 to the ground via: the bottom pour stops short of the pad, so the output connector's ground floats. Extend the pour or add a trace, refill the zones, and rerun DRC until no unconnected items remain."},
    {id:"acid",bad:1,label:"where the LED feed leaves the VIN trace",box:[19.3,6.0,2.4,1.25],why:"Acid trap. The LED feed leaves VIN at about 30°, making a narrow copper wedge. Etchant can pool in the sharp inside corner and eat into it. KiCad's DRC doesn't flag it; branch off at 90° or 45°."},
    {id:"vin",bad:0,label:"the wide VIN trace",box:[17.0,8.4,2.4,2.0],why:"VIN is 1 mm wide, enough for over 2 A at 1 oz with a 10 °C rise."},
    {id:"tab",bad:0,label:"U1's tab pad",box:[11.0,4.7,4.0,2.4],why:"U1's tab is large on purpose: it is VOUT and the regulator's heat path into the copper."},
    {id:"gv",bad:0,label:"U1's ground via",box:[10.0,13.2,1.4,1.5],why:"U1's ground pin drops straight into the bottom pour through a 0.3 mm via in a 0.6 mm pad."}]});
  /* 3: microcontroller corner */
  B.push({title:"Microcontroller",S:[edge,
    {l:"B.Cu",k:"p",d:rectP(1.5,1.5,23,15)+circ(22.5,6.46,1.5)+circ(22.5,11.54,1.4)},
    ...soic(12,9,5.4),sl([[10.4,6.3],[13.6,6.3]]),sl([[10.4,11.7],[13.6,11.7]]),{l:"F.Silkscreen",k:"c",x:8.25,y:6.35,r:0.2},txt(12,9.3,"U1"),
    ...tht(22.5,6.46,1.7,1.0,1),...tht(22.5,9.0,1.7,1.0),...tht(22.5,11.54,1.7,1.0),txt(22.5,13.6,"J1"),
    ...pad(16.9,6.3,1.0,0.95),...pad(16.9,7.9,1.0,0.95),txt(18.0,7.35,"C1",0.7,"start"),...via(16.9,7.9),
    ...pad(6.2,5.2,1.0,0.95,{nomask:1}),...pad(6.2,6.8,1.0,0.95),txt(5.1,6.25,"R1",0.7,"end"),
    trk([[14.7,7.095],[16.0,7.095],[16.9,6.3]],0.3),trk([[16.9,6.3],[16.9,4.6],[20.85,4.6],[22.5,6.25],[22.5,6.46]],0.4),
    trk([[9.3,7.095],[6.2,7.095],[6.2,6.8]],0.25),trk([[6.2,5.2],[6.2,3.6],[16.9,3.6],[16.9,4.6]],0.3),
    trk([[22.5,9.0],[20.0,9.0]],0.4),...via(20.0,9.0),trk([[9.3,10.905],[7.8,10.905]],0.3),...via(7.8,10.905,0.35,0.15),
    trk([[22.5,11.54],[16.0,11.54],[15.365,10.905],[14.7,10.905]],0.25),
    {l:"F.Cu",k:"c",x:11.5,y:3.6,r:0.6},{l:"F.Mask",k:"c",x:11.5,y:3.6,r:0.65},txt(11.5,2.65,"TP1",0.6),
    {l:"F.Cu",k:"c",x:3.0,y:14.8,r:0.5},{l:"F.Mask",k:"c",x:3.0,y:14.8,r:1.0}],
   items:[
    {id:"vip",bad:1,label:"C1's ground pad",box:[16.2,7.3,1.4,1.2],why:"Via in pad. C1's ground pad has an open via in it. In reflow, solder wicks down the hole and the joint starves. Move the via just off the pad, or order filled and capped vias. DRC passes it: it is an assembly problem."},
    {id:"mask",bad:1,label:"R1's top pad",box:[5.5,4.55,1.4,1.3],why:"No mask opening. R1's top pad is covered by solder mask because the footprint's pad lacks the F.Mask layer, so nothing can solder to it. Fix the pad's layers in the footprint. DRC won't catch it; the Gerber viewer and 3D view will."},
    {id:"drill",bad:1,label:"the via at U1's ground pin",box:[7.1,10.2,1.4,1.4],why:"Drill too small. This via's hole is 0.15 mm, below the 0.3 mm minimum of a typical low-cost 2-layer service. The fab rejects the order or charges for fine drilling. Put the fab's minimum in Board Setup and DRC catches it."},
    {id:"tp",bad:0,label:"TP1",box:[10.6,2.75,1.8,1.6],why:"TP1 is a bare round pad for a probe, with a mask opening and no paste."},
    {id:"fid",bad:0,label:"the copper dot in the corner",box:[1.8,13.6,2.4,2.4],why:"A fiducial: bare copper in a wider mask opening, so the placement camera sees a sharp edge."},
    {id:"tv",bad:0,label:"the via beside J1",box:[19.3,8.3,1.4,1.4],why:"A tented via: mask covers it, keeping solder out of the hole and protecting the copper."}]});
  return B;
})();
const pcbKey=`<p class="label pcKey"><i class="kc"></i>copper under mask <i class="kx"></i>exposed copper <i class="ks"></i>silkscreen <i class="ke"></i>Edge.Cuts <i class="kb"></i>B.Cu, seen through</p>`;
L.drc={title:"DRC sleuth",sub:"find what the fab or the oven will punish",html:()=>`
  <div class="ctrls"><div class="gates" id="dr-nav" role="group" aria-label="Boards">${DRB.map((b,i)=>`<button type="button" data-i="${i}" aria-pressed="${i===0}" aria-label="Board ${i+1}, ${esc(b.title)}">${i+1}</button>`).join("")}</div>
   <p class="mzTask"><b id="dr-h"></b> <span id="dr-t"></span></p></div>
  <div class="readout">${ro("Found","dr-f",1)}${ro("Boards cleared","dr-b")}</div>
  <div class="pcbWrap"><svg class="pcbSv" id="dr-sv" viewBox="0 0 26 18" role="group" aria-label="Board top view. Each feature is a button."></svg></div>
  ${pcbKey}<p class="note" id="dr-n" aria-live="polite"></p>`,
 init(root){ let cur=0, found=new Set();
  const sv=$("#dr-sv",root), solved=i=>!!BC.S.xpOnce["drc-"+i], bads=i=>DRB[i].items.filter(t=>t.bad).length;
  const stat=()=>{ setT("dr-f",`${found.size} of ${bads(cur)}`); setT("dr-b",`${DRB.filter((_,i)=>solved(i)).length} of ${DRB.length}`);
   $$("#dr-nav button",root).forEach(b=>{ const i=+b.dataset.i; b.setAttribute("aria-pressed",i===cur); b.classList.toggle("right",solved(i)); b.textContent=(solved(i)?"✓ ":"")+(i+1); }); };
  const show=i=>{ cur=i; found=new Set(); const b=DRB[i];
   sv.innerHTML=PB.stack(b.S,"dr"+i)+b.items.map(t=>`<g class="tg" data-t="${t.id}" role="button" tabindex="0" aria-label="${esc(t.label)}"><rect class="hitb" x="${t.box[0]}" y="${t.box[1]}" width="${t.box[2]}" height="${t.box[3]}" rx="0.3"/></g>`).join("");
   setT("dr-h",`${i+1}. ${b.title}.`); setT("dr-t",`This board has ${bads(i)} problems. Click each one.`); note("dr-n",""); stat(); };
  const hit=g=>{ const b=DRB[cur], t=b.items.find(x=>x.id===g.dataset.t); if(!t) return; BC.touchLab("drc");
   if(t.bad){ g.classList.add("ok"); if(found.has(t.id)){ note("dr-n",t.why,"good"); return; } found.add(t.id); note("dr-n",t.why,"good"); BC.beep("good");
    if(found.size===bads(cur)){ BC.once("drc-"+cur,10,"board checked"); note("dr-n",t.why+" That was the last one on this board.","good"); } stat(); }
   else { g.classList.add("miss"); note("dr-n",`Fine: ${t.why}`); BC.beep("click"); } };
  sv.addEventListener("click",e=>{ const g=e.target.closest(".tg"); if(g) hit(g); });
  sv.addEventListener("keydown",e=>{ const g=e.target.closest(".tg"); if(g&&(e.key==="Enter"||e.key===" ")){ e.preventDefault(); hit(g); } });
  $("#dr-nav",root).addEventListener("click",e=>{ const b=e.target.closest("button"); if(b) show(+b.dataset.i); });
  show(Math.max(0,DRB.findIndex((_,i)=>!solved(i))));
 }};

/* ---- Gerber layers ---- */
const GB=(()=>{ const {pad,tht,via,trk,txt,sl,circ,rectP}=PB;
  const S=[{l:"Edge.Cuts",k:"o",x:1,y:1,w:20,h:12,rx:0.8},
   {l:"B.Cu",k:"p",d:rectP(1.5,1.5,19,11)+circ(3.5,5.73,1.5)+circ(18.5,10.5,1.7)},
   ...tht(3.5,5.73,1.7,1.0,1),...tht(3.5,8.27,1.7,1.0),
   ...pad(9.05,5.73,1.0,1.3),...pad(10.95,5.73,1.0,1.3),...pad(14.05,5.73,1.0,1.3),...pad(15.95,5.73,1.0,1.3),
   trk([[3.5,5.73],[9.05,5.73]],0.4),trk([[10.95,5.73],[14.05,5.73]],0.4),trk([[15.95,5.73],[17.5,5.73]],0.4),...via(17.5,5.73),
   {l:"NPTH",k:"c",x:18.5,y:10.5,r:1.1},
   sl([[2.3,4.3],[4.7,4.3],[4.7,9.7],[2.3,9.7],[2.3,4.3]]),txt(3.5,3.6,"J1"),txt(5.5,6.0,"+",0.8),
   txt(10,4.3,"R1"),txt(15,4.3,"D1"),sl([[16.75,4.6],[16.75,6.86]],0.2),txt(11,11,"LED-1 rev A",0.9)];
  const LY=[["all","All layers","The board as it comes back from the fab: every file stacked."],
   ["F.Cu","F.Cu","led-F_Cu.gbr · top copper: pads, traces and the via's top ring."],
   ["B.Cu","B.Cu","led-B_Cu.gbr · bottom copper: the ground pour, cleared around pin 1 and the mounting hole. Through-hole pads and the via appear on both copper layers."],
   ["F.Mask","F.Mask","led-F_Mask.gbr · the openings in the top solder mask, drawn as shapes. Everything not drawn gets mask. The via has no opening: it is tented."],
   ["F.Paste","F.Paste","led-F_Paste.gbr · stencil openings for the four SMD pads only. Through-hole pins get no paste."],
   ["F.Silkscreen","F.Silkscreen","led-F_Silkscreen.gbr · text, outlines and the LED's cathode bar."],
   ["Edge.Cuts","Edge.Cuts","led-Edge_Cuts.gbr · the outline the fab routes along. One closed shape."],
   ["Drill","Drill","led-PTH.drl and led-NPTH.drl · plated holes for J1 and the via; the unplated mounting hole in its own file."]];
  return {S,LY};
})();
L.gerbers={title:"Gerber layers",sub:"one board, taken apart into its files",html:()=>`
  <div class="ctrls"><div class="gates" id="gb-l" role="group" aria-label="Layer">${GB.LY.map((l,i)=>`<button type="button" data-i="${i}" aria-pressed="${i===0}">${esc(l[1])}</button>`).join("")}</div>
   <div class="readout">${ro("Showing","gb-n",1)}<p class="note" id="gb-w"></p></div></div>
  <div class="pcbWrap gbWrap"><svg class="pcbSv" id="gb-sv" viewBox="0 0 22 14" role="img"></svg></div>${pcbKey}`,
 init(root){ const sv=$("#gb-sv",root);
  const show=i=>{ const l=GB.LY[i]; $$("#gb-l button",root).forEach(b=>b.setAttribute("aria-pressed",+b.dataset.i===i));
   sv.classList.toggle("gbSheet",i>0); sv.innerHTML=i?`<rect class="gbBg" x="0" y="0" width="22" height="14"/>`+PB.layer(GB.S,l[0]):PB.stack(GB.S,"gb");
   sv.setAttribute("aria-label",i?`${l[1]} layer of a small LED board, as its file draws it`:"A small LED board with all layers stacked: J1, R1, D1, a via and a mounting hole");
   setT("gb-n",l[1]); note("gb-w",l[2]); };
  $("#gb-l",root).addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return; show(+b.dataset.i); BC.beep("click"); BC.touchLab("gerbers"); });
  show(0);
 }};

/* ---------- home figure: a battery and one resistor ---------- */
BC.mountHero=function(host){
  host.innerHTML=`<div class="figBody"><canvas id="hr-cv" aria-label="A 9 volt battery driving a resistor. Moving dots show current."></canvas>
   <div class="figSide"><div class="ctrl"><label for="hr-r"><span>Resistance</span><output id="hr-r-o"></output></label><input type="range" id="hr-r" min="1.3" max="4.3" step="0.01" value="2.672"></div>
   <div class="readout"><div class="ro hl"><div class="k">Current</div><div class="v" id="hr-i">—</div></div><div class="ro"><div class="k">Power in resistor</div><div class="v" id="hr-p">—</div></div></div></div></div>`;
  const st={V:9,R:470,I:0,heat:0}; let s=0; const sm=[];
  const run=()=>{st.R=Math.pow(10,+$("#hr-r").value); st.I=st.V/st.R; const P=st.V*st.I; st.heat=P/0.25; out("hr-r",fmt(st.R,"Ω")); setT("hr-i",fmt(st.I,"A")); setT("hr-p",fmt(P,"W")+(P>0.25?" · too hot":""));};
  host.addEventListener("input",()=>{run(); BC.redraw();}); run(); host._run=run;
  BC.anim(dt=>{const cv=$("#hr-cv"); if(!cv) return; const {g,W,H}=BC.fit(cv);
   const r={x0:50,x1:W-40,y0:42,y1:H-34}, ym=(r.y0+r.y1)/2, xa=W/2-60, xb=W/2+60;
   const speed=clamp((Math.log10(st.I*1e6)+0.5)/6,0.03,1.4)*0.22; s+=speed*dt;
   g.strokeStyle=css("--muted"); g.lineWidth=1.5; line(g,[[r.x0,ym-12],[r.x0,r.y0],[xa,r.y0]]); line(g,[[xb,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1],[r.x0,ym+12]]);
   g.strokeStyle=css("--ink"); battV(g,r.x0,ym,"9 V");
   const h=Math.min(st.heat,1.2); g.save(); g.lineWidth=2.5; g.strokeStyle=st.heat<0.15?css("--ink"):`hsl(${38-38*Math.min(h,1)} 95% 50%)`; zigH(g,xa,xb,r.y0,8); g.restore();
   txt(g,fmt(st.R,"Ω"),W/2,r.y0-14,"center","--ink",12);
   if(st.heat>1 && Math.random()<dt*12) smoke(sm,W/2+BC.rand(-40,40),r.y0-6); drawSmoke(g,sm,dt);
   g.fillStyle=css("--accent"); const N=Math.max(12,Math.round((W+H)/28));
   for(let i=0;i<N;i++){const [x,y]=loopPt(r,s+i/N); if(x===r.x0&&Math.abs(y-ym)<14) continue; g.beginPath(); g.arc(x,y,2.8,0,7); g.fill();}
  });
};

/* ---------- mounting ---------- */
BC.mountLab=function(key,host,fig){
  const Lb=L[key]; if(!Lb) return; const d=document.createElement("figure"); d.className="lab"; d.id="lab-"+key;
  d.innerHTML=`<div class="lb">${Lb.html()}</div><figcaption class="lh"><h3>${fig?`<span class="figno">Fig. ${fig}</span>`:""}${Lb.title}</h3><span>${Lb.sub}</span></figcaption>`;
  host.appendChild(d);
  if(Lb.init) Lb.init(d);
  if(Lb.run){ const go=()=>{ Lb.run(d); BC.redraw(); }; d.addEventListener("input",()=>{ go(); BC.touchLab(key); }); d.addEventListener("change",go); go(); d._run=go; }
  d.addEventListener("click",()=>BC.redraw());
};
})();
