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
]};
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
