/* Ohmly practice problems. BC.PROBLEMS[module] = [template, ...]; a template is () => ({q, ans, unit, tol?, std?, si?, show?, steps}).
   ans is in base SI units. tol defaults to 0.02 (relative). std:true also accepts the nearest E12 or E24 value.
   si:false: ans is a plain number in the stated unit (mm, parts) or a code; no prefixes are parsed, and show is the answer as displayed (0603). */
(function(){
const BC=window.BC, {S,esc}=BC;
const XP=15;

/* ---------- SI parser: "4.7k", "15m", "2.2u", "2.2µ", "1M", "4k7", "1e-3", "470 ohm"; the unit suffix is ignored. NaN if invalid ---------- */
const PRE={p:1e-12,n:1e-9,u:1e-6,"µ":1e-6,"μ":1e-6,m:1e-3,k:1e3,K:1e3,M:1e6,G:1e9};
const UNIT=new Set(["","v","a","w","f","h","hz","s","r","ohm","ohms","ω"]);
const scale=s=>{ if(/^meg/i.test(s)&&UNIT.has(s.slice(3).toLowerCase())) return 1e6; if(s[0] in PRE&&UNIT.has(s.slice(1).toLowerCase())) return PRE[s[0]]; return UNIT.has(s.toLowerCase())?1:NaN; };
BC.parseSI = str=>{
  const s=String(str).replace(/[−–]/g,"-").trim().replace(/(?<=[a-zA-Zµμ\u03a9\u2126])\s+(?=[a-zA-Zµμ\u03a9\u2126])/g,"");   // "2.2 u F" -> "2.2 uF"
  let m=/^([+-]?)(\d+)([pnuµμmkKMGRr])(\d+)\s*([a-zA-ZΩω]*)$/.exec(s);          // 4k7, 2u2, 4R7
  if(m){ if(!UNIT.has(m[5].toLowerCase())) return NaN; return +(m[1]+m[2]+"."+m[4])*(/[Rr]/.test(m[3])?1:PRE[m[3]]); }
  m=/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*([a-zA-ZµμΩΩ%]*)$/.exec(s);
  if(!m) return NaN;
  const k=scale(m[2].replace("Ω","Ω")); return isNaN(k)?NaN:+m[1]*k;
};

/* ---------- standard values ---------- */
BC.E24=[10,11,12,13,15,16,18,20,22,24,27,30,33,36,39,43,47,51,56,62,68,75,82,91];
BC.nearestE = (v,series)=>{ const L=series===12?BC.E12:BC.E24, d=Math.pow(10,Math.floor(Math.log10(v))-1); let b=0,bd=1e9;
  for(const c of L.concat(100)){ const e=Math.abs(Math.log(c*d/v)); if(e<bd){bd=e;b=c*d;} } return +b.toPrecision(3); };
/* plain number with an optional unit word after it ("5.85 mm", "12 parts", "0603"); NaN if invalid */
BC.parseNum = str=>{ const m=/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*([a-zA-Z²]*)$/.exec(String(str).replace(/[−–]/g,"-").replace(",",".").trim()); return m?+m[1]:NaN; };
/* answer as text: SI values with a prefix, plain values as written */
const ansText=(v,p)=>p.si===false?(p.show!==undefined&&v===p.ans?p.show:String(+v.toPrecision(4)))+(p.unit?" "+p.unit:""):BC.fmt(v,p.unit);
BC.ansText=ansText;
/* is the number x an accepted answer to problem p? */
BC.grade = (x,p)=>{
  if(!isFinite(x)) return false;
  if(Math.abs(x-p.ans)<=(p.tol??.02)*Math.abs(p.ans)*(1+1e-9)) return true;
  return !!p.std&&[12,24].some(s=>Math.abs(x-BC.nearestE(p.ans,s))<=1e-3*Math.abs(x));
};

/* ---------- helpers for templates ---------- */
const f=(v,u,d=3)=>BC.fmt(v,u,d), pick=BC.pick, rE=(lo,hi)=>pick(BC.e12List(lo,hi));
const pl=(v,u)=>+v.toPrecision(3)+" "+u;   /* plain base-unit number, for squared units */
/* RKM codes as drawn on schematics: 4k7, 2R2, 100n, 2u2 */
const RL=[[1e6,"M","10⁶"],[1e3,"k","10³"],[1,"R","1"]], CL=[[1e-6,"u","10⁻⁶"],[1e-9,"n","10⁻⁹"],[1e-12,"p","10⁻¹²"]];
const rkm=(v,L)=>{ const [m,ch]=L.find(([m])=>v>=m*0.9999)||L[L.length-1], x=String(+(v/m).toPrecision(2)); return x.includes(".")?x.replace(".",ch):x+ch; };
const CODES=[["0201","0603",0.6,0.3],["0402","1005",1.0,0.5],["0603","1608",1.6,0.8],["0805","2012",2.0,1.25],["1206","3216",3.2,1.6],["1210","3225",3.2,2.5]];
const std=(r,u="Ω")=>{ const a=BC.nearestE(r,12), c=BC.nearestE(r,24); return `Standard values: nearest E12 is ${f(a,u)}, nearest E24 is ${f(c,u)}`; };

const T={
1:[
 ()=>{ const V=pick([3.3,5,9,12,24]), R=rE(100,10000), I=V/R;
   return {q:`A ${f(V,"V")} supply is connected across a ${f(R,"Ω")} resistor. What current flows, in amps?`, ans:I, unit:"A",
     steps:[`Ohm's law: I = V / R.`,`I = ${f(V,"V")} / ${f(R,"Ω")} = ${f(I,"A")}.`]}; },
 ()=>{ let R,I,P; do{ R=rE(47,4700); I=pick([5,10,20,50,100,200])/1000; P=I*I*R; }while(P>2||P<0.001);
   return {q:`A ${f(R,"Ω")} resistor carries ${f(I,"A")}. How much power does it dissipate, in watts?`, ans:P, unit:"W",
     steps:[`P = I² · R, because the current and resistance are known.`,`P = (${pl(I,"A")})² × ${f(R,"Ω")} = ${pl(I*I,"A²")} × ${f(R,"Ω")} = ${f(P,"W")}.`,
       `Voltage across it: V = I · R = ${f(I*R,"V")}. Check: V · I = ${f(I*R,"V")} × ${f(I,"A")} = ${f(I*R*I,"W")}.`]}; },
 ()=>{ const V=pick([5,9,12]), I=pick([2,3,5,8,12,15,20,25])/1000, R=V/I;
   return {q:`A series resistor must limit the current from a ${f(V,"V")} supply to ${f(I,"A")}. Calculate the resistance, then enter the nearest standard E12 or E24 value.`, ans:R, unit:"Ω", std:true,
     steps:[`R = V / I = ${f(V,"V")} / ${f(I,"A")} = ${f(R,"Ω")}.`,`${std(R)}.`,`With the E24 value the current becomes ${f(V,"V")} / ${f(BC.nearestE(R,24),"Ω")} = ${f(V/BC.nearestE(R,24),"A")}, which is ${+(Math.abs(V/BC.nearestE(R,24)/I-1)*100).toPrecision(2)}% off the target.`]}; },
 ()=>{ const V=pick([5,9,12,24]), P=pick([0.5,1,2,5]), R=V*V/P;
   return {q:`A heating element on a ${f(V,"V")} supply must dissipate ${f(P,"W")}. What resistance does it need, in ohms?`, ans:R, unit:"Ω",
     steps:[`P = V² / R, so R = V² / P.`,`R = (${f(V,"V")})² / ${f(P,"W")} = ${pl(V*V,"V²")} / ${pl(P,"W")} = ${f(R,"Ω")}.`,`Check: I = P / V = ${f(P/V,"A")}, and V / I = ${f(V,"V")} / ${f(P/V,"A")} = ${f(V/(P/V),"Ω")}.`]}; }
],
2:[
 ()=>{ const a=rE(100,10000), b=rE(100,10000), r=a*b/(a+b);
   return {q:`A ${f(a,"Ω")} and a ${f(b,"Ω")} resistor are connected in parallel. What is the combined resistance, in ohms?`, ans:r, unit:"Ω",
     steps:[`Two in parallel: R = R₁R₂ / (R₁ + R₂).`,`Product: ${f(a,"Ω")} × ${f(b,"Ω")} = ${pl(a*b,"Ω²")}. Sum: ${f(a,"Ω")} + ${f(b,"Ω")} = ${pl(a+b,"Ω")}.`,`R = ${pl(a*b,"Ω²")} / ${pl(a+b,"Ω")} = ${f(r,"Ω")}.`,`Check: it is below the smaller branch, ${f(Math.min(a,b),"Ω")}.`]}; },
 ()=>{ const V=pick([3.3,5,9,12,24]), a=rE(1000,100000), b=rE(1000,100000), o=V*b/(a+b);
   return {q:`A voltage divider has R₁ = ${f(a,"Ω")} on top, R₂ = ${f(b,"Ω")} to ground, and ${f(V,"V")} across both. What is the unloaded output voltage, in volts?`, ans:o, unit:"V",
     steps:[`Vout = Vin · R₂ / (R₁ + R₂).`,`R₁ + R₂ = ${f(a,"Ω")} + ${f(b,"Ω")} = ${f(a+b,"Ω")}. Ratio R₂ / (R₁ + R₂) = ${+(b/(a+b)).toPrecision(3)}.`,`Vout = ${f(V,"V")} × ${+(b/(a+b)).toPrecision(3)} = ${f(o,"V")}.`]}; },
 ()=>{ const [Vi,Vo]=pick([[5,3.3],[5,2.5],[9,3.3],[12,5],[12,3.3],[9,5],[24,5],[12,2.5]]), b=rE(1000,47000), a=b*(Vi/Vo-1);
   return {q:`Design a divider that turns ${f(Vi,"V")} into ${f(Vo,"V")}. R₂ to ground is ${f(b,"Ω")}. Calculate R₁, then enter the nearest standard E12 or E24 value.`, ans:a, unit:"Ω", std:true,
     steps:[`Vout / Vin = R₂ / (R₁ + R₂), so R₁ = R₂ · (Vin / Vout − 1).`,`R₁ = ${f(b,"Ω")} × (${f(Vi,"V")} / ${f(Vo,"V")} − 1) = ${f(b,"Ω")} × ${+(Vi/Vo-1).toPrecision(3)} = ${f(a,"Ω")}.`,`${std(a)}.`,`With the nearest E24 value the output is ${f(Vi*b/(BC.nearestE(a,24)+b),"V")}, a ${+(Math.abs(Vi*b/(BC.nearestE(a,24)+b)/Vo-1)*100).toPrecision(2)}% error.`]}; },
 ()=>{ const V=pick([3.3,5,9,12]), d=rE(1000,47000), L=rE(d,10*d), p=d*L/(d+L), o=V*p/(d+p), u=V/2;
   return {q:`A divider of two ${f(d,"Ω")} resistors runs from ${f(V,"V")}. A ${f(L,"Ω")} load is connected from the output to ground. What is the output voltage now, in volts?`, ans:o, unit:"V",
     steps:[`The load is in parallel with R₂: R₂ ‖ R_L = ${f(d,"Ω")} × ${f(L,"Ω")} / (${f(d,"Ω")} + ${f(L,"Ω")}) = ${f(p,"Ω")}.`,`That is the new lower leg. Vout = Vin · (R₂ ‖ R_L) / (R₁ + R₂ ‖ R_L) = ${f(V,"V")} × ${f(p,"Ω")} / (${f(d,"Ω")} + ${f(p,"Ω")}) = ${f(o,"V")}.`,`Unloaded it was ${f(u,"V")}, so the load pulls it down by ${+((u-o)/u*100).toPrecision(2)}%.`]}; }
],
3:[
 ()=>{ const n=pick([1.5,2,2.5,3,3.2,3.6,4,4.4,5,5.6]), s=pick([0.1,0.2,0.5,1,2,5]), v=n*s;
   return {q:`A waveform spans ${n} divisions from its lowest to its highest point on a scope set to ${f(s,"V")}/div. What is its peak-to-peak voltage, in volts?`, ans:v, unit:"V",
     steps:[`Vpp = divisions × volts per division.`,`Vpp = ${n} div × ${f(s,"V")}/div = ${f(v,"V")}.`,`For a wave centred on zero, the peak is half of that: ${f(v/2,"V")}.`]}; },
 ()=>{ const n=pick([2,2.5,4,5,8,10]), t=pick([1e-6,2e-6,5e-6,10e-6,20e-6,50e-6,100e-6,200e-6,500e-6,1e-3,5e-3,10e-3]), T=n*t, fr=1/T;
   return {q:`One full cycle spans ${n} divisions on a scope set to ${f(t,"s")}/div. What is the frequency, in hertz?`, ans:fr, unit:"Hz",
     steps:[`Period: T = divisions × time per division = ${n} div × ${f(t,"s")}/div = ${f(T,"s")}.`,`Frequency: f = 1 / T = 1 / ${f(T,"s")} = ${f(fr,"Hz")}.`]}; },
 ()=>{ const R=pick([0.1,0.47,1,4.7,10]), v=pick([12,24,38,45,60,85,120])/1000, I=v/R;
   return {q:`To read a load's current you put a ${f(R,"Ω")} resistor in series and measure ${f(v,"V")} across it. What current flows, in amps?`, ans:I, unit:"A",
     steps:[`Ohm's law on the sense resistor: I = V / R.`,`I = ${f(v,"V")} / ${f(R,"Ω")} = ${f(I,"A")}.`,`The resistor dissipates P = V · I = ${f(v,"V")} × ${f(I,"A")} = ${f(v*I,"W")}, and drops ${f(v,"V")} from the load's supply.`]}; },
 ()=>{ const V=pick([5,9,12,15]), L=pick([20,50,100,200])/1000; let R; do{ R=rE(10,1000); }while(V/R<1.5*L);
   const u=V/R, o=L*R;
   return {q:`A bench supply is set to ${f(V,"V")} with the current limit at ${f(L,"A")}. It drives a ${f(R,"Ω")} load. What voltage appears across the load, in volts?`, ans:o, unit:"V",
     steps:[`Without the limit the load would draw I = V / R = ${f(V,"V")} / ${f(R,"Ω")} = ${f(u,"A")}.`,`That is above ${f(L,"A")}, so the supply switches to constant-current mode and holds I = ${f(L,"A")}.`,`The load voltage falls to V = I · R = ${f(L,"A")} × ${f(R,"Ω")} = ${f(o,"V")}.`]}; }
],
4:[
 ()=>{ const C=["black","brown","red","orange","yellow","green","blue","violet","grey","white"], v=pick(BC.E24), m=pick([0,1,2,3,4,5]), t=pick([["gold",5],["silver",10]]), R=v*Math.pow(10,m), a=Math.floor(v/10), b=v%10;
   return {q:`A 4-band resistor reads ${C[a]}, ${C[b]}, ${C[m]}, ${t[0]}. What is its nominal value, in ohms?`, ans:R, unit:"Ω",
     steps:[`Bands 1 and 2 are digits: ${C[a]} = ${a}, ${C[b]} = ${b}, giving ${v}.`,`Band 3 is the multiplier: ${C[m]} = × 10${m===0?"⁰":m===1?"¹":m===2?"²":m===3?"³":m===4?"⁴":"⁵"} = × ${Math.pow(10,m)}.`,`Value = ${v} × ${Math.pow(10,m)} Ω = ${f(R,"Ω")}.`,`${t[0]} means ±${t[1]}%, so a good part measures between ${f(R*(1-t[1]/100),"Ω")} and ${f(R*(1+t[1]/100),"Ω")}.`]}; },
 ()=>{ const v=pick([10,12,15,22,33,39,47,68,82]), e=pick([1,2,3,4,5]), code=""+v+e, pF=v*Math.pow(10,e), F=pF*1e-12;
   return {q:`A ceramic capacitor is marked ${code}. What is its value, in farads?`, ans:F, unit:"F",
     steps:[`The first two digits are the value and the last digit is the number of zeros, in picofarads: ${v} followed by ${e} zeros.`,`${v} × 10${["","¹","²","³","⁴","⁵"][e]} pF = ${pl(pF,"pF")} = ${f(pF*1e-12,"F")}.`,`Check: 1000 pF = 1 nF, so ${pl(pF,"pF")} = ${+(pF/1000).toPrecision(3)} nF.`]}; },
 ()=>{ const R=rE(100,1e6), t=pick([1,2,5,10]), hi=pick([true,false]), a=hi?R*(1+t/100):R*(1-t/100);
   return {q:`A ${f(R,"Ω")} resistor has a tolerance of ±${t}%. What is the ${hi?"highest":"lowest"} resistance it can have while still within tolerance, in ohms?`, ans:a, unit:"Ω", tol:.004,
     steps:[`Tolerance band: ±${t}% of ${f(R,"Ω")} = ±${f(R*t/100,"Ω")}.`,hi?`Highest: ${f(R,"Ω")} + ${f(R*t/100,"Ω")} = ${f(a,"Ω")}.`:`Lowest: ${f(R,"Ω")} − ${f(R*t/100,"Ω")} = ${f(a,"Ω")}.`,`So a good part measures from ${f(R*(1-t/100),"Ω")} to ${f(R*(1+t/100),"Ω")}.`]}; },
 ()=>{ let V,Ri,R; do{ V=pick([1.5,3,3.7,9]); Ri=pick([0.2,0.5,1,2,5]); R=rE(2,100); }while(Ri/(R+Ri)<0.06||Ri/(R+Ri)>0.5);
   const I=V/(R+Ri), Vt=V-I*Ri;
   return {q:`A battery has an open-circuit voltage of ${f(V,"V")} and an internal resistance of ${f(Ri,"Ω")}. A ${f(R,"Ω")} load is connected. What is the voltage at the battery terminals, in volts?`, ans:Vt, unit:"V",
     steps:[`The internal resistance is in series with the load, so I = V / (R_i + R_L) = ${f(V,"V")} / (${f(Ri,"Ω")} + ${f(R,"Ω")}) = ${f(I,"A")}.`,`Drop inside the battery: ${f(I,"A")} × ${f(Ri,"Ω")} = ${f(I*Ri,"V")}.`,`Terminal voltage: ${f(V,"V")} − ${f(I*Ri,"V")} = ${f(Vt,"V")}. Check: I × R_L = ${f(I,"A")} × ${f(R,"Ω")} = ${f(I*R,"V")}.`]}; }
],
5:[
 ()=>{ const R=rE(1000,1e6), C=pick([100e-9,220e-9,1e-6,4.7e-6,10e-6,47e-6,100e-6]), p=pick([50,70,80,90,95]), tau=R*C, t=-tau*Math.log(1-p/100);
   return {q:`A ${f(C,"F")} capacitor charges from 0 V through ${f(R,"Ω")}. How long until it reaches ${p}% of the supply, in seconds?`, ans:t, unit:"s",
     steps:[`Time constant: τ = R · C = ${f(R,"Ω")} × ${f(C,"F")} = ${f(tau,"s")}.`,`Charging: V/Vs = 1 − e^(−t/τ) = ${p/100}, so e^(−t/τ) = ${+(1-p/100).toPrecision(3)}.`,`t = −τ · ln(${+(1-p/100).toPrecision(3)}) = ${f(tau,"s")} × ${+(-Math.log(1-p/100)).toPrecision(3)} = ${f(t,"s")}.`,`That is ${+(t/tau).toPrecision(3)} time constants.`]}; },
 ()=>{ const C=pick([100e-9,470e-9,1e-6,4.7e-6,10e-6,100e-6]); let t,R; do{ t=pick([0.05,0.1,0.2,0.5,1,2,5,10]); R=t/C; }while(R<1e3||R>1e7);
   return {q:`A timer needs a time constant of ${f(t,"s")} with a ${f(C,"F")} capacitor. Calculate R, then enter the nearest standard E12 or E24 value.`, ans:R, unit:"Ω", std:true,
     steps:[`τ = R · C, so R = τ / C.`,`R = ${f(t,"s")} / ${f(C,"F")} = ${f(R,"Ω")}.`,`${std(R)}.`,`With the E24 value, τ = ${f(BC.nearestE(R,24),"Ω")} × ${f(C,"F")} = ${f(BC.nearestE(R,24)*C,"s")}. Capacitor tolerance (often ±10% or more) will shift it further.`]}; },
 ()=>{ const V=pick([3.3,5,9,12]), R=rE(1000,100000), C=pick([1e-6,4.7e-6,10e-6,47e-6,100e-6]), k=pick([0.5,1,1.5,2,3]), tau=R*C, t=k*tau, v=V*Math.exp(-k);
   return {q:`A ${f(C,"F")} capacitor charged to ${f(V,"V")} discharges through ${f(R,"Ω")}. What is its voltage after ${f(t,"s")}, in volts?`, ans:v, unit:"V",
     steps:[`τ = R · C = ${f(R,"Ω")} × ${f(C,"F")} = ${f(tau,"s")}.`,`t / τ = ${f(t,"s")} / ${f(tau,"s")} = ${k}.`,`Discharging: V(t) = V · e^(−t/τ) = ${f(V,"V")} × e^(−${k}) = ${f(V,"V")} × ${+Math.exp(-k).toPrecision(3)} = ${f(v,"V")}.`]}; },
 ()=>{ const L=[100e-9,220e-9,470e-9,1e-6,2.2e-6,4.7e-6,10e-6,47e-6,100e-6]; let a=pick(L), b=pick(L); const s=a*b/(a+b);
   return {q:`Two capacitors, ${f(a,"F")} and ${f(b,"F")}, are connected in series. What is the combined capacitance, in farads?`, ans:s, unit:"F",
     steps:[`Series capacitors combine like parallel resistors: C = C₁C₂ / (C₁ + C₂).`,`Product: ${f(a,"F")} × ${f(b,"F")} = ${pl(a*b*1e12,"µF²")}. Sum: ${f(a,"F")} + ${f(b,"F")} = ${f(a+b,"F")}.`,`C = ${f(s,"F")}.`,`Check: it is below the smaller one, ${f(Math.min(a,b),"F")}.`]}; }
],
6:[
 ()=>{ const Vs=pick([3.3,5,9,12]), d=pick([["silicon diode",0.7],["Schottky diode",0.3]]), R=rE(100,10000), I=(Vs-d[1])/R;
   return {q:`A ${f(Vs,"V")} supply drives a ${d[0]} (assume it drops ${f(d[1],"V")}) in series with ${f(R,"Ω")}. What current flows, in amps?`, ans:I, unit:"A",
     steps:[`The diode drops ${f(d[1],"V")}, so the resistor gets ${f(Vs,"V")} − ${f(d[1],"V")} = ${f(Vs-d[1],"V")}.`,`I = ${f(Vs-d[1],"V")} / ${f(R,"Ω")} = ${f(I,"A")}.`,`Diode power: P = Vf · I = ${f(d[1],"V")} × ${f(I,"A")} = ${f(d[1]*I,"W")}.`]}; },
 ()=>{ let Vz,Vs; do{ Vz=pick([3.3,4.7,5.1,6.2,9.1]); Vs=pick([9,12,15,24]); }while(Vs-Vz<3); const I=pick([5,10,15,20])/1000, R=(Vs-Vz)/I;
   return {q:`A ${f(Vz,"V")} Zener must run from ${f(Vs,"V")} with ${f(I,"A")} flowing through it (no load). Calculate the series resistor, then enter the nearest standard E12 or E24 value.`, ans:R, unit:"Ω", std:true,
     steps:[`The resistor drops the difference: ${f(Vs,"V")} − ${f(Vz,"V")} = ${f(Vs-Vz,"V")}.`,`R = (Vs − Vz) / I = ${f(Vs-Vz,"V")} / ${f(I,"A")} = ${f(R,"Ω")}.`,`${std(R)}.`,`Resistor power: ${f(Vs-Vz,"V")} × ${f(I,"A")} = ${f((Vs-Vz)*I,"W")}. Zener power: ${f(Vz,"V")} × ${f(I,"A")} = ${f(Vz*I,"W")}.`]}; },
 ()=>{ const Vz=pick([3.3,5.1,6.2,9.1]), Vs=pick([12,15,24]), R=rE(220,2200), IR=(Vs-Vz)/R, IL=+(IR*pick([0.2,0.4,0.6,0.8])).toPrecision(2), Iz=IR-IL;
   return {q:`A ${f(Vz,"V")} Zener is fed from ${f(Vs,"V")} through ${f(R,"Ω")}. A load draws ${f(IL,"A")} from the Zener voltage. How much current flows through the Zener, in amps?`, ans:Iz, unit:"A",
     steps:[`Current through the resistor: (${f(Vs,"V")} − ${f(Vz,"V")}) / ${f(R,"Ω")} = ${f(IR,"A")}.`,`That current splits between the load and the Zener: Iz = ${f(IR,"A")} − ${f(IL,"A")} = ${f(Iz,"A")}.`,`Zener power: ${f(Vz,"V")} × ${f(Iz,"A")} = ${f(Vz*Iz,"W")}. With the load removed, all ${f(IR,"A")} goes through it.`]}; },
 ()=>{ const I=pick([0.1,0.2,0.3,0.5,1,2]), d=pick([["silicon rectifier diode",0.7],["Schottky diode",0.35]]), V=pick([9,12]), P=d[1]*I;
   return {q:`A ${f(V,"V")} battery feeds a circuit drawing ${f(I,"A")} through a ${d[0]} that drops ${f(d[1],"V")} (reverse-polarity protection). How much power does the diode dissipate, in watts?`, ans:P, unit:"W",
     steps:[`Diode power: P = Vf · I = ${f(d[1],"V")} × ${f(I,"A")} = ${f(P,"W")}.`,`The circuit sees ${f(V,"V")} − ${f(d[1],"V")} = ${f(V-d[1],"V")}.`,`The loss is ${+(P/(V*I)*100).toPrecision(2)}% of the ${f(V*I,"W")} the battery supplies.`]}; }
],
7:[
 ()=>{ const Vin=pick([3.3,5]), Ic=pick([20,50,80,100,150,200])/1000, Ib=Ic/10, R=(Vin-0.7)/Ib, lo=BC.e12Down(R);
   return {q:`An NPN switch must carry ${f(Ic,"A")}. It is driven from ${f(Vin,"V")} with a forced gain of 10. Calculate the base resistor, then enter the nearest standard E12 or E24 value.`, ans:R, unit:"Ω", std:true,
     steps:[`Base current for forced gain 10: Ib = Ic / 10 = ${f(Ic,"A")} / 10 = ${f(Ib,"A")}.`,`Rb = (Vin − 0.7 V) / Ib = (${f(Vin,"V")} − 0.7 V) / ${f(Ib,"A")} = ${f(R,"Ω")}.`,`${std(R)}.`,`Rounding down to ${f(lo,"Ω")} gives Ib = ${f((Vin-0.7)/lo,"A")}, a forced gain of ${+(Ic/((Vin-0.7)/lo)).toPrecision(2)}. That is extra margin for saturation.`]}; },
 ()=>{ let I,r,R,P; do{ I=pick([1,2,3,5,8,10]); r=pick([5,10,20,50,100]); R=r/1000; P=I*I*R; }while(P>1.5);
   return {q:`A logic-level MOSFET with Rds(on) = ${f(R,"Ω")} switches ${f(I,"A")}. How much power does it dissipate, in watts?`, ans:P, unit:"W",
     steps:[`P = I² · Rds(on) = (${pl(I,"A")})² × ${f(R,"Ω")} = ${pl(I*I,"A²")} × ${f(R,"Ω")} = ${f(P,"W")}.`,`Voltage across the switch: ${f(I,"A")} × ${f(R,"Ω")} = ${f(I*R,"V")}.`,`With θJA = 60 °C/W the part warms by ${f(P,"W")} × 60 °C/W = ${+(P*60).toPrecision(2)} °C.`]}; },
 ()=>{ let Vcc,Rl,Ic; do{ Vcc=pick([5,12,24]); Rl=rE(47,1000); Ic=(Vcc-0.2)/Rl; }while(Ic<0.01||Ic>0.3);
   const Ib=Ic/10;
   return {q:`An NPN transistor, saturated with Vce ≈ 0.2 V, switches a ${f(Rl,"Ω")} relay coil from ${f(Vcc,"V")}. With a forced gain of 10, what base current is needed, in amps?`, ans:Ib, unit:"A",
     steps:[`Collector current: Ic = (Vcc − Vce(sat)) / R = (${f(Vcc,"V")} − 0.2 V) / ${f(Rl,"Ω")} = ${f(Ic,"A")}.`,`Forced gain 10: Ib = Ic / 10 = ${f(Ic,"A")} / 10 = ${f(Ib,"A")}.`,`Switch dissipation: 0.2 V × ${f(Ic,"A")} = ${f(0.2*Ic,"W")}.`]}; },
 ()=>{ const Vin=pick([3.3,5]), Rb=rE(330,4700), Ic=pick([20,50,100,150])/1000, Ib=(Vin-0.7)/Rb, g=Ic/Ib;
   return {q:`A ${f(Vin,"V")} pin drives an NPN base through ${f(Rb,"Ω")}. The load needs ${f(Ic,"A")}. What base current flows, in amps?`, ans:Ib, unit:"A",
     steps:[`The base-emitter junction drops about 0.7 V, so the resistor has ${f(Vin,"V")} − 0.7 V = ${f(Vin-0.7,"V")}.`,`Ib = ${f(Vin-0.7,"V")} / ${f(Rb,"Ω")} = ${f(Ib,"A")}.`,`Forced gain: Ic / Ib = ${f(Ic,"A")} / ${f(Ib,"A")} = ${+g.toPrecision(2)}. ${g>10?"That is above the design value of 10, so the transistor may not saturate fully. A smaller Rb would fix it.":"That is at or below 10, so the transistor saturates."}`]}; }
],
8:[
 ()=>{ let Vs,L,I; do{ Vs=pick([3.3,5,9,12]); L=pick([["red",2],["green",2.2],["blue",3.1],["white",3.2]]); }while(Vs-L[1]<1);
   I=pick([5,10,15,20])/1000; const R=(Vs-L[1])/I;
   return {q:`A ${L[0]} LED (Vf = ${f(L[1],"V")}) runs from ${f(Vs,"V")} at ${f(I,"A")}. Calculate the series resistor, then enter the nearest standard E12 or E24 value.`, ans:R, unit:"Ω", std:true,
     steps:[`The resistor drops the rest: ${f(Vs,"V")} − ${f(L[1],"V")} = ${f(Vs-L[1],"V")}.`,`R = ${f(Vs-L[1],"V")} / ${f(I,"A")} = ${f(R,"Ω")}.`,`${std(R)}.`,`Resistor power: ${f(Vs-L[1],"V")} × ${f(I,"A")} = ${f((Vs-L[1])*I,"W")}.`]}; },
 ()=>{ let Vs,L,R,I; do{ Vs=pick([5,9,12]); L=pick([["red",2],["green",2.2],["blue",3.1],["white",3.2]]); R=rE(150,2200); I=(Vs-L[1])/R; }while(I<0.002||I>0.03);
   return {q:`A ${L[0]} LED (Vf = ${f(L[1],"V")}) is wired to ${f(Vs,"V")} through ${f(R,"Ω")}. What current flows, in amps?`, ans:I, unit:"A",
     steps:[`Voltage across the resistor: ${f(Vs,"V")} − ${f(L[1],"V")} = ${f(Vs-L[1],"V")}.`,`I = ${f(Vs-L[1],"V")} / ${f(R,"Ω")} = ${f(I,"A")}.`,`Resistor power: I² · R = ${f(I*I*R,"W")}, well inside a ¼ W part.`]}; },
 ()=>{ let Vs,n,L; do{ Vs=pick([9,12,24]); n=pick([2,3,4,5,6]); L=pick([["red",2],["white",3.2],["green",2.2]]); }while(Vs-n*L[1]<1.5);
   const I=pick([10,15,20])/1000, R=(Vs-n*L[1])/I;
   return {q:`${n} ${L[0]} LEDs (Vf = ${f(L[1],"V")} each) are wired in series from ${f(Vs,"V")} at ${f(I,"A")}. Calculate the series resistor, then enter the nearest standard E12 or E24 value.`, ans:R, unit:"Ω", std:true,
     steps:[`Combined forward voltage: ${n} × ${f(L[1],"V")} = ${f(n*L[1],"V")}.`,`R = (Vs − n · Vf) / I = (${f(Vs,"V")} − ${f(n*L[1],"V")}) / ${f(I,"A")} = ${f(R,"Ω")}.`,`${std(R)}.`,`The LEDs use ${+(n*L[1]/Vs*100).toPrecision(2)}% of the supply power. The resistor wastes the rest.`]}; },
 ()=>{ const Vcc=pick([3.3,5]), Rf=rE(1000,100000), br=pick([true,false]), Rl=br?pick([1000,2200,4700,10000]):pick([100000,470000,1e6]), v=Vcc*Rf/(Rf+Rl);
   return {q:`A photoresistor sits between ${f(Vcc,"V")} and the output, with a fixed ${f(Rf,"Ω")} resistor from the output to ground. In ${br?"bright light":"the dark"} the photoresistor measures ${f(Rl,"Ω")}. What is the output voltage, in volts?`, ans:v, unit:"V",
     steps:[`Voltage divider: Vout = Vcc · Rfixed / (Rldr + Rfixed).`,`Vout = ${f(Vcc,"V")} × ${f(Rf,"Ω")} / (${f(Rl,"Ω")} + ${f(Rf,"Ω")}) = ${f(Vcc,"V")} × ${+(Rf/(Rf+Rl)).toPrecision(3)} = ${f(v,"V")}.`,`Light lowers the photoresistor's resistance, so the output rises with brightness in this arrangement.`]}; }
],
9:[
 ()=>{ const I=pick([0.1,0.2,0.5,1,2]), C=pick([1000e-6,2200e-6,3300e-6,4700e-6,10000e-6]), m=pick([50,60]), fr=2*m, dV=I/(fr*C);
   return {q:`A full-wave rectifier on ${m} Hz mains feeds a ${f(I,"A")} load through a ${f(C,"F")} smoothing capacitor. Estimate the peak-to-peak ripple, in volts.`, ans:dV, unit:"V",
     steps:[`Full-wave ripple runs at twice the mains frequency: 2 × ${m} Hz = ${fr} Hz.`,`Vripple ≈ I / (2·f·C) = ${f(I,"A")} / (${fr} Hz × ${f(C,"F")}) = ${f(I,"A")} / ${pl(fr*C,"A/V")} = ${f(dV,"V")}.`,`Doubling C, or halving the load, halves the ripple.`]}; },
 ()=>{ const I=pick([0.1,0.25,0.5,1]), dV=pick([0.5,1,2]), m=pick([50,60]), fr=2*m, C=I/(fr*dV);
   return {q:`A full-wave rectifier on ${m} Hz mains must supply ${f(I,"A")} with no more than ${f(dV,"V")} peak-to-peak ripple. Calculate the smoothing capacitor, then enter the nearest standard value.`, ans:C, unit:"F", std:true,
     steps:[`Ripple frequency: 2 × ${m} Hz = ${fr} Hz.`,`C = I / (2·f·Vripple) = ${f(I,"A")} / (${fr} Hz × ${f(dV,"V")}) = ${f(C,"F")}.`,`${std(C,"F")}.`,`If the part you pick is smaller than the result, the ripple will be slightly above ${f(dV,"V")}.`]}; },
 ()=>{ let Vi,Vo; do{ Vi=pick([9,12,15,24]); Vo=pick([3.3,5,9,12]); }while(Vi-Vo<2.5);
   const I=pick([0.1,0.25,0.5,1,1.5]), P=(Vi-Vo)*I;
   return {q:`A linear regulator drops ${f(Vi,"V")} to ${f(Vo,"V")} at ${f(I,"A")}. How much power does it dissipate as heat, in watts?`, ans:P, unit:"W",
     steps:[`The regulator drops the difference: ${f(Vi,"V")} − ${f(Vo,"V")} = ${f(Vi-Vo,"V")}.`,`P = (Vin − Vout) · I = ${f(Vi-Vo,"V")} × ${f(I,"A")} = ${f(P,"W")}.`,`Efficiency ≈ Vout / Vin = ${+(Vo/Vi*100).toPrecision(2)}%. With θJA = 50 °C/W the junction warms by ${f(P,"W")} × 50 °C/W = ${+(P*50).toPrecision(2)} °C.`]}; },
 ()=>{ const Vo=pick([3.3,5,6,9,12]), R1=240, R2=R1*(Vo/1.25-1);
   return {q:`An LM317 has R1 = 240 Ω between its output and adjust pins. Which R2, from adjust to ground, gives ${f(Vo,"V")}? Calculate it, then enter the nearest standard E12 or E24 value.`, ans:R2, unit:"Ω", std:true,
     steps:[`Vout = 1.25 V · (1 + R2/R1), so R2 = R1 · (Vout / 1.25 V − 1).`,`R2 = 240 Ω × (${f(Vo,"V")} / 1.25 V − 1) = 240 Ω × ${+(Vo/1.25-1).toPrecision(3)} = ${f(R2,"Ω")}.`,`${std(R2)}.`,`This ignores the adjust-pin current (about 50 µA), which adds a little to the output.`]}; }
],
10:[
 ()=>{ const R1=rE(1000,10000), R2=rE(1000,100000), C=pick([10e-9,100e-9,1e-6,10e-6]), T=R1+2*R2, fr=1.44/(T*C);
   return {q:`A 555 astable has R1 = ${f(R1,"Ω")}, R2 = ${f(R2,"Ω")} and C = ${f(C,"F")}. What is its output frequency, in hertz?`, ans:fr, unit:"Hz",
     steps:[`f = 1.44 / ((R1 + 2·R2) · C).`,`R1 + 2·R2 = ${f(R1,"Ω")} + 2 × ${f(R2,"Ω")} = ${f(T,"Ω")}.`,`f = 1.44 / (${f(T,"Ω")} × ${f(C,"F")}) = 1.44 / ${f(T*C,"s")} = ${f(fr,"Hz")}.`,`Period ${f(1/fr,"s")}; duty cycle (R1 + R2) / (R1 + 2·R2) = ${+((R1+R2)/T*100).toPrecision(3)}%.`]}; },
 ()=>{ const R1=rE(1000,10000), R2=rE(1000,100000), C=pick([10e-9,100e-9,1e-6,10e-6]), th=0.693*(R1+R2)*C;
   return {q:`A 555 astable has R1 = ${f(R1,"Ω")}, R2 = ${f(R2,"Ω")} and C = ${f(C,"F")}. How long is the output high in each cycle, in seconds?`, ans:th, unit:"s",
     steps:[`The capacitor charges through R1 + R2, so tH = 0.693 · (R1 + R2) · C.`,`R1 + R2 = ${f(R1,"Ω")} + ${f(R2,"Ω")} = ${f(R1+R2,"Ω")}.`,`tH = 0.693 × ${f(R1+R2,"Ω")} × ${f(C,"F")} = ${f(th,"s")}.`,`For comparison tL = 0.693 · R2 · C = ${f(0.693*R2*C,"s")}.`]}; },
 ()=>{ const R1=pick([1000,2200,4700]), C=pick([100e-9,1e-6,10e-6]); let fr,R2; do{ fr=pick([1,2,5,10,20,50,100,500,1000]); R2=(1.44/(fr*C)-R1)/2; }while(R2<R1||R2>2e6);
   return {q:`A 555 astable with R1 = ${f(R1,"Ω")} and C = ${f(C,"F")} must run at ${f(fr,"Hz")}. Calculate R2, then enter the nearest standard E12 or E24 value.`, ans:R2, unit:"Ω", std:true,
     steps:[`f = 1.44 / ((R1 + 2·R2) · C), so R1 + 2·R2 = 1.44 / (f · C) = 1.44 / (${f(fr,"Hz")} × ${f(C,"F")}) = ${f(1.44/(fr*C),"Ω")}.`,`R2 = (${f(1.44/(fr*C),"Ω")} − ${f(R1,"Ω")}) / 2 = ${f(R2,"Ω")}.`,`${std(R2)}.`,`With the E24 value the frequency is ${f(1.44/((R1+2*BC.nearestE(R2,24))*C),"Hz")}.`]}; },
 ()=>{ const C=pick([100e-9,1e-6,10e-6,100e-6]); let t,R; do{ t=pick([0.01,0.05,0.1,0.5,1,2,5,10,30]); R=t/(1.1*C); }while(R<1e3||R>5e6);
   return {q:`A 555 monostable must give a ${f(t,"s")} pulse with a ${f(C,"F")} timing capacitor. Calculate R, then enter the nearest standard E12 or E24 value.`, ans:R, unit:"Ω", std:true,
     steps:[`t = 1.1 · R · C, so R = t / (1.1 · C).`,`R = ${f(t,"s")} / (1.1 × ${f(C,"F")}) = ${f(R,"Ω")}.`,`${std(R)}.`,`With the E24 value the pulse lasts 1.1 × ${f(BC.nearestE(R,24),"Ω")} × ${f(C,"F")} = ${f(1.1*BC.nearestE(R,24)*C,"s")}.`]}; }
],
11:[
 ()=>{ const fi=pick([32768,1e6,2e6,4e6,8e6,10e6,16e6]); let n,fo; do{ n=pick([3,4,5,6,8,10,12]); fo=fi/Math.pow(2,n); }while(fo<1||fo>2e6);
   return {q:`A binary counter with ${n} stages is clocked at ${f(fi,"Hz")}. At what frequency does its last stage toggle, in hertz?`, ans:fo, unit:"Hz",
     steps:[`Each stage divides by 2, so ${n} stages divide by 2^${n} = ${Math.pow(2,n)}.`,`f = ${f(fi,"Hz")} / ${Math.pow(2,n)} = ${f(fo,"Hz")}.`,`The first stage runs at ${f(fi/2,"Hz")}. Each later stage runs at half the rate of the one before it.`]}; },
 ()=>{ const hi=pick([true,false]); let a,b; if(hi){ do{ a=pick([2.4,2.7,2.9,3.0,3.8,4.4,4.9]); b=pick([2.0,2.31,3.15,3.5]); }while(a-b<0.2); } else { do{ a=pick([0.1,0.2,0.4,0.5]); b=pick([0.8,0.99,1.35,1.5]); }while(b-a<0.3); }
   const nm=hi?a-b:b-a;
   return hi?{q:`A driver guarantees VOH ≥ ${f(a,"V")} and the receiver needs VIH ≥ ${f(b,"V")} to read a 1. What is the high-state noise margin, in volts?`, ans:nm, unit:"V",
     steps:[`NMH = VOH − VIH.`,`NMH = ${f(a,"V")} − ${f(b,"V")} = ${f(nm,"V")}.`,`A spike on the line that pulls the level down by less than ${f(nm,"V")} cannot turn a guaranteed 1 into the forbidden zone.`]}
   :{q:`A driver guarantees VOL ≤ ${f(a,"V")} and the receiver reads a 0 only below VIL ≤ ${f(b,"V")}. What is the low-state noise margin, in volts?`, ans:nm, unit:"V",
     steps:[`NML = VIL − VOL.`,`NML = ${f(b,"V")} − ${f(a,"V")} = ${f(nm,"V")}.`,`A spike on the line that pushes the level up by less than ${f(nm,"V")} cannot turn a guaranteed 0 into the forbidden zone.`]}; },
 ()=>{ const N=pick([3,5,7,9,11]), t=pick([5,8,10,12,15,20])*1e-9, T=2*N*t, fr=1/T;
   return {q:`A ring oscillator is ${N} inverters in a loop, each with a propagation delay of ${f(t,"s")}. What is its oscillation frequency, in hertz?`, ans:fr, unit:"Hz",
     steps:[`An edge must travel around the ring twice per cycle, once to flip the output and once to flip it back.`,`T = 2 · N · tpd = 2 × ${N} × ${f(t,"s")} = ${f(T,"s")}.`,`f = 1 / T = 1 / ${f(T,"s")} = ${f(fr,"Hz")}.`,`An odd number of inverters is needed so that the loop has no stable state.`]}; },
 ()=>{ const v=16+Math.floor(Math.random()*240), h=v>>4, l=v&15, H=h.toString(16).toUpperCase(), L=l.toString(16).toUpperCase(), b=v.toString(2).padStart(8,"0");
   return {q:`What is the decimal value of the byte 0x${H}${L}?`, ans:v, unit:"decimal", si:false, tol:0,
     steps:[`Each hex digit is four bits. 0x${H} = ${h} and 0x${L} = ${l}.`,`Value = ${h} × 16 + ${l} = ${h*16} + ${l} = ${v}.`,`Check in binary: ${b.slice(0,4)} ${b.slice(4)}.`]}; }
],
12:[
 ()=>{ const n=pick([8,10,12,16]), V=pick([1.1,2.5,3.3,5]), s=Math.pow(2,n), q=V/s;
   return {q:`${n===8?"An":"A"} ${n}-bit ADC uses a ${f(V,"V")} reference. What is the size of one step (1 LSB), in volts?`, ans:q, unit:"V",
     steps:[`The range is split into 2^${n} = ${s} steps.`,`LSB = Vref / 2ⁿ = ${f(V,"V")} / ${s} = ${f(q,"V")}.`,`Rounding to the nearest step causes an error of up to ±½ LSB = ±${f(q/2,"V")}.`]}; },
 ()=>{ const n=pick([10,12]), V=pick([3.3,5]), s=Math.pow(2,n); const code=Math.round(s*(0.1+0.8*Math.random())), v=code/s*V;
   return {q:`A ${n}-bit ADC with a ${f(V,"V")} reference returns the code ${code}. Estimate the input voltage, in volts.`, ans:v, unit:"V",
     steps:[`Vin ≈ code / 2ⁿ × Vref.`,`Vin = ${code} / ${s} × ${f(V,"V")} = ${f(v,"V")}.`,`One step is ${f(V/s,"V")}, so the true input is within about ${f(V/s,"V")} of this value.`]}; },
 ()=>{ const V=pick([3.3,5]), mode=pick([["standard-mode",1000e-9],["fast-mode",300e-9]]), C=(mode[0]==="standard-mode"?pick([100,200,300,400]):pick([30,50,80,100]))*1e-12, R=mode[1]/(0.85*C), Rm=(V-0.4)/3e-3, lo=BC.e12Down(R);
   return {q:`An I²C bus on ${f(V,"V")} has ${f(C,"F")} of capacitance. For ${mode[0]} the rise time (30% to 70%) must be at most ${f(mode[1],"s")}. Calculate the largest pull-up resistor that meets it, then enter the nearest standard E12 or E24 value.`, ans:R, unit:"Ω", std:true,
     steps:[`Rise time: t = 0.85 · R · C, so R = t / (0.85 · C).`,`R = ${f(mode[1],"s")} / (0.85 × ${f(C,"F")}) = ${f(R,"Ω")}.`,`${std(R)}. Because this is a limit, round down to ${f(lo,"Ω")} if you need to guarantee the rise time.`,`The sink-current floor is (Vcc − 0.4 V) / 3 mA = ${f(Rm,"Ω")}, and this result is above it.`]}; },
 ()=>{ const T=pick([0,10,20,40,50,60,70,80]), V=pick([3.3,5]), Rt=1e4*Math.exp(3950*(1/(T+273.15)-1/298.15)), v=V*1e4/(Rt+1e4);
   return {q:`A 10 kΩ NTC thermistor (B = 3950, 10 kΩ at 25 °C) is on the top of a divider with a fixed 10 kΩ resistor to ground, on a ${f(V,"V")} supply. At ${T} °C, what is the output voltage, in volts?`, ans:v, unit:"V",
     steps:[`R(T) = R₀ · e^(B · (1/T − 1/T₀)), with T = ${+(T+273.15).toFixed(2)} K and T₀ = 298.15 K.`,`R = 10 kΩ × e^(3950 × (1/${+(T+273.15).toFixed(2)} − 1/298.15)) = ${f(Rt,"Ω")}.`,`Vout = ${f(V,"V")} × 10 kΩ / (${f(Rt,"Ω")} + 10 kΩ) = ${f(v,"V")}.`,`With 10 bits that is a code of about ${Math.round(v/V*1024)}.`]}; }
],
13:[
 ()=>{ const V=pick([3,6,9,12,24]); let R,I; do{ R=pick([1,1.5,2.2,3,4.7,6.8,10,15]); I=V/R; }while(I<0.4||I>10);
   return {q:`A ${f(V,"V")} brushed DC motor has a winding resistance of ${f(R,"Ω")}. What current does it draw when it is stalled, in amps?`, ans:I, unit:"A",
     steps:[`At stall there is no back-EMF, so only the winding resistance limits the current: I = V / R.`,`I = ${f(V,"V")} / ${f(R,"Ω")} = ${f(I,"A")}.`,`The winding dissipates ${f(V*I,"W")} while stalled, so the driver, the supply and the motor must survive that.`]}; },
 ()=>{ const a=pick([0,15,30,45,60,90,120,135,150,170,180]), t=(1+a/180)*1e-3;
   return {q:`A hobby servo maps a 1 ms pulse to 0°, 1.5 ms to 90° and 2 ms to 180°, in a straight line. What pulse width commands ${a}°, in seconds?`, ans:t, unit:"s",
     steps:[`Pulse = 1 ms + angle × (1 ms / 180°).`,`Pulse = 1 ms + ${a}° × 0.00556 ms/° = ${+(1+a/180).toPrecision(4)} ms.`,`That is ${f(t,"s")}. In a 20 ms frame, the duty cycle is ${+(t/20e-3*100).toPrecision(3)}%.`]}; },
 ()=>{ let rpm,ang,mic,rate; do{ rpm=pick([30,60,120,150,300,600]); ang=pick([1.8,0.9,7.5]); mic=pick([1,2,4,8,16]); rate=rpm/60*(360/ang)*mic; }while(rate>40000||rate<20);
   return {q:`A stepper with a ${ang}° step angle runs at ${rpm} rpm on a driver set to 1/${mic} microstepping. What step-pulse rate does the driver need, in hertz?`, ans:rate, unit:"Hz",
     steps:[`Full steps per revolution: 360° / ${ang}° = ${360/ang}. With 1/${mic} microstepping that is ${360/ang} × ${mic} = ${360/ang*mic} pulses per revolution.`,`Revolutions per second: ${rpm} rpm / 60 = ${+(rpm/60).toPrecision(3)}.`,`Rate = ${+(rpm/60).toPrecision(3)} × ${360/ang*mic} = ${f(rate,"Hz")}, which is ${f(1/rate,"s")} between pulses.`]}; },
 ()=>{ const V=pick([6,12,24]), R=pick([1,1.5,2.2,3,4.7]), Is=V/R, I=+(Is*pick([0.1,0.15,0.2,0.25,0.3])).toPrecision(2), E=V-I*R;
   return {q:`A ${f(V,"V")} DC motor has ${f(R,"Ω")} of winding resistance and draws ${f(I,"A")} at its running speed. What is its back-EMF, in volts?`, ans:E, unit:"V",
     steps:[`The winding drops I · R = ${f(I,"A")} × ${f(R,"Ω")} = ${f(I*R,"V")}.`,`The back-EMF is what is left: E = V − I · R = ${f(V,"V")} − ${f(I*R,"V")} = ${f(E,"V")}.`,`Stall current for comparison: V / R = ${f(Is,"A")}, which is ${+(Is/I).toPrecision(2)} times the running current.`]}; }
],
14:[
 ()=>{ const w=pick([["sine",Math.SQRT2,"A sine wave"],["triangle",Math.sqrt(3),"A triangle wave"],["square",1,"A square wave"]]), Vp=pick([1,2,3.3,5,9,12,15,24]), r=Vp/w[1];
   return {q:`${w[2]} swings between −${f(Vp,"V")} and +${f(Vp,"V")}. What is its RMS value, in volts?`, ans:r, unit:"V",
     steps:[w[0]==="sine"?`For a sine wave, Vrms = Vpeak / √2.`:w[0]==="triangle"?`For a triangle wave, Vrms = Vpeak / √3.`:`For a square wave that swings symmetrically, Vrms = Vpeak, because the square of the voltage is constant.`,`Vrms = ${f(Vp,"V")} / ${+w[1].toPrecision(4)} = ${f(r,"V")}.`,`Into 8 Ω, that delivers ${f(r*r/8,"W")}.`]}; },
 ()=>{ let cap,v,f0,X,L,u; do{ cap=pick([true,false]); f0=pick([50,60,100,440,1e3,10e3,100e3]); v=cap?pick([1e-9,10e-9,100e-9,1e-6,10e-6,100e-6]):pick([10e-6,100e-6,1e-3,10e-3,100e-3,1]); X=cap?1/(2*Math.PI*f0*v):2*Math.PI*f0*v; }while(X<0.1||X>1e7);
   return {q:`What is the reactance of a ${f(v,cap?"F":"H")} ${cap?"capacitor":"inductor"} at ${f(f0,"Hz")}, in ohms?`, ans:X, unit:"Ω",
     steps:[cap?`Xc = 1 / (2π · f · C).`:`XL = 2π · f · L.`,cap?`Xc = 1 / (2π × ${f(f0,"Hz")} × ${f(v,"F")}) = 1 / ${f(2*Math.PI*f0*v,"S")} = ${f(X,"Ω")}.`:`XL = 2π × ${f(f0,"Hz")} × ${f(v,"H")} = ${f(X,"Ω")}.`,cap?`At ten times the frequency it would be ${f(X/10,"Ω")}. A capacitor passes high frequencies more easily.`:`At ten times the frequency it would be ${f(X*10,"Ω")}. An inductor passes low frequencies more easily.`]}; },
 ()=>{ let vi,g,vo; do{ vi=pick([1,2,5,10,20,50,100])*1e-3; g=pick([6,10,14,20,26,34,40,46,60]); vo=vi*Math.pow(10,g/20); }while(vo>12||vo<0.05);
   return {q:`An amplifier with ${g} dB of voltage gain has a ${f(vi,"V")} RMS signal at its input. What is the RMS output voltage, in volts?`, ans:vo, unit:"V",
     steps:[`Voltage ratio = 10^(dB / 20) = 10^(${g} / 20) = ${+Math.pow(10,g/20).toPrecision(4)}.`,`Vout = ${f(vi,"V")} × ${+Math.pow(10,g/20).toPrecision(4)} = ${f(vo,"V")}.`,`Check: the power ratio is 10^(${g}/10) = ${+Math.pow(10,g/10).toPrecision(3)}, if the impedances are the same.`]}; },
 ()=>{ const L=pick([10e-6,100e-6,470e-6,1e-3,4.7e-3,10e-3,47e-3,100e-3]), C=pick([1e-9,4.7e-9,10e-9,47e-9,100e-9,1e-6]), fr=1/(2*Math.PI*Math.sqrt(L*C));
   return {q:`A ${f(L,"H")} inductor and a ${f(C,"F")} capacitor form an LC circuit. What is its resonant frequency, in hertz?`, ans:fr, unit:"Hz",
     steps:[`f₀ = 1 / (2π√(L · C)).`,`√(L · C) = √(${f(L,"H")} × ${f(C,"F")}) = ${f(Math.sqrt(L*C),"s")}.`,`f₀ = 1 / (2π × ${f(Math.sqrt(L*C),"s")}) = ${f(fr,"Hz")}.`,`At this frequency the two reactances are equal: ${f(2*Math.PI*fr*L,"Ω")}.`]}; }
],
15:[
 ()=>{ const Ri=rE(1000,10000); let G,Rf; do{ G=pick([2,3,5,6,10,11,20,50,100]); Rf=(G-1)*Ri; }while(Rf>1e6||Rf<1000);
   return {q:`A non-inverting op amp stage needs a gain of ${G} with Rin = ${f(Ri,"Ω")}. Calculate Rf, then enter the nearest standard E12 or E24 value.`, ans:Rf, unit:"Ω", std:true,
     steps:[`G = 1 + Rf / Rin, so Rf = (G − 1) · Rin.`,`Rf = (${G} − 1) × ${f(Ri,"Ω")} = ${f(Rf,"Ω")}.`,`${std(Rf)}.`,`With the E24 value the gain becomes 1 + ${f(BC.nearestE(Rf,24),"Ω")} / ${f(Ri,"Ω")} = ${+(1+BC.nearestE(Rf,24)/Ri).toPrecision(3)}.`]}; },
 ()=>{ let Ri,Rf,vin,vs,G,vo; do{ Ri=rE(1000,22000); Rf=rE(1000,220000); vin=pick([0.05,0.1,0.2,0.5,1,1.2]); vs=pick([5,9,12,15]); G=Rf/Ri; vo=G*vin; }while(vo>vs-1.5||vo<0.1);
   return {q:`An inverting amplifier has Rin = ${f(Ri,"Ω")} and Rf = ${f(Rf,"Ω")}, on ±${vs} V rails. The input is −${f(vin,"V")} (a DC level). What is the output voltage, in volts?`, ans:vo, unit:"V",
     steps:[`Inverting gain: G = −Rf / Rin = −${f(Rf,"Ω")} / ${f(Ri,"Ω")} = −${+G.toPrecision(3)}.`,`Vout = G × Vin = −${+G.toPrecision(3)} × (−${f(vin,"V")}) = +${f(vo,"V")}.`,`That is inside the rails (about ±${vs-1.5} V for a part that stops 1.5 V short), so the output does not clip.`]}; },
 ()=>{ let R1,R2,Rf,v1,v2,vo; do{ R1=rE(1000,22000); R2=rE(1000,22000); Rf=rE(2000,47000); v1=pick([0.2,0.5,1,1.5,2]); v2=pick([0.2,0.5,1,1.5,2]); vo=Rf*(v1/R1+v2/R2); }while(vo>8||vo<0.3);
   return {q:`An inverting summing amplifier has inputs of −${f(v1,"V")} through ${f(R1,"Ω")} and −${f(v2,"V")} through ${f(R2,"Ω")}, with Rf = ${f(Rf,"Ω")}. What is the output voltage, in volts?`, ans:vo, unit:"V",
     steps:[`Vout = −Rf · (V₁ / R₁ + V₂ / R₂), with the input voltages −${f(v1,"V")} and −${f(v2,"V")}.`,`Currents into the summing node: ${f(v1/R1,"A")} + ${f(v2/R2,"A")} = ${f(v1/R1+v2/R2,"A")}.`,`Vout = ${f(Rf,"Ω")} × ${f(v1/R1+v2/R2,"A")} = +${f(vo,"V")}. The inverting stage flips the sign of the negative sum.`]}; },
 ()=>{ const gbw=pick([1e6,3e6,4e6,8e6,10e6,20e6]), G=pick([2,5,10,20,50,100,200]), bw=gbw/G;
   return {q:`A non-inverting amplifier with a gain of ${G} uses an op amp with a gain-bandwidth product of ${f(gbw,"Hz")}. What is the −3 dB bandwidth of the stage, in hertz?`, ans:bw, unit:"Hz",
     steps:[`With feedback, bandwidth ≈ GBW / G.`,`BW = ${f(gbw,"Hz")} / ${G} = ${f(bw,"Hz")}.`,`${bw<20000?"That is below the 20 kHz audio band, so this part is too slow. Split the gain over two stages or choose a faster op amp.":"That covers the 20 kHz audio band."}`]}; }
],
16:[
 ()=>{ let R,C,fr; do{ R=rE(100,1e6); C=pick([1e-9,4.7e-9,10e-9,47e-9,100e-9,470e-9,1e-6]); fr=1/(2*Math.PI*R*C); }while(fr<1||fr>2e5);
   return {q:`An RC filter has R = ${f(R,"Ω")} and C = ${f(C,"F")}. What is its cutoff frequency, in hertz?`, ans:fr, unit:"Hz",
     steps:[`fc = 1 / (2π · R · C).`,`R · C = ${f(R,"Ω")} × ${f(C,"F")} = ${f(R*C,"s")}.`,`fc = 1 / (2π × ${f(R*C,"s")}) = ${f(fr,"Hz")}.`,`At fc the output is −3 dB, 70.7% of the input.`]}; },
 ()=>{ let C,fr,R; do{ C=pick([1e-9,4.7e-9,10e-9,47e-9,100e-9,470e-9,1e-6]); fr=pick([50,100,200,500,1e3,2e3,5e3,10e3]); R=1/(2*Math.PI*fr*C); }while(R<100||R>1e6);
   return {q:`A low-pass filter with a ${f(C,"F")} capacitor must have a cutoff of ${f(fr,"Hz")}. Calculate R, then enter the nearest standard E12 or E24 value.`, ans:R, unit:"Ω", std:true,
     steps:[`R = 1 / (2π · fc · C).`,`R = 1 / (2π × ${f(fr,"Hz")} × ${f(C,"F")}) = ${f(R,"Ω")}.`,`${std(R)}.`,`With the E24 value, fc = 1 / (2π × ${f(BC.nearestE(R,24),"Ω")} × ${f(C,"F")}) = ${f(1/(2*Math.PI*BC.nearestE(R,24)*C),"Hz")}.`]}; },
 ()=>{ const lp=pick([true,false]), fc=pick([100,500,1e3,2e3,5e3,10e3]), k=pick([0.2,0.5,2,3,5,10]), fx=fc*k, Vi=pick([1,2,5,10]), H=lp?1/Math.sqrt(1+k*k):k/Math.sqrt(1+k*k), vo=Vi*H;
   return {q:`A first-order ${lp?"low-pass":"high-pass"} filter has fc = ${f(fc,"Hz")}. A ${f(Vi,"V")} peak sine at ${f(fx,"Hz")} enters it. What is the peak output voltage, in volts?`, ans:vo, unit:"V",
     steps:[`f / fc = ${f(fx,"Hz")} / ${f(fc,"Hz")} = ${k}.`,lp?`Low-pass: |H| = 1 / √(1 + (f/fc)²) = 1 / √(1 + ${k*k}) = ${+H.toPrecision(3)}.`:`High-pass: |H| = (f/fc) / √(1 + (f/fc)²) = ${k} / √(1 + ${k*k}) = ${+H.toPrecision(3)}.`,`Vout = ${f(Vi,"V")} × ${+H.toPrecision(3)} = ${f(vo,"V")}, which is ${String(+(20*Math.log10(H)).toPrecision(3)).replace("-","−")} dB.`]}; },
 ()=>{ let R,fl,C; do{ R=rE(1000,1e6); fl=pick([10,20,50,100]); C=1/(2*Math.PI*fl*R); }while(C<1e-10||C>1e-4);
   return {q:`An audio input has an input impedance of ${f(R,"Ω")}. A series coupling capacitor must pass signals down to ${f(fl,"Hz")} (the −3 dB point). Calculate C, then enter the nearest standard E12 or E24 value.`, ans:C, unit:"F", std:true,
     steps:[`The capacitor and the input impedance form a high-pass filter: fc = 1 / (2π · R · C), so C = 1 / (2π · R · fc).`,`C = 1 / (2π × ${f(R,"Ω")} × ${f(fl,"Hz")}) = ${f(C,"F")}.`,`${std(C,"F")}.`,`With the E24 value, fc = 1 / (2π × ${f(R,"Ω")} × ${f(BC.nearestE(C,24),"F")}) = ${f(1/(2*Math.PI*R*BC.nearestE(C,24)),"Hz")}.`]}; }
],
17:[
 ()=>{ const fr=pick([20,50,100,200,440,1e3,2e3,5e3,10e3,20e3]), l=343/fr;
   return {q:`What is the wavelength of a ${f(fr,"Hz")} tone in air, with the speed of sound at 343 m/s, in metres?`, ans:l, unit:"m", si:false,
     steps:[`λ = v / f.`,`λ = 343 m/s / ${f(fr,"Hz")} = ${f(l,"m")}.`,`Long wavelengths bend around obstacles easily. This is why bass is hard to localise and why a woofer needs a large enclosure.`]}; },
 ()=>{ const Vp=pick([2,5,8,10,13,20]), R=pick([4,6,8]), P=Vp*Vp/(2*R);
   return {q:`An amplifier drives a sine wave of ${f(Vp,"V")} peak into a ${f(R,"Ω")} speaker. What average power does the speaker receive, in watts?`, ans:P, unit:"W",
     steps:[`Convert to RMS: Vrms = Vpeak / √2 = ${f(Vp,"V")} / 1.414 = ${f(Vp/Math.SQRT2,"V")}.`,`P = Vrms² / R = (${f(Vp/Math.SQRT2,"V")})² / ${f(R,"Ω")} = ${f(P,"W")}.`,`Peak current: ${f(Vp,"V")} / ${f(R,"Ω")} = ${f(Vp/R,"A")}.`]}; },
 ()=>{ const fs=pick([8000,22050,44100,48000]), fx=Math.round(fs*(0.55+0.4*Math.random())/100)*100, al=fs-fx;
   return {q:`A signal is sampled at ${f(fs,"Hz",4)} with no anti-aliasing filter, and it contains a ${f(fx,"Hz",4)} tone. At what frequency does the tone appear in the samples, in hertz?`, ans:al, unit:"Hz",
     steps:[`The Nyquist frequency is fs / 2 = ${f(fs/2,"Hz",4)}. The tone is above it, so it folds back.`,`f_alias = |f − fs| = |${f(fx,"Hz",4)} − ${f(fs,"Hz",4)}| = ${f(al,"Hz",4)}.`,`Once sampled, it is indistinguishable from a real ${f(al,"Hz",4)} tone. The filter has to remove it before the converter.`]}; },
 ()=>{ const fc=pick([2000,2500,3000,3500,4000,5000]), R=pick([4,6,8]), C=1/(2*Math.PI*fc*R);
   return {q:`A first-order crossover puts a series capacitor in front of a ${f(R,"Ω")} tweeter, with a −3 dB point at ${f(fc,"Hz")}. Calculate C, then enter the nearest standard E12 or E24 value.`, ans:C, unit:"F", std:true,
     steps:[`The capacitor and the tweeter form a high-pass filter: fc = 1 / (2π · R · C), so C = 1 / (2π · R · fc).`,`C = 1 / (2π × ${f(R,"Ω")} × ${f(fc,"Hz")}) = ${f(C,"F")}.`,`${std(C,"F")}.`,`The real impedance of a tweeter varies with frequency, so the actual corner will differ from the nominal figure.`]}; }
],
18:[
 ()=>{ const isC=Math.random()<0.4, v=isC?rE(10,47e6)*1e-12:rE(1,8.2e6), code=rkm(v,isC?CL:RL), L=(isC?CL:RL).find(([m])=>v>=m*0.9999), ref=(isC?"C":"R")+pick([2,3,4,5,7,9,11,12,15]);
   return {q:`A schematic marks ${ref} as ${code}. What is its value, in ${isC?"farads":"ohms"}?`, ans:v, unit:isC?"F":"Ω",
     steps:[`The letter stands where the decimal point would be and sets the multiplier: ${L[1]} means × ${L[2]}.`,`${code} = ${+(v/L[0]).toPrecision(3)} × ${L[2]} = ${f(v,isC?"F":"Ω")}.`,`A letter in place of the point survives a lost or smudged dot on a printed schematic.`]}; },
 ()=>{ const V=pick([3.3,5]), led=pick(V===5?[["red",2.0],["green",2.1],["blue",3.0]]:[["red",2.0],["green",2.1]]), R=rE(220,1000), I=(V-led[1])/R, net=V===5?"+5V":"+3V3";
   return {q:`The net ${net} feeds R4, marked ${rkm(R,RL)}, and then a ${led[0]} LED with a forward voltage of ${led[1]} V. The LED's cathode goes to a GND symbol. What current flows, in amps?`, ans:I, unit:"A",
     steps:[`${net} is a power symbol: the net is at ${f(V,"V")}, and GND at 0 V.`,`Voltage across R4: ${f(V,"V")} − ${f(led[1],"V")} = ${f(V-led[1],"V")}.`,`I = ${f(V-led[1],"V")} / ${f(R,"Ω")} = ${f(I,"A")}.`]}; },
 ()=>{ const Vb=pick([3.0,3.3,3.7,4.2,5,9,12]), a=rE(10e3,220e3), b=rE(10e3,220e3), o=Vb*b/(a+b);
   return {q:`The net VBAT, at ${f(Vb,"V")}, connects to R5 (${rkm(a,RL)}). R5's other end is the net VBAT_SENSE, which also goes through R6 (${rkm(b,RL)}) to GND. Nothing else draws current from VBAT_SENSE. What voltage is on VBAT_SENSE, in volts?`, ans:o, unit:"V",
     steps:[`R5 and R6 form a divider from VBAT to GND, with VBAT_SENSE at the middle.`,`V = ${f(Vb,"V")} × ${f(b,"Ω")} / (${f(a,"Ω")} + ${f(b,"Ω")}) = ${f(Vb,"V")} × ${+(b/(a+b)).toPrecision(3)} = ${f(o,"V")}.`,`Divider current: ${f(Vb,"V")} / ${f(a+b,"Ω")} = ${f(Vb/(a+b),"A")}, drawn from the battery all the time.`]}; },
 ()=>{ const k=pick([2,3,4,5,6,8]), r=pick([2,3,4,6]), c=pick([1,2,3,4]), u=pick([1,2]), root=pick([3,4,5,6,8]), per=r+c+u, tot=k*per+root;
   return {q:`A KiCad project places the sheet motor.kicad_sch ${k} times. That sheet holds ${r} resistors, ${c} capacitor${c>1?"s":""} and ${u} IC${u>1?"s":""}. The root sheet has ${root} more parts. How many parts does the bill of materials list?`, ans:tot, unit:"parts", si:false, tol:0,
     steps:[`Each placement of a sheet is a full copy of its parts: ${r} + ${c} + ${u} = ${per} parts per copy.`,`${k} copies × ${per} = ${k*per} parts.`,`Add the root sheet: ${k*per} + ${root} = ${tot} parts.`,`Annotation gives every copy its own designators, so the BOM shows R1 only once, not ${k} times.`]}; }
],
19:[
 ()=>{ const [mode,tr]=pick([["standard mode (100 kHz)",1000e-9],["fast mode (400 kHz)",300e-9]]), Cb=pick([50,80,100,150,200,250,300,400])*1e-12, R=tr/(0.8473*Cb);
   return {q:`An I²C bus in ${mode} allows a rise time of ${f(tr,"s")}, and its capacitance is ${f(Cb,"F")}. What is the largest pull-up resistance that meets the rise time, in ohms?`, ans:R, unit:"Ω",
     steps:[`The rise from 30% to 70% of the supply takes ln(0.7 / 0.3) = 0.8473 time constants, so t_r = 0.8473 · R · C_b.`,`R_max = ${f(tr,"s")} / (0.8473 × ${f(Cb,"F")}) = ${f(R,"Ω")}.`,`Pick a standard value below it, such as ${f(BC.e12Down(R),"Ω")}, and check that it stays above the minimum set by the sink current.`]}; },
 ()=>{ const V=pick([2.5,3.3,5]), [I,mode]=pick([[3e-3,"standard or fast mode"],[20e-3,"fast mode plus"]]), R=(V-0.4)/I;
   return {q:`In I²C ${mode}, a device must be able to pull a line to 0.4 V while sinking ${f(I,"A")}. On a ${f(V,"V")} bus, what is the smallest pull-up resistance allowed, in ohms?`, ans:R, unit:"Ω",
     steps:[`With the line held at 0.4 V, the pull-up carries (V_DD − 0.4 V) / R, and that must not exceed ${f(I,"A")}.`,`R_min = (${f(V,"V")} − 0.4 V) / ${f(I,"A")} = ${f(V-0.4,"V")} / ${f(I,"A")} = ${f(R,"Ω")}.`,`A smaller resistor gives faster edges but a low level the devices can't guarantee.`]}; },
 ()=>{ let V,a,b,t,hi,k,a2,b2,o,nom;
   do{ V=pick([3.3,5,12]); a=rE(1e3,100e3); b=rE(1e3,100e3); t=pick([1,2,5,10]); hi=pick([true,false]); k=t/100;
     a2=a*(hi?1-k:1+k); b2=b*(hi?1+k:1-k); o=V*b2/(a2+b2); nom=V*b/(a+b); } while(Math.abs(o/nom-1)<0.012); /* worst case must differ visibly from nominal */
   return {q:`A divider has R1 = ${f(a,"Ω")} on top and R2 = ${f(b,"Ω")} to ground, both ±${t}%, across ${f(V,"V")}. What is the ${hi?"highest":"lowest"} output it can give, in volts?`, ans:o, unit:"V", tol:.005,
     steps:[`The output is ${hi?"highest":"lowest"} when R1 is at its ${hi?"minimum":"maximum"} and R2 at its ${hi?"maximum":"minimum"}.`,`R1 = ${f(a,"Ω")} × ${hi?1-k:1+k} = ${f(a2,"Ω")}; R2 = ${f(b,"Ω")} × ${hi?1+k:1-k} = ${f(b2,"Ω")}.`,`Vout = ${f(V,"V")} × ${f(b2,"Ω")} / (${f(a2,"Ω")} + ${f(b2,"Ω")}) = ${f(o,"V",4)}.`,`Nominal is ${f(nom,"V",4)}, so the worst case is ${+(Math.abs(o/nom-1)*100).toPrecision(2)}% away. Put the tolerance in the BOM.`]}; },
 ()=>{ const V=pick([3.3,5,9,12,15,24]), Rt=[6.3,10,16,25,35,50,100].find(x=>x>=2*V-1e-9);
   return {q:`A ceramic capacitor sits on a ${f(V,"V")} rail. Using the rule of at least twice the working voltage, which standard rating should you choose from 6.3, 10, 16, 25, 35, 50 and 100 V, in volts?`, ans:Rt, unit:"V", tol:0,
     steps:[`Twice the working voltage: 2 × ${f(V,"V")} = ${f(2*V,"V")}.`,`The lowest standard rating at or above that is ${f(Rt,"V")}.`,`The margin covers the capacitance a class 2 ceramic loses under DC bias, plus spikes on the rail.`]}; }
],
20:[
 ()=>{ const [imp,met,L,W]=pick(CODES), toM=pick([true,false]), ii=[+imp.slice(0,2)/100,+imp.slice(2)/100];
   return {q:toM?`What is the metric size code of an imperial ${imp} chip?`:`What is the imperial size code of a metric ${met} chip?`, ans:+(toM?met:imp), show:toM?met:imp, unit:"", si:false, tol:0,
     steps:[`Imperial codes are hundredths of an inch: ${imp} is ${ii[0]} × ${ii[1]} in = ${+(ii[0]*25.4).toPrecision(3)} × ${+(ii[1]*25.4).toPrecision(3)} mm.`,`Metric codes are tenths of a millimetre of the nominal size, ${L} × ${W} mm, so the metric code is ${met}.`,`Imperial ${imp} = metric ${met}.${imp==="0201"?" Metric 0603 is this tiny part, not the common imperial 0603.":""}`]}; },
 ()=>{ const [nm,len]=pick([["0402",1.0],["0603",1.6],["0603",1.6],["0805",2.0],["1206",3.2]]), Lm=pick([10,15,20,25,30,40,50]), g=pick([0.3,0.4,0.5,0.6,0.8]),
     n=Math.floor((Lm*100+Math.round(g*100))/(Math.round(len*100)+Math.round(g*100))), used=n*len+(n-1)*g;
   return {q:`How many ${nm} parts, ${len} mm long, fit end to end along a ${Lm} mm strip of board with ${g} mm between neighbouring bodies?`, ans:n, unit:"parts", si:false, tol:0,
     steps:[`n parts take n · ${len} mm + (n − 1) · ${g} mm, and that must be at most ${Lm} mm.`,`So n ≤ (${Lm} + ${g}) / (${len} + ${g}) = ${+((Lm+g)/(len+g)).toPrecision(4)}, and n = ${n}.`,`Check: ${n} × ${len} + ${n-1} × ${g} = ${+used.toPrecision(4)} mm, which fits in ${Lm} mm.`]}; },
 ()=>{ const [pk,p,per,sides]=pick([["DIP",2.54,[4,7,8,10,14,20],2],["SOIC",1.27,[4,7,8,10,14],2],["TSSOP",0.65,[7,8,10,12,14],2],["QFN",0.5,[4,6,8,10,12],4]]), k=pick(per), sp=(k-1)*p;
   return {q:`A ${pk}-${k*sides} package has ${k} pins along each side at ${p} mm pitch. What is the distance between the centres of the first and last pin on one side, in millimetres?`, ans:sp, unit:"mm", si:false,
     steps:[`${k} pins in a row have ${k-1} gaps of one pitch between them: span = (n − 1) · pitch.`,`Span = ${k-1} × ${p} mm = ${+sp.toPrecision(4)} mm.`,`The body has to be longer than this to hold the pins, which is why fine pitch shrinks packages.`]}; },
 ()=>{ const [pk,p,ws]=pick([["SOIC",1.27,[0.55,0.6,0.65]],["TSSOP",0.65,[0.35,0.4,0.45]],["QFN",0.5,[0.25,0.28,0.3]],["QFN",0.4,[0.2,0.22,0.25]],["SOT-23-6",0.95,[0.55,0.6]]]), w=pick(ws), gap=p-w;
   return {q:`A ${pk} footprint has pads ${w} mm wide at ${p} mm pitch. How wide is the copper gap between neighbouring pads, in millimetres?`, ans:gap, unit:"mm", si:false,
     steps:[`Pitch runs centre to centre, so the gap is the pitch minus one pad width.`,`Gap = ${p} mm − ${w} mm = ${+gap.toPrecision(3)} mm.`,`Solder mask between the pads has to fit in this gap, and fabs set a minimum width for it. Check yours before choosing pads.`]}; }
],
21:[
 ()=>{ let I,dT,oz,ext,k,A,t,wmil,w; do{ I=pick([0.25,0.5,0.75,1,1.5,2,3,4,5]); dT=pick([5,10,20,30]); oz=pick([0.5,1,2]); ext=pick([true,false]); k=ext?0.048:0.024;
     A=Math.pow(I/(k*Math.pow(dT,0.44)),1/0.725); t=1.378*oz; wmil=A/t; w=wmil*0.0254; }while(w<0.1||w>8);
   return {q:`By IPC-2221, how wide must a trace on an ${ext?"outer":"inner"} layer be to carry ${f(I,"A")} with a ${dT} °C rise, in ${oz} oz copper? Give the width in millimetres.`, ans:w, unit:"mm", si:false,
     steps:[`Area: A = (I / (k · ΔT^0.44))^(1/0.725) with k = ${k} for an ${ext?"outer":"inner"} layer.`,`A = (${I} / (${k} × ${dT}^0.44))^1.379 = ${+A.toPrecision(3)} mil².`,`Thickness: ${oz} oz × 1.378 mil = ${+t.toPrecision(3)} mil, so w = ${+A.toPrecision(3)} / ${+t.toPrecision(3)} = ${+wmil.toPrecision(3)} mil.`,`w = ${+wmil.toPrecision(3)} mil × 0.0254 mm/mil = ${+w.toPrecision(3)} mm. Round up, and never below your fab's minimum.`]}; },
 ()=>{ let w,Lm,oz,I,R,V; do{ w=pick([0.15,0.2,0.25,0.3,0.4,0.5,0.8,1,1.5,2]); Lm=pick([10,20,30,50,80,100,150,200]); oz=pick([1,2]); I=pick([0.05,0.1,0.2,0.5,1,2,3]); R=1.72e-8*Lm*1e-3/(w*1e-3*35e-6*oz); V=I*R; }while(V<1e-3||V>1);
   return {q:`A ${w} mm wide, ${Lm} mm long trace in ${oz} oz copper (${35*oz} µm) carries ${f(I,"A")}. Using ρ = 1.72 × 10⁻⁸ Ω·m, what voltage does it drop, in volts?`, ans:V, unit:"V",
     steps:[`R = ρ · L / (w · t) = 1.72 × 10⁻⁸ Ω·m × ${Lm} mm / (${w} mm × ${35*oz} µm).`,`Cross-section: ${w} mm × ${35*oz} µm = ${+(w*0.035*oz).toPrecision(3)} mm², so R = ${f(R,"Ω")}.`,`V = ${f(I,"A")} × ${f(R,"Ω")} = ${f(V,"V")}, and the trace dissipates ${f(I*V,"W")}.`]}; },
 ()=>{ const L=pick([0.5,0.8,1,1.5,2,3,5,8,10])*1e-9, fr=pick([10,20,50,100,200,500])*1e6, X=2*Math.PI*fr*L;
   return {q:`A decoupling capacitor's loop has about ${f(L,"H")} of inductance. What impedance does that inductance alone present at ${f(fr,"Hz")}, in ohms?`, ans:X, unit:"Ω",
     steps:[`X_L = 2π · f · L.`,`X_L = 2π × ${f(fr,"Hz")} × ${f(L,"H")} = ${f(X,"Ω")}.`,`At these frequencies a 100 nF capacitor's own reactance is far smaller, so the loop sets the impedance.`]}; },
 ()=>{ const C=pick([10e-9,22e-9,47e-9,100e-9,220e-9,1e-6]), L=pick([0.5,0.8,1,1.5,2,3,5])*1e-9, fr=1/(2*Math.PI*Math.sqrt(L*C));
   return {q:`A ${f(C,"F")} capacitor sits in a loop with ${f(L,"H")} of inductance, its own included. At what frequency does it self-resonate, in hertz?`, ans:fr, unit:"Hz",
     steps:[`f = 1 / (2π · √(L · C)).`,`√(L · C) = √(${f(L,"H")} × ${f(C,"F")}) = ${f(Math.sqrt(L*C),"s")}.`,`f = 1 / (2π × ${f(Math.sqrt(L*C),"s")}) = ${f(fr,"Hz")}. Above this the capacitor behaves as an inductor.`]}; }
],
22:[
 ()=>{ const d=pick([0.2,0.25,0.3,0.4,0.5,0.6,0.8,1.0,1.2]), r=pick([0.05,0.075,0.1,0.125,0.15,0.2,0.25,0.3,0.4]), pad=+(d+2*r).toFixed(3), ring=+((pad-d)/2).toFixed(4);
   return {q:`A hole drilled ${d} mm sits in a ${pad} mm round pad. What is the annular ring, in millimetres?`, ans:ring, unit:"mm", si:false,
     steps:[`The ring is the copper left on each side: ring = (pad − drill) / 2.`,`Ring = (${pad} mm − ${d} mm) / 2 = ${ring} mm.`,`The drill can land off-centre, so the narrowest point can be less than ${ring} mm. Fabs set a minimum ring for that reason.`]}; },
 ()=>{ let w1,w2,dd,g; do{ w1=pick([0.15,0.2,0.25,0.3,0.4,0.5]); w2=pick([0.15,0.2,0.25,0.3,0.4,0.5]); dd=pick([0.3,0.35,0.4,0.45,0.5,0.6,0.7,0.8,1.0]); g=+(dd-(w1+w2)/2).toFixed(4); }while(g<0.05);
   return {q:`Two parallel traces, ${w1} mm and ${w2} mm wide, have their centres ${dd} mm apart. How wide is the copper gap between them, in millimetres?`, ans:g, unit:"mm", si:false,
     steps:[`Each trace extends half its width from its centre line: ${w1/2} mm and ${w2/2} mm.`,`Gap = ${dd} mm − (${w1} mm + ${w2} mm) / 2 = ${dd} mm − ${+((w1+w2)/2).toFixed(3)} mm = ${g} mm.`,`${g>=0.127?`That passes a typical 0.127 mm (5 mil) clearance rule.`:`That is below a typical 0.127 mm (5 mil) clearance rule; DRC would flag it.`}`]}; },
 ()=>{ let bx,by,P,r,g,nx,ny; do{ bx=pick([12,15,18,20,22,25,30,35,40,50]); by=pick([10,12,15,18,20,25,30,40]); P=pick([80,100,150]); r=pick([0,3,5]); g=pick([0,2]); const U=P-2*r; nx=Math.floor((U+g)/(bx+g)); ny=Math.floor((U+g)/(by+g)); }while(nx*ny<2);
   const U=P-2*r;
   return {q:`${bx} × ${by} mm boards go on a ${P} × ${P} mm panel with ${r?r+" mm rails on every side":"no rails"} and ${g?g+" mm gaps between boards":"V-scores with no gap"}. Without rotating any board, how many fit?`, ans:nx*ny, unit:"boards", si:false, tol:0,
     steps:[`Usable length: ${P} mm − 2 × ${r} mm = ${U} mm in each direction.`,`n = ⌊(usable + gap) / (board + gap)⌋. Along X: ⌊${U+g} / ${bx+g}⌋ = ${nx}. Along Y: ⌊${U+g} / ${by+g}⌋ = ${ny}.`,`${nx} × ${ny} = ${nx*ny} boards.`]}; },
 ()=>{ let r,dl,res; do{ r=pick([0,90,180,270]); dl=pick([90,180,270]); res=(r+dl)%360; }while(res===0);
   const ref=pick(["U3","Q2","D4","U7","LED1"]);
   return {q:`The placement file lists ${ref} at ${r}°. In the assembler's preview, ${ref} must turn a further ${dl}° counterclockwise to match its footprint. Rotations are counterclockwise, from 0 to 359°. What rotation do you enter, in degrees?`, ans:res, unit:"degrees", si:false, tol:0,
     steps:[`Add the correction: ${r}° + ${dl}° = ${r+dl}°.`,r+dl>=360?`Subtract a full turn to stay below 360°: ${r+dl}° − 360° = ${res}°.`:`That is already between 0 and 359°: ${res}°.`,`Note the offset for this footprint; the next order with the same part needs it too.`]}; }
]


};
BC.PROBLEMS=T;

/* ---------- UI: cards, grading, state ---------- */
BC.probCount = n=>(T[n]||[]).length;
const INSTANCES=new WeakMap();
const cardHTML=(key,p,label,id)=>`<form class="prob" data-key="${key}" novalidate>
  <div class="ph"><span class="label">${label}</span><span class="ok${S.probs[key]?" on":""}">✓ solved</span></div>
  <p class="pq">${esc(p.q)}</p>
  <div class="pin"><div class="ctrl"><label for="${id}"><span>Answer${p.unit?", in "+esc(p.unit):""}</span></label><input id="${id}" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${p.si===false?"a number":"4.7k, 15m, 2.2u"}"></div>
   <button class="btn primary" type="submit">Check</button><button class="btn" type="button" data-a="show">Show solution</button></div>
  <div class="pres" aria-live="polite" hidden></div></form>`;
let uid=0;
const make=(n,i,label)=>{ const p=T[n][i](), key=n+"-"+i; return {key,p,n,i,html:cardHTML(key,p,label,"pa"+(++uid))}; };
const reg=(root,c)=>{ INSTANCES.set(root.querySelector(`.prob[data-key="${c.key}"]`),{p:c.p,done:false,n:c.n,i:c.i}); };
const finish=(form,how,x)=>{
  const st=INSTANCES.get(form), p=st.p, key=form.dataset.key; if(st.done) return; st.done=true;
  const ok=how==="check"&&BC.grade(x,p), res=form.querySelector(".pres");
  form.querySelector("input").disabled=true; form.querySelectorAll("button").forEach(b=>b.disabled=true);
  const head=how==="show"?`<b>Solution.</b> Not graded.`:ok?`<b class="good">Correct.</b>`:`<b class="bad">Not quite.</b> You entered ${esc(ansText(x,p))}.`;
  res.innerHTML=`<p>${head} Answer: <b class="mono">${esc(ansText(p.ans,p))}</b></p><ol class="steps">${p.steps.map(s=>`<li>${esc(s)}</li>`).join("")}</ol><button class="btn" type="button" data-a="more">Another one</button>`;
  res.hidden=false;
  if(how==="check"){ if(ok){ BC.beep("good"); if(!S.probs[key]){ S.probs[key]=1; BC.save(); form.querySelector(".ok").classList.add("on"); BC.addXP(XP,"problem solved"); } } else BC.beep("bad"); }
};
/* fill root with cards for specs [{n,i,label}]; fresh(n,i)->{n,i,label} picks what "Another one" shows (default: the same template) */
BC.probMount = (root,specs,fresh)=>{
  const cs=specs.map(d=>make(d.n,d.i,d.label)); root.innerHTML=cs.map(c=>c.html).join(""); cs.forEach(c=>reg(root,c));
  if(root._pb) { root._pb.fresh=fresh; return; } root._pb={fresh};
  root.addEventListener("submit",e=>{ const form=e.target.closest(".prob"); if(!form) return; e.preventDefault();
    const st=INSTANCES.get(form); if(!st||st.done) return; const plain=st.p.si===false, inp=form.querySelector("input"), x=plain?BC.parseNum(inp.value):BC.parseSI(inp.value), res=form.querySelector(".pres");
    if(isNaN(x)){ res.hidden=false; res.innerHTML=plain?`<p class="bad">Enter a plain number, such as 12 or 0.65. A unit after it is ignored.</p>`:`<p class="bad">Enter a number, optionally with a prefix: 4.7k, 15m, 2.2u, 1M. A unit after it is ignored.</p>`; inp.focus(); return; }
    finish(form,"check",x); });
  root.addEventListener("click",e=>{ const b=e.target.closest("[data-a]"), form=b&&b.closest(".prob"); if(!form) return;
    if(b.dataset.a==="show") finish(form,"show");
    else if(b.dataset.a==="more"){ const st=INSTANCES.get(form), fr=root._pb.fresh, nx=fr?fr():{n:st.n,i:st.i,label:form.querySelector(".ph .label").textContent};
      const c=make(nx.n,nx.i,nx.label); form.outerHTML=c.html; reg(root,c); root.querySelector(`.prob[data-key="${c.key}"] input`).focus({preventScroll:true}); } });
};
/* drill pool: [[module, templateIndex], ...] for modules with templates, optionally limited to one part */
BC.probPool = part=>{ const out=[]; BC.DATA.M.forEach(c=>{ if((!part||c.part===part)&&T[c.n]) T[c.n].forEach((_,i)=>out.push([c.n,i])); }); return out; };
BC.probParts = ()=>[...new Set(BC.DATA.M.filter(c=>T[c.n]).map(c=>c.part))];
})();
