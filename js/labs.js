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
function smoke(list,x,y){list.push({x:x+BC.rand(-6,6),y,vy:BC.rand(-30,-50),vx:BC.rand(-8,8),r:BC.rand(4,8),life:1.6});}
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
  const pf=(+m[1]*10+ +m[2])*Math.pow(10,+m[3]); setT("cp-pf",pf.toLocaleString()+" pF"); setT("cp-nf",+(pf/1e3).toPrecision(4)+" nF"); setT("cp-uf",+(pf/1e6).toPrecision(4)+" µF");
  note("cp-n",`${m[1]}${m[2]} followed by ${m[3]} zero${m[3]==="1"?"":"s"} = ${pf.toLocaleString()} pF.${pf===1e5?" 100 nF is the classic decoupling cap. You'll use hundreds of them.":""}`);}};

/* ================= CH4 ================= */
const DIODES={si:{n:"Silicon (1N4148)",vf:0.7},sch:{n:"Schottky (1N5817)",vf:0.32},red:{n:"Red LED",vf:1.9},blue:{n:"Blue LED",vf:3.0},zen:{n:"Zener 5.1 V",vf:0.7,vz:5.1}};
const nVt=0.0517;
function diodeI(d,V){const Is=0.01/Math.exp(d.vf/nVt); let I=Is*(Math.exp(Math.min(V/nVt,60))-1); if(d.vz&&V<0) I-=1e-3*Math.exp(Math.min((-V-d.vz)/0.03,60)); return I;}
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
   if(!st.dead && st.I>0.04){ over+=dt; if(over>0.35){ st.dead=true; BC.beep("pop"); BC.S.fried=(BC.S.fried||0)+1; BC.save(); BC.badge("smoke"); for(let k=0;k<16;k++) smoke(sm,W/2+60+BC.rand(-8,8),40); this.run(); } } else over=0;
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
    if(okf&&okv){r.className="note good"; r.textContent=`Nailed it: ${fmt(m.f,"Hz")}, ${vpp} V peak-to-peak (${WAVES[m.w].toLowerCase()}${m.o?`, ${m.o} V offset`:""}).`; BC.beep("good"); BC.addXP(30,"mystery signal solved"); BC.S.scoped=(BC.S.scoped||0)+1; BC.save(); BC.badge("probe"); BC.confetti();
      setTimeout(()=>{ if(self.st.myst){ self.st.myst=null; $("#sc-myst").click(); } },1800);}
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
  self.apply=()=>{ if(!nodes) return; const ac=BC.audio(); const fc=clamp(self.fc,20,20000); nodes.f1.type=nodes.f2.type=$("#fl-m").value==="lp"?"lowpass":"highpass"; nodes.f1.frequency.setTargetAtTime(fc,ac.currentTime,0.03); nodes.f2.frequency.setTargetAtTime(fc,ac.currentTime,0.03); const byp=$("#fl-byp").checked; nodes.dry.gain.value=byp?1:0; nodes.wet.gain.value=byp?0:1; };
  $("#fl-byp").addEventListener("change",()=>self.apply());
  $("#fl-src").addEventListener("change",()=>{ if(nodes){stop(); $("#fl-play").click();} });
  $("#fl-play").addEventListener("click",()=>{
   if(nodes){stop();return;} const ac=BC.audio(); if(!ac) return; BC.touchLab("filter");
   const out=ac.createGain(); out.gain.value=0.18; out.connect(ac.destination);
   const f1=ac.createBiquadFilter(), f2=ac.createBiquadFilter(); f1.Q.value=f2.Q.value=0.5; const wet=ac.createGain(), dry=ac.createGain();
   let src; const kind=$("#fl-src").value;
   if(kind==="noise"){ src=ac.createBufferSource(); src.buffer=getNoise(ac); src.loop=true; }
   else { src=ac.createOscillator(); src.type="sawtooth"; src.frequency.value=110; if(kind==="music"){ const notes=[110,138.6,164.8,220,164.8,138.6]; let k=0; arpT=setInterval(()=>{ src.frequency.setValueAtTime(notes[k++%notes.length],ac.currentTime); },180);} }
   src.connect(dry); src.connect(f1); f1.connect(f2); f2.connect(wet); wet.connect(out); dry.connect(out); src.start();
   nodes={src,out,f1,f2,wet,dry}; self.apply(); $("#fl-play").textContent="■ Stop";
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
  BC.anim(dt=>{ if(!runOn) return; acc+=dt; if(acc>0.12){acc=0; self.v=(self.v+1)&255; draw();} });
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
  BC.anim(dt=>{const cv=$("#pw-fan"); if(!cv) return; const D=+$("#pw-d").value/100, target=D*(+$("#pw-v").value/12)*14; w+= (target-w)*Math.min(1,dt*1.8); ang+=w*dt;
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
   const pw=+$("#sv-p").value, tgt=clamp((pw-1)*180,0,180); const mv=600*dt*(60/0.12)/600; cur+=clamp(tgt-cur,-mv,mv);
   const {g,W,H}=BC.fit(cv), cx=Math.min(W*0.3,170), cy=H*0.5;
   g.fillStyle=css("--sunk"); g.strokeStyle=css("--line"); g.lineWidth=1.5; g.fillRect(cx-60,cy-36,120,72); g.strokeRect(cx-60,cy-36,120,72);
   g.strokeStyle=css("--line"); g.beginPath(); g.arc(cx,cy,64,Math.PI,2*Math.PI); g.stroke();
   for(let a=0;a<=180;a+=45){const r=a*Math.PI/180; line(g,[[cx-Math.cos(r)*58,cy-Math.sin(r)*58],[cx-Math.cos(r)*66,cy-Math.sin(r)*66]]); txt(g,a+"°",cx-Math.cos(r)*80,cy-Math.sin(r)*80+4,"center","--muted",10);}
   const r=cur*Math.PI/180; g.save(); g.translate(cx,cy); g.rotate(-r+Math.PI); g.fillStyle=css("--surface"); g.strokeStyle=css("--ink"); g.lineWidth=2; g.beginPath(); g.roundRect?g.roundRect(-6,-6,62,12,6):g.rect(-6,-6,62,12); g.fill(); g.stroke(); g.restore();
   g.fillStyle=css("--accent"); g.beginPath(); g.arc(cx,cy,7,0,7); g.fill();
   const x0=cx+110, w=W-x0-14, yb=cy+30, yt=cy-30; if(w>120){ g.strokeStyle=css("--trace"); g.lineWidth=2; g.beginPath(); g.moveTo(x0,yb); const frame=w/2; for(let k=0;k<2;k++){const xs=x0+k*frame, pwx=pw/20*frame*3; g.lineTo(xs,yb); g.lineTo(xs,yt); g.lineTo(xs+pwx,yt); g.lineTo(xs+pwx,yb);} g.lineTo(x0+w,yb); g.stroke();
     txt(g,pw.toFixed(2)+" ms",x0+4,yt-8,"left","--ink",11); txt(g,"20 ms frame (pulse drawn 3× wider)",x0,yb+18,"left","--muted",10); }
  });},
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
   const tgt=Math.atan2(vy,vx); let d=tgt-ang; while(d>Math.PI)d-=2*Math.PI; while(d<-Math.PI)d+=2*Math.PI; ang+=d*Math.min(1,dt*14);
   const {g,W,H}=BC.fit(cv), cx=W/2, cy=H/2, R=Math.min(H/2-20,110);
   ["A","B","A′","B′"].forEach((nm,k)=>{const [px,py]=pos[k], x=cx+px*R, y=cy+py*R, on=s[k];
     g.save(); g.translate(x,y); g.rotate(Math.atan2(py,px)); g.fillStyle=on?css("--accent"):css("--sunk"); g.strokeStyle=css("--line"); g.lineWidth=1.5;
     if(on){g.shadowColor=css("--accent"); g.shadowBlur=16;} g.fillRect(-14,-18,28,36); g.shadowBlur=0; g.strokeRect(-14,-18,28,36);
     g.strokeStyle=on?css("--surface"):css("--muted"); for(let j=-12;j<=12;j+=6) line(g,[[-10,j],[10,j]]); g.restore();
     txt(g,nm,cx+px*(R+30),cy+py*(R+30)+4,"center",on?"--accent":"--muted",12);});
   g.strokeStyle=css("--line"); g.lineWidth=1.5; g.beginPath(); g.arc(cx,cy,R*0.55,0,7); g.stroke();
   g.save(); g.translate(cx,cy); g.rotate(ang); g.fillStyle=css("--bad"); g.beginPath(); g.moveTo(R*0.5,0); g.lineTo(0,-10); g.lineTo(0,10); g.fill(); g.fillStyle=css("--trace"); g.beginPath(); g.moveTo(-R*0.5,0); g.lineTo(0,-10); g.lineTo(0,10); g.fill(); g.restore();
   txt(g,"N",cx+Math.cos(ang)*R*0.28,cy+Math.sin(ang)*R*0.28+4,"center","--surface",11);
  });},
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
  const start=()=>{const ac=BC.audio(); if(!ac) return; o=ac.createOscillator(); g=ac.createGain(); o.type=$("#tn-w").value; o.frequency.value=self.f; g.gain.value=+$("#tn-v").value; o.connect(g).connect(ac.destination); o.start(); $("#tn-play").textContent="■ Stop"; BC.touchLab("tone");};
  self.upd=()=>{ if(o){ o.type=$("#tn-w").value; o.frequency.setTargetAtTime(self.f,BC.audio().currentTime,0.01); g.gain.setTargetAtTime(+$("#tn-v").value,BC.audio().currentTime,0.02);} };
  $("#tn-play").addEventListener("click",()=>{ if(o&&!sweep){stop();} else {stop(); start();} });
  $("#tn-test").addEventListener("click",()=>{
   if(sweep){ const f=self.f; stop(); BC.S.hi.hearing=Math.max(BC.S.hi.hearing||0,Math.round(f)); BC.save(); note("tn-n",`You stopped hearing it around ${fmt(f,"Hz")}. ${f>16000?"Excellent high-frequency hearing.":f>12000?"Typical adult range.":"Try lower volume and a quiet room, or check your speakers. Many laptop speakers roll off early."}`,"good"); BC.addXP(10,"hearing test"); return; }
   stop(); $("#tn-w").value="sine"; $("#tn-f").value=Math.log10(8000); self.run(); start(); $("#tn-test").textContent="I can't hear it any more"; $("#tn-play").textContent="■ Stop";
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

/* ---------- mounting ---------- */
BC.mountLab=function(key,host){
  const Lb=L[key]; if(!Lb) return; const d=document.createElement("div"); d.className="lab"; d.id="lab-"+key;
  d.innerHTML=`<div class="lh"><h3>${Lb.title}</h3><span class="label">${Lb.sub}</span></div><div class="lb">${Lb.html()}</div>`;
  host.appendChild(d);
  if(Lb.init) Lb.init(d);
  if(Lb.run){ const go=()=>{ Lb.run(d); }; d.addEventListener("input",e=>{ go(); BC.touchLab(key); }); d.addEventListener("change",go); go(); d._run=go; }
};
})();
