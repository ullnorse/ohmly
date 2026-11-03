/* Ohmly practice problems. BC.PROBLEMS[module] = [template, ...]; a template is () => ({q, ans, unit, tol?, std?, steps}).
   ans is in base SI units. tol defaults to 0.02 (relative). std:true also accepts the nearest E12 or E24 value. */
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
/* is the number x an accepted answer to problem p? */
BC.grade = (x,p)=>{
  if(!isFinite(x)) return false;
  if(Math.abs(x-p.ans)<=(p.tol??.02)*Math.abs(p.ans)*(1+1e-9)) return true;
  return !!p.std&&[12,24].some(s=>Math.abs(x-BC.nearestE(p.ans,s))<=1e-3*Math.abs(x));
};

/* ---------- helpers for templates ---------- */
const f=(v,u,d=3)=>BC.fmt(v,u,d), pick=BC.pick, rE=(lo,hi)=>pick(BC.e12List(lo,hi));
const pl=(v,u)=>+v.toPrecision(3)+" "+u;   /* plain base-unit number, for squared units */
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
]
};
BC.PROBLEMS=T;

/* ---------- UI: cards, grading, state ---------- */
BC.probCount = n=>(T[n]||[]).length;
const INSTANCES=new WeakMap();
const cardHTML=(key,p,label,id)=>`<form class="prob" data-key="${key}" novalidate>
  <div class="ph"><span class="label">${label}</span><span class="ok${S.probs[key]?" on":""}">✓ solved</span></div>
  <p class="pq">${esc(p.q)}</p>
  <div class="pin"><div class="ctrl"><label for="${id}"><span>Answer, in ${esc(p.unit)}</span></label><input id="${id}" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="4.7k, 15m, 2.2u"></div>
   <button class="btn primary" type="submit">Check</button><button class="btn" type="button" data-a="show">Show solution</button></div>
  <div class="pres" aria-live="polite" hidden></div></form>`;
let uid=0;
const make=(n,i,label)=>{ const p=T[n][i](), key=n+"-"+i; return {key,p,n,i,html:cardHTML(key,p,label,"pa"+(++uid))}; };
const reg=(root,c)=>{ INSTANCES.set(root.querySelector(`.prob[data-key="${c.key}"]`),{p:c.p,done:false,n:c.n,i:c.i}); };
const finish=(form,how,x)=>{
  const st=INSTANCES.get(form), p=st.p, key=form.dataset.key; if(st.done) return; st.done=true;
  const ok=how==="check"&&BC.grade(x,p), res=form.querySelector(".pres");
  form.querySelector("input").disabled=true; form.querySelectorAll("button").forEach(b=>b.disabled=true);
  const head=how==="show"?`<b>Solution.</b> Not graded.`:ok?`<b class="good">Correct.</b>`:`<b class="bad">Not quite.</b> You entered ${esc(f(x,p.unit))}.`;
  res.innerHTML=`<p>${head} Answer: <b class="mono">${esc(f(p.ans,p.unit))}</b></p><ol class="steps">${p.steps.map(s=>`<li>${esc(s)}</li>`).join("")}</ol><button class="btn" type="button" data-a="more">Another one</button>`;
  res.hidden=false;
  if(how==="check"){ if(ok){ BC.beep("good"); if(!S.probs[key]){ S.probs[key]=1; BC.save(); form.querySelector(".ok").classList.add("on"); BC.addXP(XP,"problem solved"); } } else BC.beep("bad"); }
};
/* fill root with cards for specs [{n,i,label}]; fresh(n,i)->{n,i,label} picks what "Another one" shows (default: the same template) */
BC.probMount = (root,specs,fresh)=>{
  const cs=specs.map(d=>make(d.n,d.i,d.label)); root.innerHTML=cs.map(c=>c.html).join(""); cs.forEach(c=>reg(root,c));
  if(root._pb) { root._pb.fresh=fresh; return; } root._pb={fresh};
  root.addEventListener("submit",e=>{ const form=e.target.closest(".prob"); if(!form) return; e.preventDefault();
    const st=INSTANCES.get(form); if(!st||st.done) return; const inp=form.querySelector("input"), x=BC.parseSI(inp.value), res=form.querySelector(".pres");
    if(isNaN(x)){ res.hidden=false; res.innerHTML=`<p class="bad">Enter a number, optionally with a prefix: 4.7k, 15m, 2.2u, 1M. A unit after it is ignored.</p>`; inp.focus(); return; }
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
