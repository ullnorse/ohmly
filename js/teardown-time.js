/* Teardown, the time half: what ull-pocket does over time. One model (phases with their current, active parts and nets,
   and the I²C transactions) feeds the zoomable timeline, the stories and the probe, and all three drive the board through
   BC.TD.show. Currents are datasheet typicals, labelled in the UI as estimates; the firmware is an example sequence. */
(function(){
const BC=window.BC, {$,$$,esc}=BC, TD=BC.TD;
const uA=1e-6, mA=1e-3, ms=1e-3, us=1e-6, ns=1e-9;
const VDD=3.3;

/* ---------- figures: value (or [lo, hi] where a range is all we can honestly give) and source ---------- */
const F={
 c6Deep:[7*uA,"ESP32-C6","deep sleep, RTC timer on","ESP32-C6 datasheet v1.5, table 5-11"],
 c6Run:[38*mA,"ESP32-C6","CPU running at 160 MHz","table 5-10, peripheral clocks on (27 mA gated)"],
 c6Light:[180*uA,"ESP32-C6","light sleep","table 5-11, peripheral clocks off"],
 c6Rx:[78*mA,"ESP32-C6","Wi-Fi receive","table 5-7, 802.11b/g/n HT20"],
 c6Tx:[354*mA,"ESP32-C6","Wi-Fi transmit, peak","table 5-7, 802.11b at 21 dBm"],
 accLp:[1*uA,"LIS2DW12","motion wake, 12.5 Hz low-power","ST datasheet"],
 epdSleep:[1*uA,"SSD1681","deep sleep","Solomon Systech datasheet, deep sleep mode 1"],
 epdRun:[1*mA,"SSD1681","logic running","datasheet, operating current on VCI"],
 epdRef:[[1*mA,1.4*mA],"Panel","partial refresh","1 mA logic; ≤ 4.5 mW / 3.3 V listed for the panel"],
 bmpSb:[.5*uA,"BMP580","deep standby","Bosch BMP58x family; its measuring current is left out"],
 shtIdle:[.08*uA,"SHT40","idle","Sensirion datasheet, table 3"],
 shtMeas:[350*uA,"SHT40","measuring","table 3; 8.2 ms max at high repeatability"],
 bqSleep:[4.3*uA,"BQ24073","battery side, no USB","TI datasheet, IBAT(PDWN) typ"],
 fgHib:[3*uA,"MAX17048","hibernate","Analog Devices datasheet"],
 ldoIq:[2*uA,"RT9080","quiescent","Richtek datasheet"],
 bqIcc:[1.1*mA,"BQ24073","running, USB in","TI datasheet, ICC typ"]};
const lo=f=>Array.isArray(f[0])?f[0][0]:f[0], hi=f=>Array.isArray(f[0])?f[0][1]:f[0];
/* sleep budget: ref, figure, side. "r": on +3V3 after R13, so a meter on R13 sees it; "b": battery side, before R13 */
const SLEEP=[["U1","c6Deep","r"],["U4","accLp","r"],["J3","epdSleep","r"],["U3","bmpSb","r"],["U2","shtIdle","r"],["U6","bqSleep","b"],["U5","fgHib","b"],["U7","ldoIq","b"]];
/* stated estimates, not datasheet figures */
const EST={cb:40e-12, cbLo:20e-12, cbHi:57e-12, rp:10e3, rdrv:17.7, zldo:.1, rcell:.15, rq2:.024, rbq:.05, voc:3.8};
const TAU_R=EST.rp*EST.cb, TAU_F=EST.rdrv*EST.cb, K30=-Math.log(.7), K70=-Math.log(.3);
const T_HELD=.15, TAU_PRESS=100*100e-9, TAU_REL=100e3*100e-9;

/* ---------- phases ---------- */
const NET_I2C=["/I2C_SDA","/I2C_SCL"], NET_EPD_IO=["/EPD_SCK","/EPD_MOSI","/EPD_CS_N","/EPD_DC"], NET_EPD_PWR=["/EPD_BUSY","/EPD_PREVGH","/EPD_PREVGL","/EPD_GDR"];
const WHO={0x44:["U2","SHT40"],0x46:["U3","BMP580"],0x36:["U5","MAX17048"],0x19:["U4","LIS2DW12"]};
/* a phase: id, n name, on {ref: figure key} overriding the sleep figure, add {ref: amps}, refs and nets active, fix {I,I3} for scenarios
   that bypass the part sum. Battery current = sum over SLEEP parts; +3V3 current = the "r" ones. */
function cur(p){
  if(p.fix) return p.fix;
  let a=0,b=0,a3=0,b3=0;
  SLEEP.forEach(([r,k,side])=>{ const f=F[(p.on&&p.on[r])||k]; a+=lo(f); b+=hi(f); if(side==="r"){ a3+=lo(f); b3+=hi(f); } });
  Object.values(p.add||{}).forEach(v=>{ a+=v; b+=v; a3+=v; b3+=v; });
  return {I:[a,b],I3:[a3,b3]};
}
const PH={};
const SH={boot:"Boot",shtM:"SHT40",bmpM:"BMP580",spi:"SPI",refresh:"Refresh",down:"Sleep",wifi:"Wi-Fi",press:"OK"};
function ph(id,n,o){ const p=Object.assign({id,n,sh:SH[id.replace("+","")],refs:[],nets:[]},o); Object.assign(p,cur(p)); PH[id]=p; return p; }
ph("sleep","Deep sleep",{refs:["U1","U7","U4"],nets:["/BTN_N","/BTN2_N","/ACC_INT1"]});
ph("boot","Boot from deep sleep",{on:{U1:"c6Run"},refs:["U1","U7","C8","C9"],nets:["+3V3"]});
ph("busy","CPU between transfers",{on:{U1:"c6Run"},refs:["U1"]});
ph("shtM","SHT40 measuring",{on:{U1:"c6Run",U2:"shtMeas"},refs:["U2","C11"]});
ph("bmpM","BMP580 converting",{on:{U1:"c6Run"},refs:["U3","C12","C13"]});
ph("spi","Frame to the panel over SPI",{on:{U1:"c6Run",J3:"epdRun"},refs:["U1","J3","R26"],nets:NET_EPD_IO});
ph("refresh","Panel refresh, CPU in light sleep",{on:{U1:"c6Light",J3:"epdRef"},refs:["J3","L1","Q1","D2","D3","D4","C19","R20"],nets:NET_EPD_PWR});
ph("down","Panel and chip to sleep",{on:{U1:"c6Run",J3:"epdRun"},refs:["U1","J3"]});
ph("wifi","Wi-Fi connect and upload",{on:{U1:"c6Rx"},refs:["U1","C8","U7"],nets:["+3V3"]});
ph("wifiTx","Wi-Fi transmit burst",{on:{U1:"c6Tx"},refs:["U1","C8","U7"],nets:["+3V3"]});
ph("press","OK pressed, wake starting",{add:{R29:VDD/100e3},refs:["SW2","R30","C28","R29","U1"],nets:["/BTN2_N","/BTN2_SW"]});
/* held variants: R29 draws 33 µA while OK is down */
const held=p=>PH[p.id+"+"]||ph(p.id+"+",p.n+", OK held",{on:p.on,add:{R29:VDD/100e3},refs:p.refs.concat(["SW2","R29"]),nets:p.nets.concat(["/BTN2_N"])});
/* USB and reversed-cell scenarios: currents taken from USB, or none */
const I_CHG=890/3.3e3, I_D5=(5-2.6)/2e3, I_D1=(4.4-1.8)/2e3;
const I_USB=I_CHG+hi(F.c6Run)+hi(F.bqIcc)+I_D5+I_D1;
ph("noUsb","No cable",{fix:{I:[0,0],I3:[0,0]},refs:["J1"],nets:[]});
ph("plug","Cable in: VBUS up, charger deglitching",{fix:{I:[hi(F.bqIcc)+I_D5,hi(F.bqIcc)+I_D5],I3:[0,0]},refs:["J1","R1","R2","U8","U6","D5","R21","C2"],nets:["VBUS","Net-(J1-CC1)","Net-(J1-CC2)"]});
ph("charge","Charging at 270 mA, chip awake",{fix:{I:[I_USB,I_USB],I3:[hi(F.c6Run),hi(F.c6Run)]},refs:["U6","R9","D1","R6","D5","R21","U7","R13","U1"],nets:["VBUS","VSYS","/LDO_OUT","+3V3","Net-(U6-ISET)","Net-(D1-K)"]});
ph("noCell","No cell",{fix:{I:[0,0],I3:[0,0]},refs:["J2"]});
ph("rev","Cell backwards: Q2 off",{fix:{I:[0,1*uA],I3:[0,0]},refs:["Q2","R11","J2"],nets:["/BAT_N","Net-(Q2-G)"]});

/* ---------- I²C: 100 kHz, open drain, 10 kΩ pull-ups ---------- */
const BIT=10*us;
function crc8(bs){ let c=0xFF; bs.forEach(b=>{ c^=b; for(let i=0;i<8;i++) c=c&0x80?((c<<1)^0x31)&0xFF:(c<<1)&0xFF; }); return c; }
const w16=(v)=>[v>>8,v&255], withCrc=v=>[...w16(v),crc8(w16(v))];
const SHT_T=Math.round((22.5+45)/175*65535), SHT_RH=Math.round((45+6)/125*65535);
/* example transfers: parts [{a address, rw, b bytes}], a second part is a repeated start */
const XFER={
 shtW:{n:"start an SHT40 measurement",parts:[{a:0x44,rw:0,b:[0xFD]}]},
 shtR:{n:"read the SHT40",parts:[{a:0x44,rw:1,b:[...withCrc(SHT_T),...withCrc(SHT_RH)]}]},
 bmpW:{n:"start a BMP580 conversion",parts:[{a:0x46,rw:0,b:[0x37,0x02]}]},
 bmpR:{n:"read the BMP580",parts:[{a:0x46,rw:0,b:[0x1D]},{a:0x46,rw:1,b:[0x00,0x80,0x16,0x40,0x55,0x63]}]},
 fgR:{n:"read the fuel gauge",parts:[{a:0x36,rw:0,b:[0x02]},{a:0x36,rw:1,b:[...w16(Math.round(3.8/78.125e-6)),0x3E,0x00]}]}};
const hex=v=>"0x"+v.toString(16).toUpperCase().padStart(2,"0");
function xferDur(x){ let n=0; x.parts.forEach(p=>n+=9*(1+p.b.length)); return BIT/2+n*BIT+(x.parts.length-1)*1.5*BIT+BIT; }
/* transitions and the decoded frame for one transfer starting at t0 */
function xferBuild(x,t0){
  const scl=[], sda=[], dec=[], H=BIT/2, Q=BIT/4; let t=t0, lv=1;
  const setSda=(tt,v)=>{ if(v!==lv){ sda.push([tt,v]); lv=v; } };
  const who=WHO[x.parts[0].a]||["",""];
  setSda(t,0); dec.push([t,t+H,"S","st"]); t+=H; scl.push([t,0]);
  x.parts.forEach((p,pi)=>{
    if(pi){ setSda(t+Q,1); scl.push([t+H,1]); setSda(t+BIT,0); dec.push([t+H,t+BIT+H,"Sr","st"]); scl.push([t+BIT+H,0]); t+=BIT+H; }
    const bytes=[(p.a<<1)|p.rw,...p.b];
    bytes.forEach((b,bi)=>{ const tb=t;
      for(let k=7;k>=0;k--){ setSda(t+Q,(b>>k)&1); scl.push([t+H,1]); scl.push([t+BIT,0]); t+=BIT; }
      const ack=bi===0||!p.rw?0:bi===bytes.length-1?1:0, slave=bi===0||!p.rw;
      setSda(t+Q,ack); scl.push([t+H,1]); scl.push([t+BIT,0]);
      dec.push(bi===0?[tb,t,hex(p.a)+(p.rw?" R":" W"),"ad",p.rw?"U1 asks "+who[1]+" for data":"U1 writes to "+who[1]]:[tb,t,hex(b),"da",p.rw?who[1]+" sends":"U1 sends"]);
      dec.push([t,t+BIT,ack?"NACK":"ACK","ak",ack?"U1: last byte":slave?who[1]+" acknowledges":"U1 acknowledges"]); t+=BIT; });
  });
  setSda(t+Q,0); scl.push([t+H,1]); setSda(t+BIT,1); dec.push([t+H,t+BIT+H/2,"P","st"]);
  return {scl,sda,dec};
}
/* line voltage: rises through the pull-up (τ = R·C), falls through the driver */
function lineV(tr,t){
  let a=0,b=tr.length-1,i=-1; while(a<=b){ const m=(a+b)>>1; if(tr[m][0]<=t){ i=m; a=m+1; } else b=m-1; }
  if(i<0) return VDD;
  const [t1,l1]=tr[i], v0=i>0?(tr[i-1][1]?VDD*(1-Math.exp(-(t1-tr[i-1][0])/TAU_R)):0):VDD, d=t-t1;
  return l1?v0+(VDD-v0)*(1-Math.exp(-d/TAU_R)):v0*Math.exp(-d/TAU_F);
}

/* ---------- scenarios: a flat, sorted list of segments {t, d, p, x (transfer)} covering [0, L] ---------- */
const DAY=86400, WAKE_EVERY=60, T_PRESS=8*3600+30, T_PLUG=10, T_IN=5;
function wakeList(t,wifi,press){
  const out=[], add=(p,d,x)=>{ out.push({t,d,p:PH[p],x}); t+=d; };
  if(press) add("press",50*us);
  add("boot",.080);
  const bus=k=>{ const x=XFER[k], d=xferDur(x); out.push({t,d:d+100*us,p:PH.busy,x:{...x,t0:t+50*us,t1:t+50*us+d}}); t+=d+100*us; };
  bus("shtW"); add("shtM",8.2*ms); bus("shtR"); bus("bmpW"); add("bmpM",4*ms); bus("bmpR"); bus("fgR");
  if(wifi){ for(let k=0;k<5;k++){ add("wifi",.296); add("wifiTx",2*ms); } }
  add("spi",.010); add("refresh",.3); add("down",.002);
  return out;
}
function buildScen(id,wifi){
  const segs=[], gap=(t,p,to)=>{ if(to>t) segs.push({t,d:to-t,p:PH[p]}); };
  let L, q="Battery current";
  if(id==="day"){ L=DAY; let t=0;
    const starts=[]; for(let k=0;k<DAY/WAKE_EVERY;k++) starts.push([k*WAKE_EVERY,wifi&&k%60===0,false]); starts.push([T_PRESS,false,true]); starts.sort((a,b)=>a[0]-b[0]);
    starts.forEach(([s,w,pr])=>{ gap(t,"sleep",s); const ws=wakeList(s,w,pr); segs.push(...ws); t=ws[ws.length-1].t+ws[ws.length-1].d; });
    gap(t,"sleep",L);
    /* OK is held for 150 ms: split the segments it overlaps */
    const a=T_PRESS, b=T_PRESS+T_HELD;
    for(let i=0;i<segs.length;i++){ const s=segs[i], e=s.t+s.d; if(e<=a||s.t>=b||s.p.id==="press") continue;
      if(s.t<a){ segs.splice(i+1,0,{t:a,d:e-a,p:s.p,x:s.x}); s.d=a-s.t; continue; }
      if(e>b){ segs.splice(i+1,0,{t:b,d:e-b,p:s.p,x:s.x}); s.d=b-s.t; }
      s.p=held(s.p); }
  } else if(id==="usb"){ L=3600; q="Current from USB";
    segs.push({t:0,d:T_PLUG,p:PH.noUsb},{t:T_PLUG,d:1.2*ms,p:PH.plug},{t:T_PLUG+1.2*ms,d:L-T_PLUG-1.2*ms,p:PH.charge});
  } else { L=60; segs.push({t:0,d:T_IN,p:PH.noCell},{t:T_IN,d:L-T_IN,p:PH.rev}); }
  /* prefix charge, low and high */
  const n=segs.length, qa=new Float64Array(n+1), qb=new Float64Array(n+1), ts=new Float64Array(n);
  segs.forEach((s,i)=>{ ts[i]=s.t; qa[i+1]=qa[i]+s.p.I[0]*s.d; qb[i+1]=qb[i]+s.p.I[1]*s.d; });
  const xs=segs.filter(s=>s.x), xt=new Float64Array(xs.map(s=>s.x.t0));
  return {id,L,q,segs,ts,qa,qb,xs,xt,wifi};
}
const segAt=(S,t)=>{ let a=0,b=S.ts.length-1,i=0; while(a<=b){ const m=(a+b)>>1; if(S.ts[m]<=t){ i=m; a=m+1; } else b=m-1; } return i; };
function charge(S,t,k){ t=BC.clamp(t,0,S.L); const i=segAt(S,t), s=S.segs[i]; return (k?S.qb:S.qa)[i]+s.p.I[k]*(Math.min(t,s.t+s.d)-s.t); }
const avgOf=(S,a,b)=>[(charge(S,b,0)-charge(S,a,0))/(b-a),(charge(S,b,1)-charge(S,a,1))/(b-a)];
function xferAt(S,t){ let a=0,b=S.xt.length-1,i=-1; while(a<=b){ const m=(a+b)>>1; if(S.xt[m]<=t){ i=m; a=m+1; } else b=m-1; }
  for(const j of [i,i+1]){ const s=S.xs[j]; if(s&&t>=s.x.t0-60*us&&t<=s.x.t1+60*us) return s; } return null; }
function xferTr(s){ return s.x.tr||(s.x.tr=xferBuild(s.x,s.x.t0)); }

/* ---------- probe: voltages of the nets the model knows ---------- */
/* kinds: seg (constant per segment, from its currents), fn (v(t) with event times), bus (SDA/SCL) */
function probeDef(S,net){
  const day=S.id==="day", usb=S.id==="usb", rev=S.id==="rev";
  const vbat=p=>EST.voc-p.I[1]*(EST.rcell+EST.rq2);
  const seg=f=>({k:"seg",f}), konst=v=>seg(()=>v);
  if(rev){ const on=p=>p.id==="rev";
    return {"/BAT_N":seg(p=>on(p)?EST.voc:0),"VBAT":konst(0),"VSYS":konst(0),"+3V3":konst(0),"/LDO_OUT":konst(0),"GND":konst(0),"Net-(Q2-G)":konst(0),"/I2C_SDA":konst(0),"/I2C_SCL":konst(0),"/BTN2_N":konst(0),"/BTN_N":konst(0),"VBUS":konst(0),"Net-(D1-K)":konst(0),"Net-(D1-A)":konst(0)}[net]; }
  if(usb){ const on=p=>p.id!=="noUsb", chg=p=>p.id==="charge";
    const sys=p=>on(p)?4.4:vbat(PH.sleep)-PH.sleep.I[1]*EST.rbq;
    return {"VBUS":seg(p=>on(p)?5:0),"VSYS":seg(sys),"VBAT":seg(p=>chg(p)?EST.voc+I_CHG*(EST.rcell+EST.rq2):vbat(PH.sleep)),"Net-(Q2-G)":seg(p=>chg(p)?EST.voc+I_CHG*(EST.rcell+EST.rq2):vbat(PH.sleep)),
      "+3V3":seg(p=>VDD-p.I3[1]*EST.zldo),"/LDO_OUT":seg(p=>VDD-p.I3[1]*EST.zldo),"/USB_PGOOD_N":seg(p=>chg(p)?0:VDD),"Net-(D1-K)":seg(p=>chg(p)?0:sys(p)),"Net-(D1-A)":seg(p=>chg(p)?sys(p)-I_D1*2e3:sys(p)),
      "Net-(D5-A)":seg(p=>on(p)?2.6:0),"/I2C_SDA":konst(VDD),"/I2C_SCL":konst(VDD),"/BTN2_N":konst(VDD),"/BTN_N":konst(VDD),"GND":konst(0),"/BAT_N":seg(p=>chg(p)?I_CHG*EST.rq2:-PH.sleep.I[1]*EST.rq2)}[net]; }
  if(!day) return null;
  const tr=T_PRESS+T_HELD, btn={k:"fn",ev:[T_PRESS,tr],v:t=>t<T_PRESS?VDD:t<tr?VDD*Math.exp(-(t-T_PRESS)/TAU_PRESS):VDD*(1-Math.exp(-(t-tr)/TAU_REL))};
  const sys=p=>vbat(p)-p.I[1]*EST.rbq;
  return {"+3V3":seg(p=>VDD-p.I3[1]*EST.zldo),"/LDO_OUT":seg(p=>VDD-p.I3[1]*EST.zldo),"VBAT":seg(vbat),"Net-(Q2-G)":seg(vbat),"VSYS":seg(sys),"/BAT_N":seg(p=>-p.I[1]*EST.rq2),
    "/I2C_SDA":{k:"bus",l:"sda"},"/I2C_SCL":{k:"bus",l:"scl"},"/BTN2_N":btn,"/BTN_N":konst(VDD),"/BTN3_N":konst(VDD),"/USB_PGOOD_N":konst(VDD),"/BAT_ALRT_N":konst(VDD),
    "VBUS":konst(0),"GND":konst(0),"Net-(D1-K)":seg(sys),"Net-(D1-A)":seg(sys),"Net-(D5-A)":konst(0)}[net];
}
/* min and max of a probed net over [a, b] */
function env(S,D,a,b){
  if(D.k==="seg"){ let i=segAt(S,a), mn=1e9, mx=-1e9; for(;i<S.segs.length&&S.segs[i].t<b;i++){ const v=D.f(S.segs[i].p); if(v<mn) mn=v; if(v>mx) mx=v; } return [mn,mx]; }
  if(D.k==="fn"){ const vs=[D.v(a),D.v(b)]; D.ev.forEach(e=>{ if(e>a&&e<b){ vs.push(D.v(e-1e-12),D.v(e+1e-12)); } }); return [Math.min(...vs),Math.max(...vs)]; }
  return busEnv(S,D.l,a,b);
}
function busEnv(S,l,a,b){
  let mn=1e9, mx=-1e9, i=-1, lo2=0, hi2=S.xt.length-1;
  while(lo2<=hi2){ const m=(lo2+hi2)>>1; if(S.xt[m]<=b){ i=m; lo2=m+1; } else hi2=m-1; }
  for(;i>=0;i--){ const s=S.xs[i]; if(s.x.t1+5*TAU_R<a) break;
    if(b-a>20*BIT){ if(s.x.t0<b){ mn=0; mx=VDD; } break; }   /* a column wider than a few bits: the line spans the rails */
    const tr=xferTr(s)[l], vs=[lineV(tr,a),lineV(tr,b)]; for(const e of tr){ if(e[0]>b) break; if(e[0]>a) vs.push(lineV(tr,e[0])); }
    mn=Math.min(mn,...vs); mx=Math.max(mx,...vs); }
  if(mx<mn) return [VDD,VDD];
  return [mn,mx];
}
const busV=(S,l,t)=>busEnv(S,l,t,t)[0];

/* ---------- key numbers, all from the model ---------- */
function keyNums(S){
  const sl=PH.sleep, r13=sl.I3[1], bat=sl.I[1];
  const K={r13,bat,sleepLife:.6/bat/24/365.25,boot:PH.boot.I[1]};
  if(S.id==="day"){ const [a,b]=avgOf(S,0,S.L); K.avg=[a,b]; K.life=[.6/b/24,.6/a/24];
    const w=wakeList(0,false,false), e=w[w.length-1].t+w[w.length-1].d; let q=0, qb=0; w.forEach(s=>{ q+=s.p.I[1]*s.d; if(s.p.id==="boot") qb=s.p.I[1]*s.d; });
    K.wakeQ=q; K.wakeDur=e; K.wakeAvg=(q-bat*e)/WAKE_EVERY; K.bootShare=qb/q; }
  K.tr=(K70-K30)*TAU_R; K.trLo=(K70-K30)*EST.rp*EST.cbLo; K.trHi=(K70-K30)*EST.rp*EST.cbHi; K.cmax400=300*ns/((K70-K30)*EST.rp); K.cmax100=1000*ns/((K70-K30)*EST.rp);
  return K;
}

/* ---------- formatting ---------- */
const fI=(v,d=3)=>v===0?"0 A":BC.fmt(v,"A",d);
const fIr=(r,d=3)=>r[0]===r[1]||Math.abs(r[1]-r[0])/r[1]<.005?fI(r[1],d):fI(r[0],d).replace(/ .*/,"")+"–"+fI(r[1],d);
const fT=v=>BC.fmt(v,"s");
function originTxt(O,u){ const h=Math.floor(O/3600), m=Math.floor(O%3600/60), sec=O%60, d=Math.max(0,Math.round(-Math.log10(u*1000)));
  return `${h} h`+(O%3600||u<60?` ${String(m).padStart(2,"0")} min`:"")+(u<1?` ${sec.toFixed(d)} s`:""); }
function clock(t,span){ const h=Math.floor(t/3600), m=Math.floor(t%3600/60), s=t%60, d=BC.clamp(Math.ceil(-Math.log10(span||1))+3,0,10);
  let ss=s.toFixed(d); if(+ss>=60) ss=(59.9999999999).toFixed(d); const [i,f]=ss.split("."); return `${h} h ${String(m).padStart(2,"0")} min ${i.padStart(2,"0")}${f?"."+f.replace(/(\d{3})(?=\d)/g,"$1 "):""} s`; }

/* ---------- stories ---------- */
const sx=(k,S)=>S.xs.find(s=>s.x.t0>T_PRESS&&s.x.parts[0].a===0x44&&s.x.parts[0].rw===1);
const segFirst=(S,id,after)=>S.segs.find(s=>s.t>=after&&s.p.id.replace("+","")===id);
const STORIES=[
 {id:"ok",t:"Press OK",steps:[
  {h:"The button",sc:"day",w:()=>[T_PRESS-30*us,T_PRESS+70*us],c:()=>T_PRESS+8*us,probe:"/BTN2_N",refs:["SW2","R30","C28","R29"],nets:["/BTN2_N","/BTN2_SW"],m:[[5,"rc"],[12]],
   t:()=>"OK shorts BTN2_SW to ground, and C28 empties through R30 in about 10 µs (100 Ω × 100 nF). While OK is held, R29 draws 3.3 V / 100 kΩ = 33 µA."},
  {h:"Debounce",sc:"day",w:()=>[T_PRESS+T_HELD-.01,T_PRESS+T_HELD+.05],c:()=>T_PRESS+T_HELD-TAU_REL*Math.log(.25),probe:"/BTN2_N",refs:["R29","C28","SW2"],nets:["/BTN2_N"],m:[[5,"rc"]],
   t:()=>"On release R29 refills C28 with τ = 100 kΩ × 100 nF = 10 ms, so the line takes 14 ms to reach the ESP32's 0.75 × VDD input threshold. A bounce only restarts that slow rise, so IO5 sees one clean edge."},
  {h:"The wake line",sc:"day",w:()=>[T_PRESS-100*us,T_PRESS+400*us],c:()=>T_PRESS+30*us,probe:"/BTN2_N",refs:["U1","SW2"],nets:["/BTN2_N"],m:[[12]],
   t:()=>"BTN2_N goes to IO5, a low-power GPIO. The RTC domain watches it while the CPU is off, and a low level starts the wake."},
  {h:"The boot step",sc:"day",w:()=>[T_PRESS-.02,T_PRESS+.12],c:()=>T_PRESS+.04,probe:"+3V3",refs:["U1","U7","C8","C9"],nets:["+3V3"],m:[[9,"reg"]],
   t:K=>`Battery current jumps from ${fI(K.bat)} to about ${fI(K.boot,2)}, ${Math.round(K.boot/K.bat/100)*100} times more. +3V3 dips ${BC.fmt(PH.boot.I3[1]*EST.zldo,"V",2)} across an assumed 0.1 Ω output impedance.`},
  {h:"A sensor read",sc:"day",w:S=>{ const s=sx(0,S); return [s.x.t0-20*us,s.x.t1+20*us]; },c:S=>sx(0,S).x.t0+50*us,refs:["U2","R17","R18","U1"],nets:NET_I2C,m:[[12],[11]],
   t:(K,S)=>{ const s=sx(0,S); return `U1 reads six bytes from the SHT40 at 0x44: temperature and humidity, each with a CRC. At 100 kHz a bit takes 10 µs, so the read takes ${Math.round((s.x.t1-s.x.t0)/us)} µs.`; }},
  {h:"The display update",sc:"day",w:S=>{ const r=segFirst(S,"spi",T_PRESS); return [r.t-.03,r.t+.36]; },c:S=>segFirst(S,"refresh",T_PRESS).t+.15,refs:["J3","L1","Q1","D2","D3","D4","C19"],nets:NET_EPD_PWR,m:[[9],[12]],
   t:()=>"U1 sends the frame over SPI, then light-sleeps while BUSY is high. The panel's boost (Q1, L1, D2–D4) makes its ±20 V gate supplies; a partial refresh takes about 0.3 s at 1 to 1.4 mA."},
  {h:"Back to sleep",sc:"day",w:()=>[T_PRESS-35,T_PRESS+35],c:()=>T_PRESS+5,refs:["U1","U7"],nets:["/BTN_N","/BTN2_N","/ACC_INT1"],m:[[4]],
   t:K=>`One wake moves ${BC.fmt(K.wakeQ,"C",2)}, ${Math.round(K.bootShare*100)}% of it in the boot. Every 60 s, that adds ${fI(K.wakeAvg,2)} to the ${fI(K.bat)} of sleep.`}]},
 {id:"usb",t:"Plug in USB",steps:[
  {h:"VBUS arrives",sc:"usb",w:()=>[T_PLUG-2*ms,T_PLUG+6*ms],c:()=>T_PLUG+.5*ms,probe:"VBUS",refs:["J1","R1","R2"],nets:["VBUS","Net-(J1-CC1)","Net-(J1-CC2)"],m:[[20]],
   t:()=>"R1 and R2, 5.1 kΩ on CC1 and CC2, mark the board as a sink, so the port turns on 5 V."},
  {h:"The ESD clamp",sc:"usb",w:()=>[T_PLUG-2*ms,T_PLUG+6*ms],c:()=>T_PLUG+.5*ms,probe:"VBUS",refs:["U8","J1"],nets:["VBUS","/USB_D+","/USB_D-"],m:[[6]],
   t:()=>"U8 sits right behind J1. A static spike on VBUS or the data lines takes its short path to ground before it reaches U6 or the ESP32."},
  {h:"The charger starts",sc:"usb",w:()=>[T_PLUG-1*ms,T_PLUG+4*ms],c:()=>T_PLUG+1.5*ms,probe:"/USB_PGOOD_N",refs:["U6","R4","R5","R7","C2"],nets:["VBUS","Net-(U6-EN1)","/USB_PGOOD_N"],m:[[12]],
   t:()=>"R4 and R5 put 2.5 V on EN1 while EN2 is grounded: USB500 mode, a 475 mA input limit. After a 1.2 ms deglitch, U6 pulls USB_PGOOD_N low and IO1 sees the cable."},
  {h:"VSYS to 3.3 V",sc:"usb",w:()=>[T_PLUG-.01,T_PLUG+.03],c:()=>T_PLUG+.015,probe:"VSYS",refs:["U6","U7","R13","C3","C7","C16"],nets:["VSYS","/LDO_OUT","+3V3"],m:[[9,"reg"]],
   t:()=>`VSYS steps from the cell's 3.8 V to 4.4 V. U7 drops it to 3.3 V and R13 passes that to +3V3; at the ${fI(hi(F.c6Run),2)} the awake chip draws, U7 turns ${BC.fmt((4.4-VDD)*hi(F.c6Run),"W",2)} into heat.`},
  {h:"R9 sets the charge",sc:"usb",w:()=>[0,3600],c:()=>1800,probe:"VBAT",refs:["U6","R9","TH1","J2"],nets:["Net-(U6-ISET)","VBAT","Net-(U6-TS)"],m:[[9]],
   t:()=>`The charger divides its 890 AΩ constant by R9: 890 / 3.3 kΩ = ${Math.round(I_CHG/mA)} mA, 0.45 C for the 600 mAh cell. TH1 under the cell pauses charging outside 3.5 to 47 °C.`},
  {h:"Two LEDs",sc:"usb",w:()=>[T_PLUG-1*ms,T_PLUG+4*ms],c:()=>T_PLUG+2*ms,probe:"Net-(D1-K)",refs:["D5","R21","D1","R6"],nets:["Net-(D5-A)","Net-(D1-K)","Net-(D1-A)"],m:[[8,"led"]],
   t:()=>`Green D5 runs from VBUS: (5.0 − 2.6) V / 2 kΩ = 1.2 mA. Red D1 runs from VSYS and lights while CHG pulls its cathode low: (4.4 − 1.8) V / 2 kΩ = 1.3 mA. USB supplies ${Math.round(I_USB/mA)} mA in all, under the 475 mA limit.`}]},
 {id:"rev",t:"Battery in backwards",steps:[
  {h:"Which pin is which",sc:"rev",w:()=>[0,60],c:()=>2,refs:["J2"],nets:["VBAT","/BAT_N"],m:[[18]],
   t:()=>"J2 pin 2 should carry the cell's +, pin 1 its −. Cell makers don't agree on plug wiring, so a reversed cell is a real risk."},
  {h:"Q2 in the − lead",sc:"rev",w:()=>[0,60],c:()=>2,refs:["Q2","R11","J2"],nets:["/BAT_N","Net-(Q2-G)"],m:[[7]],
   t:()=>"Q2 is an N-MOSFET: drain on BAT_N (J2 pin 1), source on ground, and R11 (100 kΩ) ties its gate to VBAT."},
  {h:"The right way round",sc:"day",w:()=>[28800-.05,28800+.15],c:()=>28800+.04,probe:"/BAT_N",refs:["Q2","R11"],nets:["/BAT_N","Net-(Q2-G)"],m:[[7],[6]],
   t:()=>`Current returns through Q2 to the cell. Its body diode conducts first and lifts the gate about 3 V above the source, so the channel turns on and bypasses the diode. At ${fI(PH.boot.I[1],2)} it drops ${BC.fmt(PH.boot.I[1]*EST.rq2,"V",2)} (about 24 mΩ).`},
  {h:"Backwards: the gate",sc:"rev",w:()=>[0,60],c:()=>30,probe:"Net-(Q2-G)",refs:["Q2","R11","J2"],nets:["Net-(Q2-G)","/BAT_N"],m:[[7]],
   t:()=>"Now the cell's + is on the drain. The gate follows VBAT down to ground, so Vgs = 0 V, below the 0.65 V minimum threshold: the channel stays off."},
  {h:"Backwards: the diode",sc:"rev",w:()=>[0,60],c:()=>30,probe:"/BAT_N",refs:["Q2"],nets:["/BAT_N","GND"],m:[[6,"diode"]],
   t:()=>"The body diode points from source to drain. With the drain 3.8 V above the source it is reverse-biased, so at most 1 µA leaks (IDSS max). Fitted the other way round, Q2 would conduct through its diode."},
  {h:"Why the low side",sc:"rev",w:()=>[0,60],c:()=>30,refs:["Q2","R11"],nets:["Net-(Q2-G)"],m:[[7]],
   t:()=>"An N-channel FET turns on when its gate is above its source. In the − lead the source is ground, so the cell itself drives the gate and no charge pump is needed. Its 12 V Vgs limit is far above the cell's 4.2 V."}]},
 {id:"sleep",t:"Where the sleep current goes",steps:[
  {h:"The measuring point",sc:"day",w:()=>[28780,28820],c:()=>28790,refs:["R13","U7"],nets:["/LDO_OUT","+3V3"],budget:[],m:[[3]],
   t:()=>"Lift R13 and put an ammeter across its pads: everything on +3V3 runs through it. The budget below is datasheet typicals; a meter on a real board is the test."},
  {h:"The chip",sc:"day",w:()=>[28780,28820],c:()=>28790,refs:["U1"],nets:[],budget:["U1"],m:[[12]],
   t:()=>"The ESP32-C6 in deep sleep with its RTC timer running draws 7 µA, the largest share."},
  {h:"Sensors and panel",sc:"day",w:()=>[28780,28820],c:()=>28790,refs:["U2","U3","U4","J3"],nets:["/ACC_INT1"],budget:["U4","J3","U3","U2"],m:[[12]],
   t:()=>"The accelerometer stays awake to catch motion: 1 µA. The panel keeps its image unpowered, so its controller sleeps at 1 µA; the BMP580 and SHT40 sit below that."},
  {h:"Pull-ups",sc:"day",w:()=>[28780,28820],c:()=>28790,refs:["R17","R18","R12","R7","R14","R29","R24","R25","R26"],nets:NET_I2C,budget:["pu"],m:[[11]],
   t:K=>`Every pull-up idles high and draws nothing. One I²C line left low would draw 330 µA, ${Math.round(330*uA/K.bat)} times the whole budget.`},
  {h:"Before R13",sc:"day",w:()=>[28780,28820],c:()=>28790,refs:["U6","U5","U7"],nets:["VBAT","VSYS"],budget:["U6","U5","U7"],m:[[9]],
   t:()=>"The charger, fuel gauge and regulator draw from the battery side, so the meter on R13 never sees them."},
  {h:"The sum",sc:"day",w:()=>[0,DAY],c:()=>28790,refs:["R13","U7","U6","U5"],nets:["+3V3","VBAT"],budget:["all"],m:[[4]],
   t:K=>`R13 sees ${fI(K.r13)}; the cell supplies ${fI(K.bat)}. Asleep only, 600 mAh would last ${K.sleepLife.toFixed(1)} years; with a wake every 60 s the average is ${fIr(K.avg,2)}, about ${Math.round(K.life[0]/30.4)} months.`}]}];
TD.STORIES=STORIES;

/* ---------- view state ---------- */
const V={sc:"day",wifi:false,a:0,s:DAY,cur:T_PRESS-15,probing:false,probe:null,story:null,step:0,hold:false};
let S=null, K=null, cv=null, wrap=null, raf=0, anim=0, play=0, lastKey="", stats=[];
TD.time={V,stats,model:()=>({S,K,PH,F,EST,SLEEP}),probeV:(net,t)=>{ const D=probeDef(S,net); return D?env(S,D,t,t)[0]:null; },busV:(l,t)=>busV(S,l,t)};
function scen(id){ if(!S||S.id!==id||(id==="day"&&S.wifi!==V.wifi)){ S=buildScen(id,V.wifi); K=keyNums(S); V.sc=id; } return S; }
const MIN_S=2e-7;
function setView(a,s,o={}){
  s=BC.clamp(s,MIN_S,S.L); a=BC.clamp(a,-s*.02,S.L-s*.98);
  cancelAnimationFrame(anim);
  if(!o.anim||BC.reduced){ V.a=a; V.s=s; draw(); return; }
  const fa=V.a, fs=V.s, fc=fa+fs/2, tc=a+s/2, t0=performance.now();
  const step=t=>{ const k=Math.min(1,(t-t0)/420), e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2, ls=Math.log(fs)+(Math.log(s)-Math.log(fs))*e, ss=Math.exp(ls);
    /* centre moves in proportion to the zoom, so the target stays in view */
    const f=Math.abs(Math.log(s)-Math.log(fs))>1e-9?(ls-Math.log(fs))/(Math.log(s)-Math.log(fs)):e, c=fc+(tc-fc)*f;
    V.a=c-ss/2; V.s=ss; draw(); if(k<1) anim=requestAnimationFrame(step); };
  anim=requestAnimationFrame(step);
}
function zoomAt(f,frac){ const ta=V.a+frac*V.s, s=BC.clamp(V.s*f,MIN_S,S.L); setView(ta-frac*s,s); }
const curFrac=()=>V.cur>=V.a&&V.cur<=V.a+V.s?(V.cur-V.a)/V.s:.5;

/* ---------- drawing ---------- */
const PADL=54, PADR=10;
function lay(H){ const probe=V.probing; const ph=probe?Math.round(Math.min(96,H*.36)):0; return {top:16,bot:H-20-ph-(probe?6:0),pTop:H-20-ph,pBot:H-20,ax:H-20}; }
function draw(){ if(raf||!cv) return; raf=requestAnimationFrame(render); }
function niceStep(span,n){ const r=span/n, NT=[1,2,5,10,15,30,60,120,300,600,900,1800,3600,7200,10800,21600,43200];
  if(r>=1){ for(const v of NT) if(v>=r) return v; return 43200; }
  const p=Math.pow(10,Math.floor(Math.log10(r))), m=r/p; return (m<=1?1:m<=2?2:m<=5?5:10)*p; }
function axis(g,c,W,L){
  const step=niceStep(V.s,Math.max(3,(W-PADL-PADR)/96)), U=[[3600,"h"],[60,"min"],[1,"s"],[1e-3,"ms"],[1e-6,"µs"],[1e-9,"ns"]];
  const u=U.find(x=>step>=x[0]*.999)||U[5];
  const O=u[0]===3600?0:u[0]===60?Math.floor(V.a/3600)*3600:u[0]===1?Math.floor(V.a/60)*60:Math.floor(V.a/(u[0]*1000))*u[0]*1000;
  const X=t=>PADL+(t-V.a)/V.s*(W-PADL-PADR), dec=Math.max(0,-Math.floor(Math.log10(step/u[0]+1e-12)));
  g.font="11px 'IBM Plex Mono', monospace"; g.textAlign="center"; g.textBaseline="alphabetic";
  const k0=Math.ceil(V.a/step), k1=Math.floor((V.a+V.s)/step);
  for(let k=k0;k<=k1&&k-k0<60;k++){ const t=k*step, x=X(t); g.strokeStyle=c.line; g.beginPath(); g.moveTo(x,L.top); g.lineTo(x,L.bot); g.stroke();
    g.fillStyle=c.muted; g.fillText(((t-O)/u[0]).toFixed(dec)+" "+u[1],x,L.ax+14); }
  if(O>0){ g.textAlign="left"; g.fillStyle=c.muted; g.fillText("from "+originTxt(O,u[0]),PADL+2,L.top-4); }
  return X;
}
function render(){
  raf=0; const t0=performance.now();
  const {g,W,H}=BC.fit(cv), css=BC.css, c={ink:css("--ink"),muted:css("--muted"),line:css("--line"),acc:css("--accent"),soft:css("--trace-soft"),good:css("--good"),bg:css("--bg"),sunk:css("--sunk"),sg:css("--scope-grid"),sb:css("--scope-bg"),ph:css("--phosphor")};
  const L=lay(H), X=axis(g,c,W,L), PW=W-PADL-PADR, tOf=x=>V.a+(x-PADL)/PW*V.s;
  const xs=V.s<=1.5*ms?visXfers():[], mode=!xs.length?"cur":V.s<=5*us?"edge":"bus";
  g.save(); g.beginPath(); g.rect(PADL,0,PW,H); g.clip();
  if(mode==="cur"){ drawCurrent(g,c,L,X,PW,tOf); if(V.s<=1.5*ms&&S.id==="day"){ g.fillStyle=c.muted; g.textAlign="left"; g.fillText("No I²C traffic in this window.",PADL+8,L.top+14); } } else drawBus(g,c,L,X,PW,tOf,mode,xs);
  if(V.probing) drawProbe(g,c,L,PW,tOf);
  /* cursor */
  const cx=X(V.cur); if(cx>=PADL-1&&cx<=W-PADR+1){ g.strokeStyle=c.acc; g.lineWidth=1.5; g.beginPath(); g.moveTo(cx,2); g.lineTo(cx,L.ax); g.stroke(); g.lineWidth=1; }
  g.restore();
  if(mode==="cur") yAxisI(g,c,L); else { g.font="11px 'IBM Plex Mono', monospace"; g.textAlign="right"; g.textBaseline="middle"; yLbl.forEach(([l,y,col])=>{ g.fillStyle=col||c.muted; g.fillText(l,PADL-5,y); }); g.textBaseline="alphabetic"; }
  wrap.dataset.mode=mode; readout(mode);
  const dt=performance.now()-t0; stats.push(dt); if(stats.length>400) stats.shift();
}
/* current view: log axis, per-column min, max and average */
const YLO=1e-7, YHI=1;
function yI(L,v){ const k=(Math.log10(Math.max(v,YLO))-Math.log10(YLO))/(Math.log10(YHI)-Math.log10(YLO)); return L.bot-k*(L.bot-L.top); }
function yAxisI(g,c,L){ g.font="11px 'IBM Plex Mono', monospace"; g.textAlign="right"; g.textBaseline="middle";
  const lbl={"-7":"100 nA","-6":"1 µA","-5":"10 µA","-4":"100 µA","-3":"1 mA","-2":"10 mA","-1":"100 mA","0":"1 A"};
  for(let e=-7;e<=0;e++){ const y=yI(L,Math.pow(10,e)); if((L.bot-L.top)<110&&e%2) continue; g.fillStyle=c.muted; g.fillText(lbl[e],PADL-5,y); }
  g.textBaseline="alphabetic"; }
function drawCurrent(g,c,L,X,PW,tOf){
  g.font="11px 'IBM Plex Mono', monospace";
  for(let e=-7;e<=0;e++){ const y=yI(L,Math.pow(10,e)); g.strokeStyle=c.line; g.globalAlpha=.6; g.beginPath(); g.moveTo(PADL,y); g.lineTo(PADL+PW,y); g.stroke(); g.globalAlpha=1; }
  const n=Math.ceil(PW), mn=new Float64Array(n), mx=new Float64Array(n), av=new Float64Array(n), al=new Float64Array(n);
  let i=segAt(S,Math.max(0,V.a));
  for(let k=0;k<n;k++){ const a=tOf(PADL+k), b=tOf(PADL+k+1); if(b<=0||a>=S.L){ mn[k]=mx[k]=av[k]=al[k]=NaN; continue; }
    const aa=Math.max(a,0), bb=Math.min(b,S.L); let lo2=1e9, hi2=0;
    while(i>0&&S.segs[i].t>aa) i--; while(i<S.segs.length-1&&S.segs[i].t+S.segs[i].d<=aa) i++;
    for(let j=i;j<S.segs.length&&S.segs[j].t<bb;j++){ const v=S.segs[j].p.I[1]; if(v<lo2) lo2=v; if(v>hi2) hi2=v; }
    /* wider than a second per pixel: the line is a 10-minute running average, or it aliases against the 60 s wakes */
    const m=(aa+bb)/2, hw=bb-aa>1?Math.max(300,(bb-aa)/2):0, q=hw?avgOf(S,Math.max(0,m-hw),Math.min(S.L,m+hw)):avgOf(S,aa,bb);
    mn[k]=lo2; mx[k]=hi2; al[k]=q[0]; av[k]=q[1]; }
  /* envelope */
  g.fillStyle=c.ink; g.globalAlpha=.16; for(let k=0;k<n;k++) if(mx[k]>mn[k]*1.02){ const y1=yI(L,mx[k]), y0=yI(L,mn[k]); g.fillRect(PADL+k,y1,1,y0-y1); } g.globalAlpha=1;
  /* range band where a figure is a range */
  g.fillStyle=c.acc; g.globalAlpha=.3; for(let k=0;k<n;k++) if(av[k]>al[k]*1.003){ const y1=yI(L,av[k]), y0=yI(L,al[k]); g.fillRect(PADL+k,y1,1,Math.max(1,y0-y1)); } g.globalAlpha=1;
  g.strokeStyle=c.ink; g.lineWidth=1.6; g.beginPath(); let on=false;
  for(let k=0;k<n;k++){ if(isNaN(av[k])){ on=false; continue; } const y=yI(L,av[k]); if(!on){ g.moveTo(PADL+k,y); on=true; } else g.lineTo(PADL+k+.5,y); } g.stroke(); g.lineWidth=1;
  /* zero is off a log axis: mark it */
  if(av.some(v=>v===0)){ g.fillStyle=c.muted; g.textAlign="left"; const k=av.findIndex(v=>v===0); g.fillText("0 A",PADL+k+4,L.bot-4); }
  g.fillStyle=c.muted; g.textAlign="left"; g.fillText(V.s/PW>1?"shade: min to max · line: 10-min average":"",PADL+6,L.top+12);
  /* scenario average */
  if(S.id==="day"){ const y=yI(L,K.avg[1]); g.strokeStyle=c.acc; g.setLineDash([4,4]); g.beginPath(); g.moveTo(PADL,y); g.lineTo(PADL+PW,y); g.stroke(); g.setLineDash([]);
    g.fillStyle=c.acc; g.textAlign="right"; g.fillText("day average "+fIr(K.avg,2),PADL+PW-4,y-4); }
  /* phase labels where they fit */
  let j=segAt(S,Math.max(0,V.a)), cnt=0; g.textAlign="center";
  for(;j<S.segs.length&&S.segs[j].t<V.a+V.s&&cnt<300;j++,cnt++){ const s=S.segs[j], x0=X(s.t), x1=X(s.t+s.d);
    if(s.p.id!=="sleep"&&x1-x0>3){ g.strokeStyle=c.line; g.beginPath(); g.moveTo(x0,L.top); g.lineTo(x0,L.bot); g.stroke(); }
    const wpx=Math.min(x1,PADL+PW)-Math.max(x0,PADL); let name=s.x?"I²C: "+s.x.n:s.p.n;
    if(wpx<=g.measureText(name).width+8) name=s.x?(WHO[s.x.parts[0].a]||["",""])[1]:s.p.sh||"";
    if(name&&wpx>g.measureText(name).width+8){ g.fillStyle=c.muted; g.fillText(name,(Math.max(x0,PADL)+Math.min(x1,PADL+PW))/2,L.top-4); } }
}
function visXfers(){ const out=[]; let i=-1, a=0, b=S.xt.length-1, t1=V.a+V.s;
  while(a<=b){ const m=(a+b)>>1; if(S.xt[m]<=t1){ i=m; a=m+1; } else b=m-1; }
  for(;i>=0&&out.length<4;i--){ const s=S.xs[i]; if(s.x.t1+5*TAU_R<V.a) break; out.push(s); } return out; }
/* bus and edge views: SCL and SDA as analog traces, the decoded frame below */
let yLbl=[];
function drawBus(g,c,L,X,PW,tOf,mode,xs){ yLbl=[];
  const edge=mode==="edge", rows=edge?[["SCL","scl"],["SDA","sda"]]:[["SCL","scl"],["SDA","sda"]];
  const decH=edge?0:20, h=(L.bot-L.top-decH-8)/(edge?1:2);
  const lane=i=>edge?[L.top+4,L.top+4+h]:[L.top+i*h+4,L.top+(i+1)*h-4];
  const Y=(i,v)=>{ const [t,b]=lane(i); return b-(v/VDD)*(b-t); };
  g.font="11px 'IBM Plex Mono', monospace";
  if(edge){ [[.3,"30%"],[.7,"70%"],[0,"0 V"],[1,"3.3 V"]].forEach(([f,l])=>{ const y=Y(0,f*VDD); g.strokeStyle=c.line; g.setLineDash(f%1?[3,3]:[]); g.beginPath(); g.moveTo(PADL,y); g.lineTo(PADL+PW,y); g.stroke(); g.setLineDash([]);
    yLbl.push([l,y]); }); }
  rows.forEach(([nm,l],ri)=>{ const li=edge?0:ri;
    g.strokeStyle=ri?c.acc:c.ink; g.lineWidth=1.6; g.beginPath();
    for(let k=0;k<=PW;k++){ const [mn,mx]=busEnv(S,l,tOf(PADL+k),tOf(PADL+k+1)); const y0=Y(li,mn), y1=Y(li,mx); if(!k) g.moveTo(PADL,y1); g.lineTo(PADL+k,y1); if(y0-y1>1) g.lineTo(PADL+k,y0); }
    g.stroke(); g.lineWidth=1;
    if(edge){ g.fillStyle=ri?c.acc:c.ink; g.textAlign="right"; g.fillText(nm,PADL+PW-6-ri*40,L.bot-6); } else yLbl.push([nm,(lane(li)[0]+lane(li)[1])/2,ri?c.acc:c.ink]); });
  if(edge){ /* 30 and 70% crossings of every rising edge in view */
    xs.forEach(s=>{ const tr=xferTr(s); [["scl",c.ink],["sda",c.acc]].forEach(([l,col])=>tr[l].forEach(([t,v])=>{ if(!v||t>V.a+V.s||t+K70*TAU_R<V.a) return;
      const t3=t+K30*TAU_R, t7=t+K70*TAU_R, x3=X(t3), x7=X(t7), y3=Y(0,.3*VDD), y7=Y(0,.7*VDD);
      g.fillStyle=col; [[x3,y3],[x7,y7]].forEach(([x,y])=>{ g.beginPath(); g.arc(x,y,4,0,7); g.fill(); });
      g.strokeStyle=col; g.beginPath(); g.moveTo(x3,y7-14); g.lineTo(x7,y7-14); g.stroke();
      g.textAlign="center"; g.fillText("tr "+BC.fmt(t7-t3,"s",3),(x3+x7)/2,y7-18); })); });
    g.fillStyle=c.muted; g.textAlign="right"; g.fillText(`30–70% rise: R ${BC.fmt(EST.rp,"Ω",2)} × C ${BC.fmt(EST.cb,"F",2)} (estimate) × 0.847. Limits: 300 ns at 400 kHz, 1000 ns at 100 kHz`,PADL+PW-6,L.top+14);
    return; }
  /* decoded frame row */
  const y0=L.bot-decH+2, y1=L.bot-2;
  xs.forEach(s=>xferTr(s).dec.forEach(([a,b,txt,k])=>{ const x0=X(a), x1=X(b); if(x1<PADL||x0>PADL+PW) return;
    g.strokeStyle=k==="ak"?c.good:k==="st"?c.acc:c.ink; g.fillStyle=g.strokeStyle; g.globalAlpha=k==="st"?.25:.08; g.fillRect(x0,y0,x1-x0,y1-y0); g.globalAlpha=1;
    g.strokeRect(x0+.5,y0+.5,Math.max(1,x1-x0-1),y1-y0-1);
    if(x1-x0>g.measureText(txt).width+4){ g.textAlign="center"; g.fillStyle=c.ink; g.fillText(txt,(x0+x1)/2,y1-5); } }));
}
/* probe: the clicked net's voltage over the window, on a scope screen */
function drawProbe(g,c,L,PW,tOf){
  const y0=L.pTop, y1=L.pBot; g.fillStyle=c.sb; g.fillRect(PADL,y0,PW,y1-y0);
  g.strokeStyle=c.sg; for(let k=1;k<4;k++){ const y=y0+(y1-y0)*k/4; g.beginPath(); g.moveTo(PADL,y); g.lineTo(PADL+PW,y); g.stroke(); }
  g.font="11px 'IBM Plex Mono', monospace"; g.textAlign="left";
  const name=V.probe==null?null:TD.netName(V.probe), D=name?probeDef(S,name):null;
  if(!name||!D){ g.fillStyle=c.ph; g.fillText(name?name.replace(/^\//,"")+": not modelled":"Click a net on the board to probe it.",PADL+8,(y0+y1)/2+4); return; }
  const n=Math.ceil(PW), mn=new Float64Array(n), mx=new Float64Array(n); let lo2=1e9, hi2=-1e9;
  for(let k=0;k<n;k++){ const a=Math.max(0,tOf(PADL+k)), b=Math.min(S.L,tOf(PADL+k+1)); if(b<=a){ mn[k]=mx[k]=NaN; continue; } const e=env(S,D,a,b); mn[k]=e[0]; mx[k]=e[1]; lo2=Math.min(lo2,e[0]); hi2=Math.max(hi2,e[1]); }
  let span=hi2-lo2; if(span<1e-4){ const m=(hi2+lo2)/2; lo2=m-.05; hi2=m+.05; } else { lo2-=span*.12; hi2+=span*.12; }
  const Y=v=>y1-4-(v-lo2)/(hi2-lo2)*(y1-y0-8);
  g.strokeStyle=c.ph; g.lineWidth=1.5; g.beginPath(); let on=false;
  for(let k=0;k<n;k++){ if(isNaN(mn[k])){ on=false; continue; } const ya=Y(mx[k]), yb=Y(mn[k]); if(!on){ g.moveTo(PADL+k,ya); on=true; } else g.lineTo(PADL+k,ya); if(yb-ya>1) g.lineTo(PADL+k,yb); }
  g.stroke(); g.lineWidth=1;
  g.fillStyle=c.ph; g.fillText(name.replace(/^\//,"")+"  "+fV(hi2)+" … "+fV(lo2)+(D.k==="seg"&&/3V3|LDO|VBAT|VSYS|BAT_N|Q2/.test(name)?"  estimate":""),PADL+8,y0+13);
}
const fV=v=>Math.abs(v)<1e-7?"0 V":Math.abs(v)<.1?BC.fmt(v,"V",3):v.toFixed(Math.abs(v)<10?4:2).replace(/0+$/,"").replace(/\.$/,"")+" V";

/* ---------- readout and board sync ---------- */
function at(t){ const i=segAt(S,t), s=S.segs[i]; const x=xferAt(S,t); return {s,x}; }
function readout(mode){
  const r=$("#tdRead"); if(!r) return; const {s,x}=at(V.cur), p=s.p;
  let txt=`${clock(V.cur,V.s)} · ${x&&V.s<=1.5*ms?"I²C: "+x.x.n:p.n} · ${S.q[0].toLowerCase()+S.q.slice(1)} ${fIr(p.I,3)}`;
  if(x&&V.s<=1.5*ms){ const d=xferTr(x).dec.find(e=>V.cur>=e[0]&&V.cur<e[1]); txt+=` · SCL ${fV(busV(S,"scl",V.cur))}, SDA ${fV(busV(S,"sda",V.cur))}${d?" · "+d[2]+(d[4]?" ("+d[4]+")":""):""}`; }
  if(V.probing&&V.probe!=null){ const nm=TD.netName(V.probe), D=probeDef(S,nm); if(D) txt+=` · ${nm.replace(/^\//,"")} ${fV(env(S,D,V.cur,V.cur)[0])}`; }
  if(r.textContent!==txt) r.textContent=txt;
}
function boardFor(t){ const {s,x}=at(t);
  if(x&&t>=x.x.t0&&t<=x.x.t1){ const who=WHO[x.x.parts[0].a]; return {key:"x"+who[0],refs:[who[0],"R17","R18","U1"],nets:NET_I2C}; }
  return {key:s.p.id,refs:s.p.refs,nets:s.p.nets}; }
function syncBoard(force){ if(V.hold&&!force) return; const b=boardFor(V.cur); if(b.key===lastKey&&!force) return; lastKey=b.key; TD.show(b); }
function setCur(t,user){ V.cur=BC.clamp(t,0,S.L); if(user){ V.hold=false; syncBoard(); } draw(); }

/* ---------- stats line ---------- */
function statsLine(){ const el=$("#tdStats"); if(!el) return; K=keyNums(S);
  const est=`<span class="tdEst">datasheet-typical estimate, not a measurement</span>`;
  el.innerHTML=S.id==="day"?`<span>Average <b class="mono">${fIr(K.avg,2)}</b></span><span>600 mAh lasts <b class="mono">${Math.round(K.life[0])}–${Math.round(K.life[1])} days</b></span><span>asleep <b class="mono">${fI(K.bat)}</b></span>${est}`
   :S.id==="usb"?`<span>From USB <b class="mono">${fI(I_USB)}</b>, limit 475 mA</span><span>into the cell <b class="mono">${fI(I_CHG)}</b></span>${est}`
   :`<span>Leakage at most <b class="mono">1 µA</b> (Q2 IDSS max)</span>${est}`; }

/* ---------- markup ---------- */
TD.timeHTML=()=>`<section class="tdTime" id="tdTime" aria-label="Timeline">
  <div class="tdBar tdTBar" role="toolbar" aria-label="Timeline view">
   <select id="tdScen" aria-label="Scenario"><option value="day">On battery, one day</option><option value="usb">USB plugged in</option><option value="rev">Battery in backwards</option></select>
   <span class="tdPre" role="group" aria-label="Zoom to">${[["day","Day"],["wake","Wake"],["i2c","I²C"],["edge","Edge"]].map(([k,l])=>`<button type="button" class="btn" data-tpre="${k}">${l}</button>`).join("")}</span>
   <label class="tdTog tdWifiT"><input type="checkbox" id="tdWifi">Hourly Wi-Fi</label>
   <span class="sp"></span>
   <button type="button" class="btn tdProbeB" id="tdProbe" aria-pressed="false" title="Probe: click a net on the board">Probe</button>
   <button class="iconBtn" type="button" data-tz="out" aria-label="Zoom out in time" title="Zoom out (−)">−</button><button class="iconBtn" type="button" data-tz="in" aria-label="Zoom in in time" title="Zoom in (+)">+</button>
  </div>
  <div class="tdStory" id="tdStory" hidden></div>
  <div class="tdScope" id="tdScope" tabindex="0" role="application" aria-roledescription="timeline" aria-label="Battery current over time. Left and right move the cursor, Shift for bigger steps; plus and minus zoom around it; 0 shows the whole scenario." aria-describedby="tdRead"><canvas id="tdCv" aria-hidden="true"></canvas></div>
  <p class="tdRead label" id="tdRead" aria-live="polite"></p>
  <div class="tdStats label" id="tdStats"></div>
  <details class="tdSrc"><summary class="label">Where the numbers come from</summary>${srcTable()}<p class="label">Firmware here is an example sequence, not this board's code.</p></details>
 </section>`;
function srcTable(){
  const row=(a,b,v,s)=>`<tr><td>${esc(a)}</td><td>${esc(b)}</td><td>${v}</td><td>${esc(s)}</td></tr>`;
  const val=f=>Array.isArray(f[0])?fI(f[0][0],2).replace(/ .*/,"")+"–"+fI(f[0][1],2):fI(f[0],3);
  return `<table class="spec tdSrcT"><tbody>${Object.values(F).map(f=>row(f[1],f[2],val(f),f[3])).join("")}
   ${row("Bus","capacitance",`${Math.round(EST.cb*1e12)} pF`,`estimate: 49 mm of 0.15 mm track (≈ 6 pF) + 5 pins; range ${Math.round(EST.cbLo*1e12)}–${Math.round(EST.cbHi*1e12)} pF`)}
   ${row("RT9080","output impedance","0.1 Ω","estimate, for the +3V3 dip")}${row("Cell","3.8 V, 0.15 Ω","","estimate, mid charge, with its protection board")}
   ${row("Q2","on-resistance","24 mΩ","AO3400A datasheet, Vgs 2.5 V typ")}</tbody></table>`;
}

/* ---------- story panel ---------- */
TD.storyList=()=>`<section class="tdGrp tdStoriesL"><h3>Stories <span class="label">${STORIES.length}</span></h3><ol>${STORIES.map(s=>`<li><button type="button" class="tdItem" data-story="${s.id}"><span class="mono">${s.steps.length} st</span><span>${esc(s.t)}</span></button></li>`).join("")}</ol></section>`;
function budgetHTML(sel){
  const all=sel.includes("all"), r=SLEEP.filter(x=>x[2]==="r"), b=SLEEP.filter(x=>x[2]==="b");
  const line=([ref,k])=>`<tr class="${all||sel.includes(ref)?"on":""}"><td>${ref}</td><td>${esc(F[k][1])}, ${esc(F[k][2])}</td><td>${fI(hi(F[k]),3)}</td></tr>`;
  const sum=a=>a.reduce((s,[,k])=>s+hi(F[k]),0);
  return `<table class="spec tdBudget"><tbody>${r.map(line).join("")}<tr class="${all||sel.includes("pu")?"on":""}"><td>R…</td><td>Pull-ups, lines idle high</td><td>0 A</td></tr>
   <tr class="sum"><td>R13</td><td>Seen by a meter on R13</td><td>${fI(sum(r),3)}</td></tr>${b.map(line).join("")}
   <tr class="sum"><td>J2</td><td>From the cell</td><td>${fI(sum(r)+sum(b),4)}</td></tr></tbody></table>`;
}
function storyPanel(){
  const el=$("#tdStory"); if(!el) return; const st=V.story;
  $("#td")?.classList.toggle("storyOn",!!st);
  $$("#tdList [data-story]").forEach(b=>{ const on=st&&st.id===b.dataset.story; b.classList.toggle("on",!!on); if(on) b.setAttribute("aria-current","true"); else b.removeAttribute("aria-current"); });
  if(!st){ el.hidden=true; el.innerHTML=""; return; }
  const p=st.steps[V.step], n=st.steps.length, txt=p.t(K,S);
  const learn=p.m.map(([m,lab])=>{ const c=BC.DATA.M[m-1]; return c?`<a href="#m-${m}">Module ${m}: ${esc(c.title)}</a>${lab&&BC.LABS[lab]?` · <a href="#lab-${lab}">lab</a>`:""}`:""; }).join(" · ");
  el.hidden=false;
  el.innerHTML=`<div class="tdStH"><p class="label">Story · ${esc(st.t)} · ${V.step+1} of ${n}</p><button type="button" class="iconBtn" data-sclose aria-label="Close the story">×</button></div>
   <div class="tdStB"><h3>${esc(p.h)}</h3><p class="tdStT">${esc(txt)}</p>${p.budget?budgetHTML(p.budget):""}<p class="label tdStL">Learn it: ${learn}</p></div>
   <div class="tdStC"><button type="button" class="btn" data-sgo="-1"${V.step?"":" disabled"}>← Prev</button>
    <button type="button" class="btn" data-splay aria-pressed="${!!play}"${BC.reduced?` disabled title="Off under reduced motion"`:""}>${play?"Pause":"Play"}</button>
    <button type="button" class="btn" data-sgo="1"${V.step<n-1?"":" disabled"}>Next →</button>
    <span class="tdDots" role="group" aria-label="Steps">${st.steps.map((s,i)=>`<button type="button" data-sdot="${i}" aria-label="Step ${i+1}: ${esc(s.h)}"${i===V.step?` aria-current="step" class="on"`:""}></button>`).join("")}</span></div>`;
}
function goStep(i,o={}){
  const st=V.story; if(!st) return; V.step=BC.clamp(i,0,st.steps.length-1); const p=st.steps[V.step];
  if($("#tdScen")) $("#tdScen").value=p.sc; scen(p.sc); statsLine(); if($("#tdWifi")) $("#tdWifi").disabled=p.sc!=="day";
  const [a,b]=p.w(S); V.cur=p.c(S);
  if(p.probe){ V.probing=true; V.probe=p.probe; } else { V.probing=false; V.probe=null; }
  syncProbeBtn(); setView(a,b-a,{anim:!o.instant});
  V.hold=true; lastKey=""; TD.show({refs:p.refs,nets:p.nets}); if(!o.fromHash||TD.phone()) TD.focus(p.refs,o.instant);
  TD.setHash(`story/${st.id}/${V.step+1}`); storyPanel(); if(!o.quiet) BC.beep("click");
}
function openStory(id,step,o={}){ const st=STORIES.find(s=>s.id===id); if(!st) return false; stopPlay(); V.story=st; goStep(step,o);
  if(TD.phone()){ TD.sheet(null); requestAnimationFrame(()=>$(".tdBoard")?.scrollIntoView({block:"start"})); } return true; }
function closeStory(){ stopPlay(); V.story=null; V.hold=false; storyPanel(); TD.setHash(""); syncBoard(true); }
function stopPlay(){ clearInterval(play); play=0; }
function togglePlay(){ if(BC.reduced) return; if(play){ stopPlay(); storyPanel(); return; }
  play=setInterval(()=>{ if(!V.story||V.step>=V.story.steps.length-1){ stopPlay(); storyPanel(); return; } goStep(V.step+1,{quiet:true}); },6500); storyPanel(); }
TD.storyOpen=(arg,fromHash)=>{ const [id,n]=arg.split("/"); return openStory(id,(parseInt(n,10)||1)-1,{fromHash,instant:fromHash}); };

/* ---------- probe ---------- */
function syncProbeBtn(){ const b=$("#tdProbe"); if(b) b.setAttribute("aria-pressed",V.probing); TD.probing=V.probing; $("#td")?.classList.toggle("probing",V.probing); }
TD.onNet=n=>{ if(!V.probing) return; V.probe=n; draw(); };

/* ---------- presets ---------- */
function wakeNear(t){ let i=segAt(S,t); const s=S.segs; while(i<s.length&&s[i].p.id==="sleep") i++;
  let j=segAt(S,t); while(j>0&&s[j].p.id==="sleep") j--;
  const pick=(i<s.length&&(j<=0||Math.abs(s[i].t-t)<Math.abs(s[j].t-t)))?i:j; let a=pick; while(a>0&&s[a-1].p.id!=="sleep") a--; let b=pick; while(b<s.length-1&&s[b+1].p.id!=="sleep") b++; return [s[a].t,s[b].t+s[b].d]; }
function preset(k){
  if(S.id!=="day"&&k!=="day"){ scen("day"); $("#tdScen").value="day"; statsLine(); }
  if(k==="day"){ setView(0,S.L,{anim:true}); return; }
  const [wa,wb]=wakeNear(V.cur);
  if(k==="wake"){ const d=wb-wa; setView(wa-d*.08,d*1.2,{anim:true}); if(V.cur<wa||V.cur>wb) setCur(wa+.04,true); return; }
  const x=S.xs.find(s=>s.x.t0>=wa&&s.x.parts[0].rw===1)||S.xs.find(s=>s.x.t0>=wa); if(!x) return;
  if(k==="i2c"){ setView(x.x.t0-20*us,x.x.t1-x.x.t0+40*us,{anim:true}); setCur(x.x.t0+40*us,true); return; }
  const r=xferTr(x).scl.find(e=>e[1]===1); setView(r[0]-.4*us,2.6*us,{anim:true}); setCur(r[0]+K70*TAU_R,true);
}

/* ---------- mount and events ---------- */
TD.timeMount=function(host){
  cv=$("#tdCv"); wrap=$("#tdScope"); if(!cv) return;
  scen(V.sc); statsLine(); $("#tdScen").value=V.sc; $("#tdWifi").checked=V.wifi; $("#tdWifi").disabled=V.sc!=="day"; syncProbeBtn(); if(V.s>S.L) V.s=S.L; draw();
  host.addEventListener("click",e=>{ const t=e.target.closest("button"); if(!t) return;
    if(t.dataset.story){ openStory(t.dataset.story,0); }
    else if(t.dataset.tpre) preset(t.dataset.tpre);
    else if(t.dataset.tz) zoomAt(t.dataset.tz==="in"?1/3:3,curFrac());
    else if(t.id==="tdProbe"){ V.probing=!V.probing; if(!V.probing) V.probe=null; else if(TD.state.sel&&TD.state.sel.k==="net") V.probe=TD.state.sel.id; syncProbeBtn(); draw(); }
    else if(t.dataset.sgo) goStep(V.step+ +t.dataset.sgo);
    else if(t.dataset.sdot!==undefined) goStep(+t.dataset.sdot);
    else if(t.dataset.splay!==undefined) togglePlay();
    else if(t.dataset.sclose!==undefined) closeStory(); });
  $("#tdScen").addEventListener("change",e=>{ scen(e.target.value); $("#tdWifi").disabled=V.sc!=="day"; statsLine(); V.cur=Math.min(V.cur,S.L); setView(0,S.L); if(V.story) closeStory(); else syncBoard(true); });
  $("#tdWifi").addEventListener("change",e=>{ V.wifi=e.target.checked; scen("day"); statsLine(); draw(); });
  /* wheel, drag, pinch, click */
  const fracOf=x=>BC.clamp((x-PADL)/(cv.clientWidth-PADL-PADR),0,1);
  wrap.addEventListener("wheel",e=>{ e.preventDefault(); const r=cv.getBoundingClientRect(); cancelAnimationFrame(anim);
    if(Math.abs(e.deltaX)>Math.abs(e.deltaY)){ setView(V.a+e.deltaX*(e.deltaMode?33:1)/(cv.clientWidth-PADL-PADR)*V.s,V.s); return; }
    zoomAt(Math.pow(1.0025,e.deltaY*(e.deltaMode?33:1)),fracOf(e.clientX-r.left)); },{passive:false});
  const pts=new Map(); let moved=0, pinch=null;
  wrap.addEventListener("pointerdown",e=>{ try{ wrap.setPointerCapture(e.pointerId); }catch(_){} pts.set(e.pointerId,e.clientX); moved=0; cancelAnimationFrame(anim);
    if(pts.size===2){ const [a,b]=[...pts.values()]; pinch={d:Math.abs(a-b)||1}; } });
  wrap.addEventListener("pointermove",e=>{ if(!pts.has(e.pointerId)) return; const dx=e.clientX-pts.get(e.pointerId); pts.set(e.pointerId,e.clientX); moved+=Math.abs(dx);
    const r=cv.getBoundingClientRect();
    if(pts.size===2&&pinch){ const [a,b]=[...pts.values()], d=Math.abs(a-b)||1; zoomAt(pinch.d/d,fracOf((a+b)/2-r.left)); pinch.d=d; }
    else if(pts.size===1&&moved>4) setView(V.a-dx/(cv.clientWidth-PADL-PADR)*V.s,V.s); });
  const up=e=>{ if(!pts.has(e.pointerId)) return; const single=pts.size===1; pts.delete(e.pointerId); if(pts.size<2) pinch=null;
    if(single&&moved<=4&&e.type==="pointerup"){ const r=cv.getBoundingClientRect(); setCur(V.a+fracOf(e.clientX-r.left)*V.s,true); } };
  wrap.addEventListener("pointerup",up); wrap.addEventListener("pointercancel",up);
  wrap.addEventListener("keydown",e=>{ const k=e.key, st=V.s/(e.shiftKey?8:40);
    if(k==="ArrowLeft"||k==="ArrowRight"){ setCur(V.cur+(k==="ArrowLeft"?-st:st),true); if(V.cur<V.a||V.cur>V.a+V.s) setView(V.cur-V.s/2,V.s); }
    else if(k==="+"||k==="=") zoomAt(1/2,curFrac()); else if(k==="-"||k==="_") zoomAt(2,curFrac());
    else if(k==="0") setView(0,S.L); else if(k==="Home") setCur(V.a,true); else if(k==="End") setCur(V.a+V.s,true);
    else return; e.preventDefault(); });
  const ro=new ResizeObserver(()=>draw()); ro.observe(wrap);
  const mo=new MutationObserver(()=>draw()); mo.observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
  const mq=matchMedia("(prefers-color-scheme: dark)"), mqf=()=>draw(); mq.addEventListener("change",mqf);
  BC.leave.push(()=>{ ro.disconnect(); mo.disconnect(); mq.removeEventListener("change",mqf); stopPlay(); cancelAnimationFrame(raf); cancelAnimationFrame(anim); raf=0; cv=null; wrap=null; V.story=null; V.hold=false; lastKey=""; });
};
})();
