"use strict";
const APP_VER="202610310157";
/* ===== Análise automática de pacotes de multitrack ===== */
const KIND_RULES=[
  ["click",/click|clique|metr[oô]nomo|metronome/i],
  ["guide",/guia|guide|\bcues?\b/i],
  ["pad",/(^|[^a-z])pads?([^a-z]|$)/i],
  ["drums",/bateria|batera|drum|tambor|perc|kick|snare|\btoms?\b|caj[oó]n|shaker|tamb/i],
  ["bass",/bass|baixo|\bsub\b/i],
  ["gtr",/gtr|guit|viol[aã]o|\bag\b|\beg\b|drive|lead gtr/i],
  ["keys",/org[aã]o|organ|piano|keys|teclad|synt|synth|rhodes|wurli|string|cordas|loop|arp|bell/i],
  ["vox",/vocal|voz|vox|\bbv\b|back|coro|choir/i]];
function detectKind(name){for(const [k,re] of KIND_RULES)if(re.test(name))return k;return"other"}
const KIND_ORDER={click:0,guide:1,drums:2,bass:3,gtr:4,keys:5,vox:6,pad:7,other:8};

/* Nome e artista a partir do nome do pacote: "FERNANDINHO - MOISES" */
function titleCase(s){return s.toLowerCase().replace(/(^|[\s(\-/])([\p{L}])/gu,(m,a,b)=>a+b.toUpperCase())}
function parsePackageName(n){n=(n||"").replace(/\.[^.]+$/,"").replace(/^\d{6,}_/,"").replace(/_/g," ").replace(/\s+/g," ").trim();
  /* tira do nome o que é técnico: tom, BPM, afinação (ex.: "F# Minor-70bpm-441hz") */
  const n0=n;n=n.replace(/[\s-]*\(?\b\d{2,3}(?:[.,]\d)?\s?bpm\b\)?/gi,"").replace(/[\s-]*\b4[34]\d\s?hz\b/gi,"")
     .replace(/[\s-]*\b[A-G](?:#|b|♯|♭)?\s?(?:[Mm]aior|[Mm]enor|[Mm]ajor|[Mm]inor|maj|min|m)\b/g,"").replace(/[\s-]*\(\s*\)/g,"").replace(/[\s-]+$/,"").replace(/\s+/g," ").trim();
  if(n!==n0&&!/\s[-–]\s/.test(n))n=n.replace(/(\S)-(\S)/g,(m,x,y)=>/[A-Za-zÀ-ú]/.test(x)&&/[A-Za-zÀ-ú]/.test(y)&&/[A-ZÀ-Ú]/.test(y)?x+" - "+y:m);
  const p=n.split(/\s+-\s+|\s+–\s+/);if(p.length>=2)return{artist:titleCase(p[0]),title:titleCase(p.slice(1).join(" - "))};return{artist:"",title:titleCase(n)}}

/* Mono em taxa reduzida para análise */
function toMonoDown(chans,factor){const n=Math.floor(chans[0].length/factor),out=new Float32Array(n),c=chans.length;
  for(let i=0;i<n;i++){let s=0;const b=i*factor;for(let k=0;k<factor;k++)for(let j=0;j<c;j++)s+=chans[j][b+k];out[i]=s/(factor*c)}return out}

/* Picos (para desenhar a onda) e último som */
function peaksOf(chans,buckets){const len=chans[0].length,out=new Array(buckets).fill(0),per=len/buckets;let mx=0,last=0;
  for(let b=0;b<buckets;b++){const a=Math.floor(b*per),e=Math.min(len,Math.floor((b+1)*per));let m=0;
    for(const ch of chans)for(let i=a;i<e;i+=8){const v=ch[i]<0?-ch[i]:ch[i];if(v>m)m=v}out[b]=m;if(m>mx)mx=m}
  const thr=0.01;for(let b=buckets-1;b>=0;b--)if(out[b]>thr){last=(b+1)*per;break}
  return{peaks:out.map(v=>Math.round(v*100)/100),max:mx,lastSample:last}}

/* BPM e primeiro tempo a partir da faixa de click */
function detectClick(mono,sr){let mx=0;for(let i=0;i<mono.length;i++){const v=Math.abs(mono[i]);if(v>mx)mx=v}
  if(mx<0.01)return null;const th=0.3*mx,ref=Math.floor(0.15*sr),t=[];
  for(let i=0;i<mono.length;){if(Math.abs(mono[i])>th){t.push(i/sr);i+=ref}else i++}
  if(t.length<8)return null;const d=[];for(let i=1;i<t.length;i++)d.push(t[i]-t[i-1]);
  const sorted=[...d].sort((a,b)=>a-b),med=sorted[Math.floor(sorted.length/2)];
  const good=d.filter(x=>Math.abs(x-med)<0.02);const avg=good.reduce((a,b)=>a+b,0)/good.length;
  let bpm=60/avg;if(Math.abs(bpm-Math.round(bpm))<0.12)bpm=Math.round(bpm);else bpm=Math.round(bpm*10)/10;
  return{bpm,offset:Math.round(t[0]*1000)/1000,clicks:t.length,steady:good.length/d.length}}

/* Tom por croma (perfis de Krumhansl) */
function fftMag(re){const n=re.length,im=new Float64Array(n);
  for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){const t=re[i];re[i]=re[j];re[j]=t}}
  for(let len=2;len<=n;len<<=1){const ang=-2*Math.PI/len,wr=Math.cos(ang),wi=Math.sin(ang);
    for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let k=0;k<len/2;k++){const a=i+k,b=a+len/2,tr=re[b]*cr-im[b]*ci,ti=re[b]*ci+im[b]*cr;
      re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;const ncr=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=ncr}}}
  const m=new Float64Array(n/2);for(let i=0;i<n/2;i++)m[i]=re[i]*re[i]+im[i]*im[i];return m}
function chromaOf(mono,sr,t0,t1){const N=8192,hop=4096,c=new Float64Array(12),win=new Float64Array(N);for(let i=0;i<N;i++)win[i]=0.5-0.5*Math.cos(2*Math.PI*i/(N-1));
  const bins=[];for(let k=1;k<N/2;k++){const f=k*sr/N;if(f>55&&f<1800)bins.push([k,((Math.round(12*Math.log2(f/440))+69)%12+12)%12])}
  const a=Math.max(0,Math.floor(t0*sr)),b=Math.min(mono.length-N,Math.floor(t1*sr));
  for(let s=a;s<b;s+=hop){const re=new Float64Array(N);for(let i=0;i<N;i++)re[i]=mono[s+i]*win[i];const m=fftMag(re);for(const [k,p] of bins)c[p]+=m[k]}
  let sum=0;for(const v of c)sum+=v;if(sum>0)for(let i=0;i<12;i++)c[i]/=sum;return c}
function detectKey(chromas){const c=new Float64Array(12);chromas.forEach(x=>{for(let i=0;i<12;i++)c[i]+=x[i]});
  const maj=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88],mi=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
  const corr=(p,r)=>{const x=[],y=[...c];for(let i=0;i<12;i++)x.push(p[((i-r)%12+12)%12]);const mx=x.reduce((a,b)=>a+b)/12,my=y.reduce((a,b)=>a+b)/12;
    let n=0,dx=0,dy=0;for(let i=0;i<12;i++){n+=(x[i]-mx)*(y[i]-my);dx+=(x[i]-mx)**2;dy+=(y[i]-my)**2}return n/Math.sqrt(dx*dy||1)};
  const r=[];for(let i=0;i<12;i++){r.push({i,minor:false,s:corr(maj,i)});r.push({i,minor:true,s:corr(mi,i)})}
  r.sort((a,b)=>b.s-a.s);return{best:r[0],alt:r[1],confidence:r[0].s-r[1].s}}

/* Seções a partir da guia: fala + contagem de 1 compasso antes de cada parte */
function detectSections(mono,sr,bpm,offset,sig){const hopS=0.02,h=Math.floor(sr*hopS),n=Math.floor(mono.length/h),e=new Float32Array(n);
  for(let i=0;i<n;i++){let s=0;for(let j=i*h;j<(i+1)*h;j++)s+=mono[j]*mono[j];e[i]=Math.sqrt(s/h)}
  let mx=0;for(const v of e)if(v>mx)mx=v;if(mx<0.01)return[];const th=Math.max(0.01,mx*0.03),gap=Math.round(0.3/hopS),segs=[];
  for(let i=0;i<n;){if(e[i]>th){let j=i,quiet=0;while(j<n&&quiet<gap){quiet=e[j]>th?0:quiet+1;j++}segs.push([i*hopS,(j-quiet)*hopS]);i=j}else i++}
  const bar=(sig||4)*60/bpm,starts=[];
  for(const [a,b] of segs){const d=b-a;if(d<bar*0.8||d>bar*1.2)continue;
    const st=Math.round((a-offset)/bar)*bar+bar+offset;
    if(starts.length&&st-starts[starts.length-1]<=2.01*bar)starts[starts.length-1]=st;else starts.push(st)}
  const out=[{name:"Intro",t:0}];starts.forEach((t,i)=>{if(t>bar*0.5)out.push({name:"Parte "+(i+1),t:Math.round(t*1000)/1000})});
  return out}

/* ===== Análise de uma música inteira (um MP3): batida, acordes e seções ===== */
const NOTE_SHARP=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"],NOTE_FLAT=["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
const FLAT_KEYS=new Set(["F","Bb","Eb","Ab","Db","Gb","Dm","Gm","Cm","Fm","Bbm","Ebm"]);
function chordName(root,minor,keyLabel){const names=FLAT_KEYS.has(keyLabel)||/b/.test(keyLabel||"")?NOTE_FLAT:NOTE_SHARP;return names[((root%12)+12)%12]+(minor?"m":"")}
function parseChord(c){const m=/^([A-G])([#b]?)(.*)$/.exec(c||"");if(!m)return null;const idx={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1]]+(m[2]==="#"?1:m[2]==="b"?-1:0);return{root:(idx+12)%12,rest:m[3],flat:m[2]==="b"}}
function transposeChord(c,semi){if(!semi)return c;return String(c).split("/").map(part=>{const p=parseChord(part);if(!p)return part;const names=p.flat||semi<0?NOTE_FLAT:NOTE_SHARP;return names[(p.root+semi+120)%12]+p.rest}).join("/")}

const clampNum=(v,a,b)=>Math.min(b,Math.max(a,v));
/* Envelope de ataques (fluxo espectral) */
function onsetEnvelope(mono,sr){const N=1024,hop=256,n=Math.floor((mono.length-N)/hop);if(n<10)return{env:new Float32Array(0),hopS:hop/sr};
  const win=new Float64Array(N);for(let i=0;i<N;i++)win[i]=0.5-0.5*Math.cos(2*Math.PI*i/(N-1));
  let prev=new Float64Array(N/2);const env=new Float32Array(n);
  for(let f=0;f<n;f++){const re=new Float64Array(N);const o=f*hop;for(let i=0;i<N;i++)re[i]=mono[o+i]*win[i];const m=fftMag(re);let s=0;
    for(let k=1;k<N/2;k++){const v=Math.log1p(100*Math.sqrt(m[k]));const d=v-prev[k];if(d>0)s+=d;prev[k]=v}env[f]=s}
  let mean=0;for(const v of env)mean+=v;mean/=n;for(let i=0;i<n;i++)env[i]=Math.max(0,env[i]-mean);return{env,hopS:hop/sr}}

/* Andamento: autocorrelação + ajuste fino pelo alinhamento da grade na música inteira */
function detectTempoMix(env,hopS){const n=env.length;if(n<200)return null;
  const score=(lag)=>{let s=0;for(let i=0;i+lag<n;i++)s+=env[i]*env[i+lag];return s/(n-lag)};
  let best=null;for(let bpm=60;bpm<=190;bpm+=0.5){const lag=60/bpm/hopS,l0=Math.floor(lag),fr=lag-l0;const v=score(l0)*(1-fr)+score(l0+1)*fr;
    const w=Math.exp(-0.5*Math.pow(Math.log2(bpm/120)/0.9,2));const sc=v*w;if(!best||sc>best.sc)best={bpm,sc}}
  const grid=(bpm)=>{const P=60/bpm/hopS;let bestPh=0,bestS=-1;const steps=64;for(let k=0;k<steps;k++){const ph=k*P/steps;let s=0,c=0;for(let t=ph;t<n-1;t+=P){const i=Math.floor(t),fr=t-i;s+=env[i]*(1-fr)+env[i+1]*fr;c++}s/=c||1;if(s>bestS){bestS=s;bestPh=ph}}return{s:bestS,ph:bestPh}};
  // período preciso: pico da autocorrelação em 8, 16, 32 e 64 batidas (interpolação parabólica)
  const P0=60/best.bpm/hopS;let period=P0;
  for(const mlt of [8,16,32,64]){const c=mlt*period,lo=Math.floor(c-period*0.2),hi=Math.ceil(c+period*0.2);if(hi+2>=n*0.7)break;let bi=lo,bv=-1;const sc=[];
    for(let l=lo;l<=hi;l++){const v=score(l);sc[l]=v;if(v>bv){bv=v;bi=l}}
    const y0=sc[bi-1]??bv,y2=sc[bi+1]??bv,den=y0-2*bv+y2,dx=den?0.5*(y0-y2)/den:0;period=(bi+clampNum(dx,-0.5,0.5))/mlt}
  let fine={bpm:60/(period*hopS)};
  let bpm=fine.bpm;if(Math.abs(bpm-Math.round(bpm))<0.12)bpm=Math.round(bpm);else bpm=Math.round(bpm*10)/10;
  const g=grid(bpm);return{bpm,phase:g.ph*hopS+512*hopS/256}}

/* Croma por quadro: harmônico (65 Hz–2 kHz) e grave (40–200 Hz) */
function chromaFrames(mono,sr){const N=4096,hop=1024,n=Math.max(0,Math.floor((mono.length-N)/hop));const win=new Float64Array(N);for(let i=0;i<N;i++)win[i]=0.5-0.5*Math.cos(2*Math.PI*i/(N-1));
  const map=[];for(let k=1;k<N/2;k++){const f=k*sr/N;if(f<40||f>2000)continue;const p=((Math.round(12*Math.log2(f/440))+69)%12+12)%12;map.push([k,p,f<200,f>=65])}
  const ch=[],bass=[],rms=[];for(let fr=0;fr<n;fr++){const re=new Float64Array(N);const o=fr*hop;let e=0;for(let i=0;i<N;i++){const v=mono[o+i];re[i]=v*win[i];e+=v*v}const m=fftMag(re);
    const c=new Float64Array(12),b=new Float64Array(12);for(const [k,p,lo,hi] of map){const v=Math.sqrt(m[k]);if(hi)c[p]+=v;if(lo)b[p]+=v}ch.push(c);bass.push(b);rms.push(Math.sqrt(e/N))}
  return{ch,bass,rms,hopS:hop/sr}}
const norm12=v=>{let s=0;for(const x of v)s+=x*x;s=Math.sqrt(s)||1;return v.map(x=>x/s)};

/* Acordes por tempo, com suavização (Viterbi) e preferência pelos acordes do tom */
function detectChordsMix(frames,beats,keyRoot,keyMinor,keyLabel){const B=beats.length-1;if(B<4)return[];
  const T=[];for(let r=0;r<12;r++)for(const mi of [0,1]){const t=new Float64Array(12);t[r]=1;t[(r+(mi?3:4))%12]=0.85;t[(r+7)%12]=0.8;T.push({r,mi,t:norm12(t)})}
  const tonic=keyMinor?(keyRoot+3)%12:keyRoot;const dia=new Set([[0,0],[2,1],[4,1],[5,0],[7,0],[9,1]].map(([o,mi])=>((tonic+o)%12)+":"+mi));
  const bc=[],bb=[];for(let i=0;i<B;i++){const a=Math.floor(beats[i]/frames.hopS),z=Math.max(a+1,Math.floor(beats[i+1]/frames.hopS));const c=new Float64Array(12),b=new Float64Array(12);let cnt=0;
    for(let f=a;f<z&&f<frames.ch.length;f++){for(let p=0;p<12;p++){c[p]+=frames.ch[f][p];b[p]+=frames.bass[f][p]}cnt++}bc.push(cnt?norm12(c):null);bb.push(cnt?norm12(b):null)}
  const K=T.length,em=bc.map((c,i)=>T.map(x=>{if(!c)return 0;let s=0;for(let p=0;p<12;p++)s+=c[p]*x.t[p];s+=0.45*(bb[i]?bb[i][x.r]:0);if(dia.has(x.r+":"+x.mi))s+=0.12;return s}));
  const change=0.14;let prev=em[0].slice(),back=[];for(let i=1;i<B;i++){let bestPrev=0;for(let k=1;k<K;k++)if(prev[k]>prev[bestPrev])bestPrev=k;const cur=new Array(K),bk=new Array(K);
    for(let k=0;k<K;k++){const stay=prev[k],sw=prev[bestPrev]-change;if(stay>=sw){cur[k]=stay+em[i][k];bk[k]=k}else{cur[k]=sw+em[i][k];bk[k]=bestPrev}}back.push(bk);prev=cur}
  let k=0;for(let j=1;j<K;j++)if(prev[j]>prev[k])k=j;const path=new Array(B);path[B-1]=k;for(let i=B-2;i>=0;i--){k=back[i][k];path[i]=k}
  const out=[];for(let i=0;i<B;i++){const x=T[path[i]],name=chordName(x.r,x.mi,keyLabel);if(!out.length||out[out.length-1].c!==name)out.push({t:Math.round(beats[i]*1000)/1000,c:name,b:i})}
  // acordes de menos de 2 tempos entram no anterior
  for(let pass=0;pass<3;pass++){for(let i=1;i<out.length;i++){const len=(out[i+1]?out[i+1].b:B)-out[i].b;if(len<2){out.splice(i,1);i--}}
    for(let i=1;i<out.length;i++)if(out[i].c===out[i-1].c){out.splice(i,1);i--}}
  return out}

/* Seções: novidade na matriz de auto-similaridade por compasso + rótulos por repetição e energia */
function detectSectionsMix(frames,beats,sig,chords,given){const bars=[];for(let i=0;i+sig<beats.length;i+=sig)bars.push([beats[i],beats[i+sig]]);const nb=bars.length;if(nb<12)return[{name:"Intro",t:0}];
  const feat=bars.map(([a,z])=>{const fa=Math.floor(a/frames.hopS),fz=Math.max(fa+1,Math.floor(z/frames.hopS));const c=new Float64Array(12);let e=0,cnt=0;
    for(let f=fa;f<fz&&f<frames.ch.length;f++){for(let p=0;p<12;p++)c[p]+=frames.ch[f][p];e+=frames.rms[f];cnt++}return{c:norm12(c),e:cnt?e/cnt:0}});
  const emax=Math.max(...feat.map(f=>f.e))||1;feat.forEach(f=>f.e/=emax);
  const sim=(i,j)=>{let s=0;for(let p=0;p<12;p++)s+=feat[i].c[p]*feat[j].c[p];return 0.75*s+0.25*(1-Math.abs(feat[i].e-feat[j].e))};
  const W=4,nov=new Float64Array(nb);for(let i=W;i<nb-W;i++){let s=0;for(let a=-W;a<W;a++)for(let b=-W;b<W;b++){const sg=(a<0)===(b<0)?1:-1;s+=sg*sim(i+a,i+b)}nov[i]=Math.max(0,s)}
  const nmax=Math.max(...nov)||1;let bounds=[0];const minLen=4,barLen=bars[0][1]-bars[0][0];
  if(given&&given.length>1){bounds=[...new Set(given.map(t=>Math.max(0,Math.min(nb-1,Math.round((t-beats[0])/barLen)))))].sort((a,b)=>a-b);if(bounds[0]!==0)bounds.unshift(0)}
  else{const cand=[...nov].map((v,i)=>({i,v:v/nmax})).filter(x=>x.v>0.22&&x.i>=minLen&&x.i<=nb-2).sort((a,b)=>b.v-a.v);
    for(const c of cand){if(bounds.every(b=>Math.abs(b-c.i)>=minLen))bounds.push(c.i)}bounds.sort((a,b)=>a-b)}
  const segs=[...new Set(bounds)].sort((a,b)=>a-b).map((b,k,arr)=>({a:b,z:k+1<arr.length?arr[k+1]:nb}));
  segs.forEach(s=>{s.e=0;const c=new Float64Array(12);for(let i=s.a;i<s.z;i++){s.e+=feat[i].e;for(let p=0;p<12;p++)c[p]+=feat[i].c[p]}s.e/=(s.z-s.a);s.c=norm12(c)});
  const ssim=(x,y)=>{let s=0;for(let p=0;p<12;p++)s+=x.c[p]*y.c[p];return s-1.2*Math.abs(x.e-y.e)-0.02*Math.abs((x.z-x.a)-(y.z-y.a))};
  let cl=0;segs.forEach((s,i)=>{if(s.cl!=null)return;s.cl=cl;for(let j=i+1;j<segs.length;j++)if(segs[j].cl==null&&ssim(s,segs[j])>0.93)segs[j].cl=cl;cl++});
  const info={};segs.forEach(s=>{const x=info[s.cl]||(info[s.cl]={n:0,e:0});x.n++;x.e+=s.e});Object.values(info).forEach(x=>x.e/=x.n);
  const rep=Object.entries(info).filter(([k,x])=>x.n>1).sort((a,b)=>b[1].e-a[1].e);
  const chorus=rep.length?+rep[0][0]:null,verse=rep.length>1?+rep[1][0]:null;
  const names=segs.map((s,i)=>{if(i===0&&s.e<0.6&&s.cl!==chorus)return"Intro";if(i===segs.length-1&&s.z-s.a<=8&&s.cl!==chorus)return"Final";
    if(s.cl===chorus)return"Refrão";if(s.cl===verse)return"Verso";if(segs[i+1]&&segs[i+1].cl===chorus&&s.z-s.a<=8)return"Pré-refrão";
    if(info[s.cl].n===1&&i>segs.length/2)return"Ponte";return info[s.cl].n>1?"Interlúdio":"Instrumental"});
  const count={},tot={};names.forEach(n=>tot[n]=(tot[n]||0)+1);
  const keepT=given&&given.length>1?[...given].sort((a,b)=>a-b):null;
  return segs.map((s,i)=>{const n=names[i];count[n]=(count[n]||0)+1;const label=tot[n]>1&&!/Intro|Final/.test(n)?n+" "+count[n]:n;
    let t=i===0?0:bars[s.a][0];if(keepT){const near=keepT.reduce((b,x)=>Math.abs(x-t)<Math.abs(b-t)?x:b,keepT[0]);if(Math.abs(near-t)<barLen*0.75)t=near}
    return{name:label,t:Math.round(t*1000)/1000}})}

/* Junta tudo para um MP3 único */
function analyzeMix(mono,sr,known){let tp;if(known&&known.bpm){tp={bpm:known.bpm,phase:known.offset||0}}else{const on=onsetEnvelope(mono,sr);tp=detectTempoMix(on.env,on.hopS)}if(!tp)return null;
  const beatLen=60/tp.bpm,dur=mono.length/sr,beats=[];for(let t=tp.phase;t<dur;t+=beatLen)beats.push(t);
  const fr=chromaFrames(mono,sr);const totalC=new Float64Array(12);fr.ch.forEach(c=>{for(let p=0;p<12;p++)totalC[p]+=c[p]});const sum=totalC.reduce((a,b)=>a+b,0)||1;
  const key=detectKey([Array.from(totalC,v=>v/sum)]);const keyLabel=keyName(key.best.i,key.best.minor);
  let chords=detectChordsMix(fr,beats,key.best.i,key.best.minor,keyLabel);
  // tempo 1 do compasso: fase em que as trocas de acorde mais caem
  const sig=(known&&known.sig)||4,hits=new Array(sig).fill(0);chords.forEach(c=>hits[c.b%sig]++);const down=known&&known.bpm?0:hits.indexOf(Math.max(...hits));
  const barLen=sig*beatLen;let firstDown=beats[down]%barLen;if(firstDown>barLen-0.08)firstDown-=barLen;firstDown=Math.max(0,firstDown);const barBeats=[];for(let t=firstDown;t<dur;t+=beatLen)barBeats.push(t);const offset=Math.round(firstDown*1000)/1000;
  const sections=detectSectionsMix(fr,barBeats,sig,chords,known&&known.bounds);
  chords=chords.map(({t,c})=>({t,c}));
  return{bpm:tp.bpm,offset,key:keyLabel,keyAlt:keyName(key.alt.i,key.alt.minor),keyConf:key.confidence,chords,sections,sig}}

/* Numera nomes repetidos: Verso 1, Verso 2… (Intro e Final ficam sem número) */
const GENERIC_SEC=/^(parte|se[cç][aã]o|nova se[cç][aã]o)\b/i;
function renumberSections(ms){const base=m=>m.name.replace(/\s+\d+$/,"").trim(),tot={},cnt={};const sorted=[...ms].sort((a,b)=>a.t-b.t);
  sorted.forEach(m=>{const b=base(m);tot[b]=(tot[b]||0)+1});sorted.forEach(m=>{const b=base(m);cnt[b]=(cnt[b]||0)+1;m.name=tot[b]>1&&!/^(Intro|Final|Tag)$/i.test(b)&&!GENERIC_SEC.test(b)?b+" "+cnt[b]:b});return ms}

/* ================= Utilidades ================= */
const $=s=>document.querySelector(s);
const uid=()=>Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=s=>{if(!isFinite(s)||s<0)s=0;const m=Math.floor(s/60),x=Math.floor(s%60);return m+":"+String(x).padStart(2,"0")};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const KEYS=["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"],KEYS_MIN=["C","C#","D","D#","E","F","F#","G","G#","A","Bb","B"];
const ALT={Db:"C#","D#":"Eb",Gb:"F#","G#":"Ab","A#":"Bb",Cb:"B","E#":"F",Fb:"E","B#":"C"};
function parseKey(k){const m=/^\s*([A-Ga-g])([#b]?)\s*(m(?!aj))?/.exec(k||"");if(!m)return null;let r=m[1].toUpperCase()+m[2];r=ALT[r]||r;const i=KEYS.indexOf(r);return i<0?null:{i,minor:!!m[3]}}
const keyName=(i,mi)=>(mi?KEYS_MIN:KEYS)[((i%12)+12)%12]+(mi?"m":"");
const transposeKey=(k,s)=>{const p=parseKey(k);return p?keyName(p.i+s,p.minor):(k||"—")};
const midiHz=m=>440*Math.pow(2,(m-69)/12);
const KIND={click:{l:"Click",v:"--k-click"},guide:{l:"Guia",v:"--k-guide"},drums:{l:"Bateria / perc.",v:"--k-drums"},bass:{l:"Baixo",v:"--k-bass"},gtr:{l:"Guitarra / violão",v:"--k-gtr"},keys:{l:"Teclas / synth",v:"--k-keys"},vox:{l:"Voz",v:"--k-vox"},pad:{l:"Pad",v:"--k-pad"},other:{l:"Outro",v:"--k-other"}};
const LEFT=new Set(["click","guide"]);
const isMobile=/iPhone|iPad|Android/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
const AUDIO_EXT=/\.(mp3|wav|wave|m4a|aac|aif|aiff|flac|ogg|oga|opus|caf)$/i;
let cssCache={};const cv=n=>cssCache[n]||(cssCache[n]=getComputedStyle(document.documentElement).getPropertyValue(n).trim());
let toastT;function toast(msg,ms=3600){const t=$("#toast");t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,ms)}
function busy(label,p){const b=$("#busy");if(label==null){b.hidden=true;return}b.hidden=false;$("#busyLabel").textContent=label;$("#busyBar").style.width=Math.round((p||0)*100)+"%"}

/* ================= Armazenamento no aparelho ================= */
let db=null;
function idbOpen(){return new Promise(res=>{try{const r=indexedDB.open("dds-multitrack",1);r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore("songs",{keyPath:"id"});d.createObjectStore("setlists",{keyPath:"id"});d.createObjectStore("stems");d.createObjectStore("meta")};r.onsuccess=()=>res(r.result);r.onerror=()=>res(null);r.onblocked=()=>res(null)}catch(e){res(null)}})}
function idb(store,mode,fn){if(!db)return Promise.resolve(null);return new Promise(res=>{try{const tx=db.transaction(store,mode);const req=fn(tx.objectStore(store));tx.oncomplete=()=>res(req&&"result"in req?req.result:true);tx.onerror=tx.onabort=()=>res(null)}catch(e){res(null)}})}
const timers={};
function saveSong(s,o){if(!s.demo&&!(o&&o.local)){s.dirty=true;s.updatedAt=Date.now();Sync.soon()}clearTimeout(timers[s.id]);timers[s.id]=setTimeout(()=>idb("songs","readwrite",st=>st.put(JSON.parse(JSON.stringify(s)))),350)}
function saveSet(x,o){if(!(o&&o.local)){x.dirty=true;x.auto=false;x.updatedAt=Date.now();Sync.soon()}idb("setlists","readwrite",st=>st.put(JSON.parse(JSON.stringify(x))))}
function saveMeta(){clearTimeout(timers.meta);timers.meta=setTimeout(()=>idb("meta","readwrite",st=>st.put({settings:S.settings,currentSet:S.currentSet,lastSong:S.curSongId},"state")),300)}

/* ================= Estado ================= */
const S={have:new Set(),songs:[],sets:[],currentSet:null,idx:-1,curSongId:null,side:"set",tab:"tracks",confirm:null,
  settings:{master:0.9,clickVol:0.7,padVol:0.45,padOn:false,padKey:null,minBg:"keys",iem:false,jumpMode:"bar",preload:isMobile?"end":"always"}};
const songById=id=>S.songs.find(s=>s.id===id);
const curSet=()=>S.sets.find(s=>s.id===S.currentSet)||S.sets[0];
const curSong=()=>songById(S.curSongId);
function newSong(o){return Object.assign({id:uid(),name:"Sem nome",artist:"",key:"—",bpm:120,sig:4,beatOffset:0,duration:0,trimStart:0,trimEnd:null,semi:0,tempo:100,applied:{semi:0,tempo:100},click:{on:false,sub:1,countIn:0},markers:[],tracks:[]},o)}
const memStems=new Map();

/* ================= Motor de áudio ================= */
const E={ctx:null,node:null,ready:null,SR:44100,decks:[],cur:null,vamp:null,queued:null,clickNodes:[],padVoice:null,padKey:null,wake:null};
/* iPhone: a chave de silencioso (e o modo "ambiente") cala o Web Audio. Pedimos a sessão de "reprodução"
   e tocamos um <audio> mudo em loop, que faz o iOS tratar o app como player de música. */
let iosKeep=null;
function silentWav(){const sr=8000,n=sr/2,b=new ArrayBuffer(44+n),v=new DataView(b),w=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
  w(0,"RIFF");v.setUint32(4,36+n,true);w(8,"WAVEfmt ");v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr,true);v.setUint16(32,1,true);v.setUint16(34,8,true);w(36,"data");v.setUint32(40,n,true);
  for(let i=0;i<n;i++)v.setUint8(44+i,128);return URL.createObjectURL(new Blob([b],{type:"audio/wav"}))}
function unlockAudio(){try{if(navigator.audioSession&&navigator.audioSession.type!=="playback")navigator.audioSession.type="playback"}catch(e){}
  try{if(!iosKeep){iosKeep=document.createElement("audio");iosKeep.src=silentWav();iosKeep.loop=true;iosKeep.setAttribute("playsinline","");iosKeep.setAttribute("x-webkit-airplay","deny");iosKeep.preload="auto"}
    if(iosKeep.paused){const pr=iosKeep.play();if(pr&&pr.catch)pr.catch(()=>{})}}catch(e){}
  if(E.ctx&&E.ctx.state!=="running"){const r=E.ctx.resume();if(r&&r.catch)r.catch(()=>{})}}
["pointerdown","touchend","click","keydown"].forEach(ev=>document.addEventListener(ev,unlockAudio,{capture:true,passive:true}));
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&E.ctx&&E.ctx.state!=="running"){const r=E.ctx.resume();if(r&&r.catch)r.catch(()=>{})}});
function ensureCtx(){unlockAudio();
  if(E.ctx){if(E.ctx.state!=="running")E.ctx.resume();return E.ctx}
  const AC=window.AudioContext||window.webkitAudioContext;let c;
  try{c=new AC({sampleRate:44100,latencyHint:"interactive"})}catch(e){c=new AC({latencyHint:"interactive"})}
  E.ctx=c;E.SR=c.sampleRate;c.onstatechange=()=>{if(c.state==="interrupted"||c.state==="suspended"){if(E.cur&&E.cur.playing&&!document.hidden)c.resume().catch(()=>{})}};
  E.master=c.createGain();const lim=c.createDynamicsCompressor();lim.threshold.value=-1.5;lim.knee.value=0;lim.ratio.value=20;lim.attack.value=0.002;lim.release.value=0.08;E.master.connect(lim).connect(c.destination);
  E.clickGain=c.createGain();E.clickPan=c.createStereoPanner();E.clickGain.connect(E.clickPan).connect(E.master);
  E.padFilter=c.createBiquadFilter();E.padFilter.type="lowpass";E.padFilter.frequency.value=900;E.padFilter.Q.value=0.4;
  const lfo=c.createOscillator(),lg=c.createGain();lfo.frequency.value=0.07;lg.gain.value=320;lfo.connect(lg).connect(E.padFilter.frequency);lfo.start();
  E.padGain=c.createGain();E.padPan=c.createStereoPanner();E.padFilter.connect(E.padGain).connect(E.padPan).connect(E.master);
  E.decks=[new Deck(0),new Deck(1)];E.cur=E.decks[0];
  E.ready=loadWorklet();E.ready.catch(err=>toast(err.message,8000));
  applyGlobalMix();setInterval(engineTick,25);
  return c}
async function loadWorklet(){const c=E.ctx;
  try{await c.audioWorklet.addModule("mixer-worklet.js?v="+APP_VER)}catch(e){throw new Error("Este navegador não suporta o mixer de áudio. Use Chrome, Edge ou Safari atualizados.")}
  E.node=new AudioWorkletNode(c,"dds-mixer",{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});E.node.connect(E.master)}
class Deck{
  constructor(i){Object.assign(this,{i,song:null,key:null,loaded:false,loading:null,playing:false,ratio:1,dur:0,startPos:0,endPos:0,anchorTime:0,anchorPos:0,pending:null,clickFrom:0,endHandled:false,handoff:false,token:0,ch:{}})}
  post(m,tr){m.deck=this.i;E.node.port.postMessage(m,tr||[])}
  F(t){return Math.round(t*E.SR)}
  bounds(){const s=this.song;this.ratio=s.applied.tempo/100;this.startPos=(s.trimStart||0)/this.ratio;this.endPos=s.trimEnd!=null?Math.min(this.dur,s.trimEnd/this.ratio):this.dur;if(this.endPos<=this.startPos)this.endPos=this.dur}
  pos(){if(!this.playing)return this.anchorPos;const t=E.ctx.currentTime;if(this.pending&&t>=this.pending.time){this.anchorTime=this.pending.time;this.anchorPos=this.pending.pos;this.pending=null}return this.anchorPos+(t-this.anchorTime)}
  play(pos,countIn){const now=E.ctx.currentTime+0.08;let t0=now;
    if(countIn>0){const sig=this.song.sig||4,beat=60/(this.song.bpm*this.ratio);for(let k=0;k<countIn*sig;k++)playTick(now+k*beat,k%sig===0?0:1);t0=now+countIn*sig*beat}
    this.post({type:"clear"});this.post({type:"fade",at:0,from:1,target:1,frames:1});this.post({type:"start",at:this.F(t0),pos:this.F(pos)});
    Object.assign(this,{anchorTime:t0,anchorPos:pos,pending:null,clickFrom:t0,playing:true,endHandled:false,handoff:false})}
  stopNow(){if(this.playing)this.anchorPos=Math.max(this.startPos,Math.min(this.pos(),this.endPos));this.post({type:"clear"});this.post({type:"stop",at:0});this.playing=false;this.pending=null}
  stopAt(t){this.post({type:"stop",at:this.F(t)})}
  jumpAt(t,p){this.post({type:"jump",at:this.F(t),pos:this.F(p)});this.pending={time:t,pos:p};this.endHandled=false}
  seek(p){p=clamp(p,0,this.dur);this.endHandled=false;if(!this.playing){this.anchorPos=p;return}
    cancelClicks();this.post({type:"clear"});const t=E.ctx.currentTime+0.04;this.post({type:"jump",at:this.F(t),pos:this.F(p)});Object.assign(this,{anchorTime:t,anchorPos:p,pending:null,clickFrom:t})}
  fade(from,to,secs,at){this.post({type:"fade",at:this.F(at),from,target:to,frames:Math.round(secs*E.SR)})}
  unload(){this.token++;if(this.playing)this.stopNow();if(E.node)this.post({type:"reset"});Object.assign(this,{song:null,key:null,loaded:false,loading:null})}
}
function trackMatrix(song,t){const anySolo=song.tracks.some(x=>x.solo);const g=(t.mute?0:(anySolo&&!t.solo?0:t.vol))*minFactor(t);
  if(S.settings.iem){const left=LEFT.has(t.kind);if((t.ch||2)===1)return left?[g,0,0,0]:[0,0,g,0];const h=g*0.707;return left?[h,h,0,0]:[0,0,h,h]}
  const pan=t.pan||0;if((t.ch||2)===1){const th=(pan+1)*Math.PI/4;return[g*Math.min(1,Math.cos(th)*Math.SQRT2),0,g*Math.min(1,Math.sin(th)*Math.SQRT2),0]}
  return[g*Math.min(1,1-pan),0,0,g*Math.min(1,1+pan)]}
function applyTrackMix(d){if(!d||!d.song||!d.loaded||!E.node)return;const g={};d.song.tracks.forEach(t=>{t.ch=d.ch[t.id]||t.ch;g[t.id]=trackMatrix(d.song,t)});d.post({type:"gains",g})}
function applyGlobalMix(){if(!E.ctx)return;const st=S.settings;E.master.gain.value=st.master;E.clickGain.gain.value=st.clickVol;E.padGain.gain.value=st.padVol*0.7;E.clickPan.pan.value=st.iem?-1:0;E.padPan.pan.value=st.iem?1:0;E.decks.forEach(applyTrackMix)}

/* Click gerado e pad */
function playTick(t,kind){const c=E.ctx,o=c.createOscillator(),g=c.createGain();o.type="triangle";o.frequency.value=kind===0?1760:kind===1?1320:990;
  const pk=kind===2?0.35:0.8;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(pk,t+0.002);g.gain.exponentialRampToValueAtTime(0.0001,t+0.055);
  o.connect(g).connect(E.clickGain);o.start(t);o.stop(t+0.07);E.clickNodes.push({o,t});if(E.clickNodes.length>300)E.clickNodes=E.clickNodes.filter(x=>x.t>c.currentTime-1)}
function cancelClicks(){if(!E.ctx)return;const now=E.ctx.currentTime;E.clickNodes.forEach(x=>{if(x.t>now)try{x.o.stop()}catch(e){}});E.clickNodes=E.clickNodes.filter(x=>x.t<=now)}
function scheduleClicks(d,from,to){const s=d.song;if(to<=from)return;const sub=s.click.sub||1,sig=s.sig||4,beat=60/(s.bpm*d.ratio),tick=beat/sub,off=(s.beatOffset||0)/d.ratio;
  const segs=[],a={time:d.anchorTime,pos:d.anchorPos},p=d.pending;if(p){segs.push([a,from,Math.min(to,p.time)]);segs.push([p,Math.max(from,p.time),to])}else segs.push([a,from,to]);
  for(const [an,s0,e0] of segs){if(e0<=s0)continue;const ps=an.pos+(s0-an.time),pe=an.pos+(e0-an.time);
    for(let k=Math.ceil((ps-off)/tick-1e-9);;k++){const sp=off+k*tick;if(sp>=pe)break;if(sp<0||sp>d.endPos)continue;playTick(an.time+(sp-an.pos),(k%sub!==0)?2:((((k/sub)%sig)+sig)%sig===0?0:1))}}
  d.clickFrom=to}
function makePadVoice(p){const c=E.ctx,t=c.currentTime,g=c.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(1,t+3);g.connect(E.padFilter);
  const base=48+p.i,notes=[base-12,base,base+7,base+12,base+(p.minor?15:16),base+19],lv=[.55,.6,.45,.4,.2,.22],oscs=[];
  notes.forEach((m,i)=>(p.neutral&&i===4)?0:[-8,8].forEach((dt,j)=>{const o=c.createOscillator();o.type=i===0?"sine":"sawtooth";o.frequency.value=midiHz(m);o.detune.value=dt;const vg=c.createGain(),pn=c.createStereoPanner();vg.gain.value=lv[i]*0.05;pn.pan.value=j?0.35:-0.35;o.connect(vg).connect(pn).connect(g);o.start(t);oscs.push(o)}));
  return{g,oscs}}
function fadeOutVoice(v,sec){const t=E.ctx.currentTime;v.g.gain.cancelScheduledValues(t);v.g.gain.setValueAtTime(v.g.gain.value,t);v.g.gain.linearRampToValueAtTime(0,t+sec);v.oscs.forEach(o=>o.stop(t+sec+0.1))}
function padKeyNow(){const s=curSong();if(S.settings.padKey!=null)return{i:S.settings.padKey,minor:false,neutral:true};return s&&parseKey(transposeKey(s.key,s.applied.semi))}
function padFollow(force){if(!E.ctx)return;const p=padKeyNow();
  if(!S.settings.padOn||!p){if(E.padVoice){fadeOutVoice(E.padVoice,2.5);E.padVoice=null;E.padKey=null}return}
  const kn=keyName(p.i,p.minor)+(p.neutral?"5":"");if(!force&&E.padVoice&&E.padKey===kn)return;const old=E.padVoice;E.padVoice=makePadVoice(p);E.padKey=kn;if(old)fadeOutVoice(old,3)}

/* Tom e andamento (offline, SoundTouch) */
let STmod=null;
async function loadST(){if(STmod)return STmod;try{STmod=await import("./vendor/soundtouch.js")}catch(e){throw new Error("Não consegui carregar o processador de tom. Recarregue o app e tente de novo.")}return STmod}
async function stRender(buf,semi,ratio){const {SoundTouch,SimpleFilter,WebAudioBufferSource}=await loadST();
  const n=buf.length,sr=buf.sampleRate,ch=buf.numberOfChannels,L=new Float32Array(n+sr),R=ch>1?new Float32Array(n+sr):null;L.set(buf.getChannelData(0));if(R)R.set(buf.getChannelData(1));
  const st=new SoundTouch();st.pitchSemitones=semi;st.tempo=ratio;const f=new SimpleFilter(new WebAudioBufferSource({numberOfChannels:2,getChannelData:c=>c&&R?R:L}),st);
  const target=Math.round(n/ratio),out=new AudioBuffer({length:target,numberOfChannels:ch>1?2:1,sampleRate:sr}),oL=out.getChannelData(0),oR=ch>1?out.getChannelData(1):null;
  const chunk=16384,tmp=new Float32Array(chunk*2);let w=0,got,it=0;
  while(w<target&&(got=f.extract(tmp,chunk))>0){for(let i=0;i<got&&w<target;i++,w++){oL[w]=tmp[2*i];if(oR)oR[w]=tmp[2*i+1]}if(++it%6===0)await sleep(0)}
  return out}

/* Decodificação e carga nos decks */
const decoders={};
async function decodeBlob(blob,sr){const d=decoders[sr]||(decoders[sr]=new OfflineAudioContext(2,1,sr));return d.decodeAudioData(await blob.arrayBuffer())}
function isMonoBuf(b){if(b.numberOfChannels<2)return true;const l=b.getChannelData(0),r=b.getChannelData(1),step=Math.max(1,Math.floor(b.length/6000));for(let i=0;i<b.length;i+=step)if(Math.abs(l[i]-r[i])>2e-3)return false;return true}
function toInt16(b){const mono=isMonoBuf(b),n=b.length,l=b.getChannelData(0);
  if(mono){const o=new Int16Array(n);for(let i=0;i<n;i++){const v=l[i];o[i]=v>=1?32767:v<=-1?-32768:v*32767}return{ch:1,len:n,buf:o.buffer}}
  const r=b.getChannelData(1),o=new Int16Array(n*2);for(let i=0;i<n;i++){let v=l[i];o[2*i]=v>=1?32767:v<=-1?-32768:v*32767;v=r[i];o[2*i+1]=v>=1?32767:v<=-1?-32768:v*32767}return{ch:2,len:n,buf:o.buffer}}
async function stemBuffer(song,t){if(song.demo){const bufs=await demoBuffers(E.SR);return bufs[t.id]||null}
  if(!S.have.has(t.id))return null;const blob=await idb("stems","readonly",s=>s.get(t.id));if(!blob||blob===true)return null;return decodeBlob(blob,E.SR)}
const prepKey=s=>s.id+"|"+s.applied.semi+"|"+s.applied.tempo+"|"+s.tracks.map(t=>t.id).join(",");
function loadIntoDeck(d,song,onProg){
  const tok=++d.token;if(d.playing)d.stopNow();d.loaded=false;d.song=song;d.key=prepKey(song);d.ch={};d.post({type:"reset"});
  d.dur=(song.duration||0)/(song.applied.tempo/100);d.bounds();d.anchorPos=d.startPos;d.endHandled=false;
  const job=(async()=>{const ratio=song.applied.tempo/100,semi=song.applied.semi,n=song.tracks.length||1;let maxLen=0;
    for(let i=0;i<song.tracks.length;i++){const t=song.tracks[i];let b=await stemBuffer(song,t);if(tok!==d.token)return false;
      if(b){if(semi!==0||ratio!==1){b=await stRender(b,semi,ratio);if(tok!==d.token)return false}
        const q=toInt16(b);b=null;d.ch[t.id]=q.ch;t.ch=q.ch;d.post({type:"stem",id:t.id,ch:q.ch,len:q.len,buf:q.buf,g:trackMatrix(song,t)},[q.buf]);maxLen=Math.max(maxLen,q.len)}
      onProg&&onProg((i+1)/n);await sleep(0)}
    if(tok!==d.token)return false;d.dur=maxLen/E.SR;d.bounds();d.anchorPos=d.startPos;d.loaded=true;d.loading=null;return true})();
  d.loading=job;job.catch(()=>{if(tok===d.token){d.loading=null;d.key=null}});return job}

/* ================= Transporte ================= */
function sectionsOf(d){const s=d&&d.song;if(!s)return[];const ms=[...s.markers].sort((a,b)=>a.t-b.t);const r=d.ratio||s.applied.tempo/100,end=d.endPos||s.duration/r;
  return ms.map((m,i)=>({name:m.name,start:m.t/r,end:i+1<ms.length?ms[i+1].t/r:end}))}
function curSectionIdx(d){const p=d.pos(),sec=sectionsOf(d);let r=-1;sec.forEach((x,i)=>{if(p>=x.start-0.02)r=i});return r}
async function loadSong(id,{play=false,idx=null}={}){
  const song=songById(id);if(!song)return;ensureCtx();
  try{await E.ready}catch(e){return}
  const key=prepKey(song);let d=E.decks.find(x=>x.key===key&&(x.loaded||x.loading));
  if(d&&E.cur!==d&&E.cur.playing&&!E.cur.handoff)E.cur.stopNow();
  if(!d){if(E.cur.playing)pause();if(S.settings.preload==="end")E.decks.forEach(x=>{if(!x.playing)x.unload()});d=E.decks.find(x=>x!==E.cur&&!x.playing)||E.cur;if(d.playing)d.stopNow()}
  if(idx!=null)S.idx=idx;S.curSongId=id;saveMeta();E.vamp=null;E.queued=null;E.secEdit=false;E.cur=d;renderAll();
  const miss=missingTracks(song);if(miss.length===song.tracks.length&&song.tracks.length){d.unload();d.song=song;renderAll();toast("Os áudios desta música ainda não estão neste aparelho. Vincule o pacote para tocar.",6000);openLink(song);return}
  if(miss.length)toast(miss.length+" faixa(s) sem áudio neste aparelho: "+miss.map(t=>t.name).join(", "),6000);
  if(!d.loaded){const label="Carregando "+song.name;busy(label,0);let ok;try{ok=await(d.key===key&&d.loading?d.loading:loadIntoDeck(d,song,p=>busy(label,p)))}catch(e){busy(null);toast(e.message||"Não foi possível carregar os arquivos.");return}
    busy(null);if(!ok||E.cur!==d)return}
  d.bounds();if(!d.playing){d.anchorPos=d.startPos;d.endHandled=false}
  applyTrackMix(d);renderAll();padFollow();freeIdle();if(play)startPlay();
}
function nextSong(){const set=curSet();if(!set||S.idx<0)return null;const id=set.songIds[S.idx+1];return id?songById(id):null}
function freeIdle(){const nx=nextSong(),nk=nx&&prepKey(nx);E.decks.forEach(d=>{if(d!==E.cur&&!d.playing&&d.key&&d.key!==nk)d.unload()})}
function maybePreload(){const nx=nextSong();if(!nx||!E.node)return;const k=prepKey(nx);if(E.decks.some(d=>d.key===k))return;
  const other=E.decks.find(d=>d!==E.cur);if(!other||other.playing||other.loading)return;
  const c=E.cur;const remain=c&&c.song?c.endPos-c.pos():0;
  if(S.settings.preload==="always"||(c&&c.playing&&remain<90))loadIntoDeck(other,nx).then(ok=>ok&&renderSide()).catch(()=>{})}
async function startPlay(){const d=E.cur;if(!d)return;ensureCtx();await E.ctx.resume();try{await E.ready}catch(e){return}
  if(!d.loaded){if(S.curSongId)return loadSong(S.curSongId,{play:true,idx:S.idx});return}
  let pos=d.anchorPos;if(pos>=d.endPos-0.05)pos=d.startPos;const ci=pos<=d.startPos+0.05?(d.song.click.countIn||0):0;
  d.play(pos,ci);keepAwake(true);renderTransport()}
function pause(){E.decks.forEach(d=>{if(d.playing)d.stopNow()});cancelClicks();keepAwake(false);renderTransport()}
function stopToStart(){if(E.min){E.min=null;clearInterval(minTimer);E.minX=0}pause();const d=E.cur;if(d&&d.song){d.anchorPos=d.startPos;d.endHandled=false}E.vamp=null;E.queued=null;renderSections();drawArr();renderTime()}
async function goNext(dir){const set=curSet();if(!set||!set.songIds.length)return;let i=S.idx+dir;if(i<0||i>=set.songIds.length){toast(dir>0?"Esta é a última música do repertório.":"Esta é a primeira música do repertório.");return}
  ensureCtx();if(E.cur&&E.cur.playing&&dir>0){await crossfadeTo(i,2);return}const was=E.cur&&E.cur.playing;pause();await loadSong(set.songIds[i],{idx:i,play:was})}
async function crossfadeTo(i,secs){const set=curSet(),id=set.songIds[i],song=songById(id);if(!song)return;await E.ready;
  const from=E.cur,k=prepKey(song);let to=E.decks.find(d=>d.key===k);
  if(!to){to=E.decks.find(d=>d!==from);busy("Carregando "+song.name,0);try{await loadIntoDeck(to,song,p=>busy("Carregando "+song.name,p))}catch(e){busy(null);toast(e.message);return}busy(null)}
  else if(to.loading){busy("Terminando de carregar "+song.name,0.9);await to.loading;busy(null)}
  if(!to.loaded)return;const t=E.ctx.currentTime+0.05;
  if(from.playing){from.handoff=true;from.fade(1,0,secs,t);from.stopAt(t+secs+0.05);const tok=from.token;setTimeout(()=>{if(from.token===tok&&from.handoff){from.playing=false;from.handoff=false;freeIdle()}},(secs+0.3)*1000)}
  cancelClicks();to.bounds();to.play(to.startPos,0);to.fade(0,1,Math.max(0.05,secs*0.5),t);
  E.cur=to;S.idx=i;S.curSongId=id;E.vamp=null;E.queued=null;applyTrackMix(to);renderAll();padFollow()}
function engineTick(){const c=E.ctx;if(!c||!E.node)return;const now=c.currentTime;
  for(const d of E.decks){if(!d.playing||!d.song||d.handoff)continue;
    if(d.song.click.on)scheduleClicks(d,Math.max(d.clickFrom,now),now+0.15);else d.clickFrom=Math.max(d.clickFrom,now+0.15);
    if(d!==E.cur)continue;const pos=d.pos(),secs=sectionsOf(d);
    if(E.queued&&!d.pending){const q=E.queued;if(q.time<=now+0.4&&q.time>=now){d.jumpAt(q.time,secs[q.idx]?secs[q.idx].start:q.pos);E.queued=null;setTimeout(renderSections,(q.time-now)*1000+30)}else if(q.time<now)E.queued=null}
    if(E.vamp!=null&&!d.pending){const s=secs[E.vamp];if(s&&pos>=s.start-0.05&&pos<s.end&&s.end-pos<0.35)d.jumpAt(d.anchorTime+(s.end-d.anchorPos),s.start)}
    const set=curSet(),tr=(set&&set.trans)||{mode:"stop",xfade:6,gap:2},hasNext=!!nextSong(),remain=d.endPos-pos;
    if(E.vamp==null&&!d.endHandled&&!d.pending){
      if(tr.mode==="xfade"&&hasNext&&remain<=tr.xfade){d.endHandled=true;crossfadeTo(S.idx+1,Math.max(0.5,Math.min(tr.xfade,remain)));continue}
      if(remain<=0.35){d.endHandled=true;const endT=d.anchorTime+(d.endPos-d.anchorPos);d.stopAt(endT);
        setTimeout(async()=>{if(E.cur!==d||!d.endHandled)return;d.playing=false;d.anchorPos=d.endPos;
          if(hasNext&&tr.mode==="auto"){await sleep(Math.max(0,tr.gap)*1000);if(E.cur===d&&!d.playing)await loadSong(set.songIds[S.idx+1],{idx:S.idx+1,play:true})}
          else if(hasNext){await loadSong(set.songIds[S.idx+1],{idx:S.idx+1});toast("Pronta para tocar: "+curSong().name)}
          else{keepAwake(false);renderTransport()}},Math.max(0,endT-now)*1000+40)}}}
  if(!(timers.pl>0)){timers.pl=40;maybePreload()}else timers.pl--;
  if(typeof Live!=="undefined")Live.tick()}
async function keepAwake(on){try{if(on&&!E.wake&&navigator.wakeLock){E.wake=await navigator.wakeLock.request("screen");E.wake.addEventListener("release",()=>E.wake=null)}else if(!on&&E.wake){await E.wake.release();E.wake=null}}catch(e){}}
function gotoSection(i){ensureCtx();const d=E.cur;if(!d||!d.song)return;const s=sectionsOf(d)[i];if(!s)return;
  if(!d.playing){d.anchorPos=s.start;d.endHandled=false;renderSections();drawArr();renderTime();return}
  if(S.settings.jumpMode==="now"){d.seek(s.start);E.queued=null;renderSections();return}
  const song=d.song,bar=(song.sig||4)*60/(song.bpm*d.ratio),off=(song.beatOffset||0)/d.ratio,p=d.pos();
  let target=off+Math.ceil((p-off)/bar+1e-6)*bar;if(target-p<0.45)target+=bar;
  let t=d.anchorTime+(target-d.anchorPos);if(d.pending)t=Math.max(t,d.pending.time+0.01);t=Math.max(t,d.clickFrom+0.001);
  E.queued={idx:i,time:t,pos:s.start};renderSections()}
/* Ministração: a banda vira fundo (teclado + pad) repetindo a parte atual enquanto o ministro fala;
   ao tocar numa parte, a banda inteira entra no próximo compasso, no tempo. */
let minTimer=null;
function minFactor(t){const x=E.minX||0;if(!x||t.kind==="click")return 1;const keep=S.settings.minBg!=="pad"&&(t.kind==="keys"||t.kind==="pad");return keep?1-x*0.3:1-x}
function minRamp(to,sec){clearInterval(minTimer);const from=E.minX||0,t0=performance.now();
  minTimer=setInterval(()=>{const k=Math.min(1,(performance.now()-t0)/(sec*1000));E.minX=from+(to-from)*k;applyTrackMix(E.cur);if(k>=1)clearInterval(minTimer)},60)}
function minRefresh(){renderTransport();renderSections();drawArr();if(typeof Stage!=="undefined")Stage.sync()}
async function toggleMin(){ensureCtx();if((!E.cur||!E.cur.song)&&S.curSongId){await E.ready;await loadSong(S.curSongId,{idx:S.idx})}const d=E.cur;if(!d||!d.song){toast("Abra uma música primeiro.");return}
  if(E.min){minExit(1.5);return}
  E.min={prevPad:S.settings.padOn};if(!S.settings.padOn){S.settings.padOn=true;padFollow()}
  if(d.playing){const i=curSectionIdx(d);if(i>=0)E.vamp=i;E.queued=null;minRamp(1,2.5);toast("Ministração: a banda ficou de fundo, repetindo esta parte. Toque na parte em que quer entrar.",5000)}
  else toast("Ministração: pad ligado. Toque na parte em que a banda deve entrar.",5000);
  minRefresh()}
function minExit(sec){if(!E.min)return;const prev=E.min.prevPad;E.min=null;minRamp(0,sec);if(!prev){S.settings.padOn=false;padFollow()}minRefresh()}
function sectionTap(i){if(E.min&&!E.min.entering)return minEnter(i);gotoSection(i)}
function minEnter(i){const d=E.cur;if(!d||!d.song)return;const s=sectionsOf(d)[i];if(!s)return;ensureCtx();const prev=E.min.prevPad;
  const padBack=ms=>setTimeout(()=>{if(!E.min&&!prev){S.settings.padOn=false;padFollow()}minRefresh()},ms);
  if(!d.playing){E.min=null;clearInterval(minTimer);E.minX=0;E.vamp=null;E.queued=null;if(!d.loaded)return;applyTrackMix(d);
    d.play(s.start,1);keepAwake(true);padBack((60/(d.song.bpm*d.ratio))*(d.song.sig||4)*1000);minRefresh();return}
  E.vamp=null;const jm=S.settings.jumpMode;S.settings.jumpMode="bar";gotoSection(i);S.settings.jumpMode=jm;const q=E.queued;if(!q)return;
  clearInterval(minTimer);E.minX=0;const g={};d.song.tracks.forEach(t=>g[t.id]=trackMatrix(d.song,t));E.minX=1;
  d.post({type:"gainsAt",at:d.F(q.time),g});E.min.entering=true;
  setTimeout(()=>{E.min=null;E.minX=0;applyTrackMix(d)},Math.max(0,q.time-E.ctx.currentTime)*1000+30);
  padBack(Math.max(0,q.time-E.ctx.currentTime)*1000+400);minRefresh()}
function toggleVamp(i){const d=E.cur;if(!d||!d.song)return;if(i==null)i=curSectionIdx(d);if(i<0){toast("Marque as seções da música para usar a repetição.");return}E.vamp=E.vamp===i?null:i;renderSections();drawArr()}

/* ================= Música de exemplo ================= */
const demoCache={};
function demoSong(){const bpm=80,bar=3;return newSong({id:"demo",demo:true,name:"Exemplo DDS",artist:"Música gerada no app",key:"G",bpm,sig:4,duration:50.5,trimEnd:49.5,click:{on:true,sub:1,countIn:1},
  markers:[{name:"Intro",t:0},{name:"Verso",t:4*bar},{name:"Refrão",t:8*bar},{name:"Final",t:12*bar}],
  tracks:[["demo-drums","Bateria","drums"],["demo-bass","Baixo","bass"],["demo-keys","Teclado","keys"],["demo-lead","Melodia","vox"]].map(([id,name,kind])=>({id,name,kind,vol:0.85,pan:0,mute:false,solo:false,peaks:[],dur:50.5}))})}
function demoBuffers(sr){if(demoCache[sr])return demoCache[sr];demoCache[sr]=(async()=>{
  const bpm=80,beat=60/bpm,bars=16,dur=50.5,len=Math.ceil(dur*sr),chords=[[7,11,14],[0,4,7],[4,7,11],[2,6,9]],roots=[7,0,4,2];
  const render=async fn=>{const oc=new OfflineAudioContext(2,len,sr);fn(oc);return oc.startRendering()};
  const noise=oc=>{const b=oc.createBuffer(1,sr,sr),x=b.getChannelData(0);for(let i=0;i<x.length;i++)x[i]=Math.random()*2-1;return b};
  const drums=await render(oc=>{const nb=noise(oc),out=oc.createGain();out.gain.value=0.9;out.connect(oc.destination);
    const kick=t=>{const o=oc.createOscillator(),g=oc.createGain();o.frequency.setValueAtTime(140,t);o.frequency.exponentialRampToValueAtTime(42,t+0.12);g.gain.setValueAtTime(1,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.35);o.connect(g).connect(out);o.start(t);o.stop(t+0.4)};
    const hit=(t,f,type,q,lv,dec)=>{const s=oc.createBufferSource();s.buffer=nb;const fl=oc.createBiquadFilter();fl.type=type;fl.frequency.value=f;fl.Q.value=q;const g=oc.createGain();g.gain.setValueAtTime(lv,t);g.gain.exponentialRampToValueAtTime(0.001,t+dec);s.connect(fl).connect(g).connect(out);s.start(t);s.stop(t+dec+0.02)};
    for(let bar=0;bar<bars;bar++)for(let b=0;b<4;b++){const t=(bar*4+b)*beat;if(bar>=4){if(b%2===0)kick(t);else hit(t,1900,"bandpass",0.8,0.8,0.18)}
      if(bar>=2){hit(t,8000,"highpass",0.7,0.22,0.05);if(bar>=8&&bar<12)hit(t+beat/2,8000,"highpass",0.7,0.16,0.05)}if((bar===8||bar===12)&&b===0)hit(t,5000,"highpass",0.5,0.5,1.4)}
    kick(bars*4*beat)});
  const bass=await render(oc=>{const out=oc.createGain();out.gain.value=0.55;const lp=oc.createBiquadFilter();lp.type="lowpass";lp.frequency.value=500;lp.connect(out).connect(oc.destination);
    for(let bar=4;bar<=bars;bar++){const r=roots[bar%4];for(let h=0;h<(bar===bars?1:2);h++){const t=(bar*4+h*2)*beat,o=oc.createOscillator(),g=oc.createGain();o.type="triangle";o.frequency.value=midiHz(36+r+(r>5?0:12));
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(1,t+0.01);g.gain.setTargetAtTime(0.5,t+0.05,0.3);g.gain.setTargetAtTime(0,t+beat*1.9,0.05);o.connect(g).connect(lp);o.start(t);o.stop(t+beat*2.2)}}});
  const keys=await render(oc=>{const out=oc.createGain();out.gain.value=0.5;const lp=oc.createBiquadFilter();lp.type="lowpass";lp.frequency.value=1600;lp.connect(out).connect(oc.destination);
    for(let bar=0;bar<=bars;bar++){const ch=chords[bar%4],t=bar*4*beat,end=t+4*beat*(bar===bars?1.6:1);ch.forEach((n,i)=>[-6,6].forEach(dt=>{const o=oc.createOscillator(),g=oc.createGain(),p=oc.createStereoPanner();o.type="sawtooth";o.frequency.value=midiHz(60+n);o.detune.value=dt;p.pan.value=(i-1)*0.4;
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.07,t+0.06);g.gain.setValueAtTime(0.07,end-0.15);g.gain.linearRampToValueAtTime(0,end);o.connect(g).connect(p).connect(lp);o.start(t);o.stop(end+0.05)}))}});
  const lead=await render(oc=>{const out=oc.createGain();out.gain.value=0.35;out.connect(oc.destination);const mel=[14,12,11,12,9,7,9,11];
    for(let bar=8;bar<12;bar++)for(let n=0;n<2;n++){const t=(bar*4+n*2)*beat,o=oc.createOscillator(),g=oc.createGain();o.type="sine";o.frequency.value=midiHz(60+mel[(bar-8)*2+n]);
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.6,t+0.05);g.gain.setTargetAtTime(0,t+beat*1.7,0.08);o.connect(g).connect(out);o.start(t);o.stop(t+beat*2.2)}});
  return{"demo-drums":drums,"demo-bass":bass,"demo-keys":keys,"demo-lead":lead}})();return demoCache[sr]}
async function demoPeaks(song){const b=await demoBuffers(44100);song.tracks.forEach(t=>{const ab=b[t.id];if(!ab)return;const chans=[ab.getChannelData(0)];if(ab.numberOfChannels>1)chans.push(ab.getChannelData(1));const p=peaksOf(chans,900);t.peaks=p.peaks.map(v=>p.max?Math.round(v/p.max*100)/100:0);t.dur=ab.duration})}

/* ================= Importação de pacote ================= */
const IMP={stage:"pick",files:[],pkg:"",steps:[],res:null};
function openImport(){Object.assign(IMP,{stage:"pick",files:[],pkg:"",steps:[],res:null});$("#imp").hidden=false;renderImport()}
function closeImport(){if(IMP.stage==="analyzing")return;$("#imp").hidden=true;if(IMP.stage==="link")IMP.stage="pick"}
function openLink(song){Object.assign(IMP,{stage:"link",song,files:[],matches:null,steps:[]});$("#imp").hidden=false;renderImport()}
async function linkFiles(list){const song=IMP.song;try{busy("Lendo arquivos",0.3);const {files}=await readAudioFiles(list);busy(null);
    const byName=new Map(files.map(f=>[normFile(f.name),f]));IMP.matches=song.tracks.map(t=>({t,f:byName.get(t.file||normFile(t.name))||byName.get(normFile(t.name))||null}));renderImport()}
  catch(e){busy(null);toast(e.message||"Não foi possível ler os arquivos.",6000)}}
async function saveLink(){const song=IMP.song,m=(IMP.matches||[]).filter(x=>x.f);if(!m.length)return;$("#imp").hidden=true;
  try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}
  for(let i=0;i<m.length;i++){busy("Guardando áudios neste aparelho",i/m.length);const ok=await idb("stems","readwrite",st=>st.put(m[i].f.blob,m[i].t.id));if(!ok){busy(null);toast("Sem espaço neste aparelho para os áudios.",7000);return}S.have.add(m[i].t.id)}
  busy(null);IMP.stage="pick";toast(`Áudios de "${song.name}" vinculados: ${m.length} de ${song.tracks.length} faixas.`);await loadSong(song.id,{idx:curSet()?curSet().songIds.indexOf(song.id):-1})}
function renderImport(){const el=$("#impDlg");
  if(IMP.stage==="link"){const song=IMP.song,m=IMP.matches;
    el.innerHTML=`<button class="btn-ghost x" id="impX" aria-label="Fechar">✕</button><h2 id="impTitle">Vincular áudios</h2>
    <p class="muted" style="margin:0"><b style="color:var(--fg)">${esc(song.name)}</b> veio da nuvem com seções, tom e mix, mas os stems ficam em cada aparelho. Envie o mesmo pacote (.zip ou arquivos) usado na importação.</p>
    ${m?`<div class="trklist">${m.map(x=>`<div class="tk" style="--kc:var(${x.f?"--ok":"--danger"})"><i></i><span>${esc(x.t.name)}</span><span class="mono muted" style="text-align:right;font-size:12px">${x.f?"encontrado":"faltando"}</span></div>`).join("")}</div>
      <div class="row" style="justify-content:flex-end"><button class="btn-ghost" id="impAgain">Escolher outros arquivos</button><button class="btn-primary" id="lnkSave"${m.some(x=>x.f)?"":" disabled"}>Guardar ${m.filter(x=>x.f).length} de ${m.length} faixas</button></div>`
    :`<label class="drop" id="drop" for="impIn"><svg viewBox="0 0 48 48"><path d="M24 31V9m0 0l-8 8m8-8l8 8"/><path d="M8 29v8a4 4 0 004 4h24a4 4 0 004-4v-8"/></svg><b>Solte o pacote desta música</b><span class="muted">ou toque para escolher</span></label>`}
    <input type="file" id="impIn" multiple accept=".zip,audio/*,.mp3,.wav,.m4a,.aif,.aiff,.flac,.ogg" hidden>`;return}
  if(IMP.stage==="pick"){el.innerHTML=`<button class="btn-ghost x" id="impX" aria-label="Fechar">✕</button><h2 id="impTitle">Importar pacote</h2>
    <p class="muted" style="margin:0">Envie o .zip do multitrack, os stems, ou só o MP3 da música. O app alinha as faixas, encontra o BPM, o tom, as seções e a cifra que vai aparecendo enquanto toca.</p>
    <label class="drop" id="drop" for="impIn"><svg viewBox="0 0 48 48"><path d="M24 31V9m0 0l-8 8m8-8l8 8"/><path d="M8 29v8a4 4 0 004 4h24a4 4 0 004-4v-8"/></svg><b>Solte o .zip ou os arquivos aqui</b><span class="muted">ou toque para escolher · MP3, WAV, M4A, AIFF, FLAC</span></label>
    <input type="file" id="impIn" multiple accept=".zip,audio/*,.mp3,.wav,.m4a,.aif,.aiff,.flac,.ogg" hidden>`;return}
  if(IMP.stage==="analyzing"){el.innerHTML=`<h2 id="impTitle">Analisando ${esc(IMP.pkg)}</h2><ul class="steps">${IMP.steps.map(s=>`<li class="${s.st}"><span class="st"></span><span>${esc(s.label)}</span><span class="rs">${esc(s.res||"")}</span></li>`).join("")}</ul>`;return}
  const r=IMP.res;el.innerHTML=`<button class="btn-ghost x" id="impX" aria-label="Fechar">✕</button><h2 id="impTitle">Tudo pronto</h2>
    <ul class="steps">${IMP.steps.map(s=>`<li class="${s.st}"><span class="st"></span><span>${esc(s.label)}</span><span class="rs">${esc(s.res||"")}</span></li>`).join("")}</ul>
    <div class="found"><div><span>Faixas</span><b>${r.tracks.length}</b></div><div><span>BPM</span><b class="mono">${r.bpm}</b></div><div><span>Tom</span><b>${esc(r.key)}</b></div><div><span>Seções</span><b>${r.markers.length}</b></div></div>
    ${r.chords&&r.chords.length?`<p class="help" style="margin:0">Cifra detectada: <b class="mono" style="color:var(--fg)">${esc([...new Set(r.chords.map(c=>c.c))].slice(0,8).join(" · "))}</b>. Você pode corrigir em Ajustes depois.</p>`:""}
    <div class="group"><div class="field"><span>Música</span><input type="text" id="iName" value="${esc(r.name)}"></div>
    <div class="field"><span>Artista</span><input type="text" id="iArtist" value="${esc(r.artist)}"></div>
    <div class="field"><span>Tom</span><input type="text" id="iKey" value="${esc(r.key)}"></div>
    ${r.keyAlt?`<p class="help" style="margin:0">Tom estimado pelo áudio. Se não bater, a outra possibilidade é <b>${esc(r.keyAlt)}</b>.</p>`:""}
    <div class="field"><span>BPM</span><input type="number" id="iBpm" min="30" max="260" step="0.01" value="${r.bpm}"></div>
    <div class="field"><span>Compasso</span><select id="iSig">${[[4,"4/4"],[3,"3/4"],[6,"6/8"],[2,"2/4"]].map(([v,l])=>`<option value="${v}"${r.sig===v?" selected":""}>${l}</option>`).join("")}</select></div></div>
    <div class="group"><h3>Faixas</h3><div class="trklist">${r.tracks.map((t,i)=>`<div class="tk" style="--kc:var(${KIND[t.kind].v})"><i></i><input type="text" id="iT${i}" value="${esc(t.name)}" aria-label="Nome da faixa"><select id="iK${i}" aria-label="Tipo da faixa">${Object.entries(KIND).map(([k,v])=>`<option value="${k}"${k===t.kind?" selected":""}>${v.l}</option>`).join("")}</select></div>`).join("")}</div></div>
    <label class="row help"><input type="checkbox" id="iAdd" checked> Adicionar ao repertório "${esc(curSet()?curSet().name:"")}"</label>
    <div class="row" style="justify-content:flex-end"><button class="btn-ghost" id="impCancel">Cancelar</button><button class="btn-primary" id="impSave">Salvar e abrir</button></div>`}
$("#imp").addEventListener("click",e=>{if(e.target.id==="imp"||e.target.closest("#impX,#impCancel"))closeImport();if(e.target.closest("#impSave"))saveImport();if(e.target.closest("#lnkSave"))saveLink();if(e.target.closest("#impAgain")){IMP.matches=null;renderImport()}});
$("#imp").addEventListener("change",e=>{if(e.target.id==="impIn")gatherFiles([...e.target.files])});
$("#imp").addEventListener("dragover",e=>{e.preventDefault();const d=$("#drop");d&&d.classList.add("over")});
$("#imp").addEventListener("dragleave",()=>{const d=$("#drop");d&&d.classList.remove("over")});
$("#imp").addEventListener("drop",e=>{e.preventDefault();if(IMP.stage==="pick"||IMP.stage==="link")gatherFiles([...e.dataTransfer.files])});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("#imp").hidden)closeImport();if(e.key==="Escape")$("#bless").hidden=true});
function step(i,st,res){Object.assign(IMP.steps[i],{st,res});renderImport()}
async function readAudioFiles(list){let files=[],pkg="";const zip=list.find(f=>/\.zip$/i.test(f.name));
  if(zip){if(!window.JSZip)throw new Error("Não consegui abrir o .zip neste navegador. Descompacte e selecione os arquivos.");const z=await JSZip.loadAsync(zip);
    const ents=[];z.forEach((p,f)=>{if(!f.dir&&AUDIO_EXT.test(p)&&!/(^|\/)(__MACOSX|\.)/.test(p))ents.push(f)});
    for(const f of ents)files.push({name:f.name.split("/").pop(),blob:await f.async("blob")});pkg=zip.name}
  else{files=list.filter(f=>AUDIO_EXT.test(f.name)).map(f=>({name:f.name,blob:f}));pkg=(list[0].webkitRelativePath||"").split("/")[0]||list[0].name}
  if(!files.length)throw new Error("Não encontrei arquivos de áudio no que foi enviado.");return{files,pkg}}
const normFile=n=>String(n||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\.[a-z0-9]{2,4}$/,"").replace(/[_\s.\-]+/g," ").trim();
function missingTracks(song){if(!song||song.demo)return[];return song.tracks.filter(t=>!S.have.has(t.id))}
async function gatherFiles(list){if(!list.length)return;ensureCtx();
  // copia os arquivos para a memória antes de redesenhar a janela: alguns navegadores perdem o acesso quando o campo some
  try{busy("Lendo arquivos",0.1);list=await Promise.all(list.map(async f=>new File([await f.arrayBuffer()],f.name,{type:f.type||""})));busy(null)}
  catch(e){busy(null);toast("Não consegui ler o arquivo escolhido. Tente escolher de novo.",6000);return}
  if(IMP.stage==="link")return linkFiles(list);
  let files=[],pkg="";const zip=list.find(f=>/\.zip$/i.test(f.name));
  IMP.steps=[{label:"Abrindo o pacote",st:"run"},{label:"Lendo as faixas",st:""},{label:"Sincronizando pelo ponto zero",st:""},{label:"BPM e compasso",st:""},{label:"Tom da música",st:""},{label:"Seções",st:""},{label:"Cifra (acordes)",st:""}];
  IMP.stage="analyzing";IMP.pkg=zip?zip.name.replace(/\.zip$/i,"").replace(/^\d{6,}_/,""):"faixas";renderImport();
  try{({files,pkg}=await readAudioFiles(list));
    step(0,"ok",files.length+" arquivos");await analyzePackage(files,pkg)}
  catch(err){IMP.stage="pick";renderImport();toast(err.message||"Não foi possível ler o pacote.",6000)}}
async function analyzePackage(files,pkg){const sr=E.SR,down=Math.max(1,Math.round(sr/11025)),asr=sr/down;
  const tracks=[];let clickMono=null,guides=[],chromas=[],dur=0,lastSound=0,mix=null;
  step(1,"run","0 de "+files.length);
  for(let i=0;i<files.length;i++){const f=files[i];let b;try{b=await decodeBlob(f.blob,sr)}catch(e){continue}
    const name=files.length===1?"Música completa":f.name.replace(/\.[^.]+$/,"").replace(/[_]+/g," ").trim(),kind=files.length===1?"other":detectKind(name);
    const chans=[b.getChannelData(0)];if(b.numberOfChannels>1)chans.push(b.getChannelData(1));
    const p=peaksOf(chans,900),first=p.peaks.findIndex(v=>v>0.01);
    const t={id:uid(),name,file:normFile(f.name),kind,vol:kind==="click"||kind==="guide"?0.8:0.85,pan:0,mute:false,solo:false,dur:b.duration,ch:isMonoBuf(b)?1:2,
      peaks:p.peaks.map(v=>p.max?Math.round(v/p.max*100)/100:0),first:first<0?null:first/900*b.duration,blob:f.blob};
    dur=Math.max(dur,b.duration);lastSound=Math.max(lastSound,p.lastSample/sr);
    if(kind==="click"&&!clickMono)clickMono=toMonoDown(chans,down);
    if(kind==="guide")guides.push({t,mono:toMonoDown(chans,down)});
    if(kind!=="click"&&kind!=="guide"){const m=toMonoDown(chans,down);if(!mix||mix.length<m.length){const nm=new Float32Array(m.length);if(mix)nm.set(mix);mix=nm}for(let j=0;j<m.length;j++)mix[j]+=m[j]}
    if(["bass","keys","gtr"].includes(kind)&&chromas.length<5){const m=toMonoDown(chans,down);chromas.push(chromaOf(m,asr,Math.min(15,b.duration*0.1),Math.min(b.duration,140)))}
    tracks.push(t);b=null;step(1,"run",(i+1)+" de "+files.length);await sleep(0)}
  if(!tracks.length)throw new Error("Nenhum arquivo de áudio pôde ser lido.");
  tracks.sort((a,b)=>KIND_ORDER[a.kind]-KIND_ORDER[b.kind]||a.name.localeCompare(b.name,"pt"));
  step(1,"ok",tracks.length+" faixas");
  step(2,"ok",`${tracks.length} faixas no mesmo ponto zero · ${fmt(dur)}`);
  step(3,"run");let bpm=120,offset=0,bpmOk=false,fromClick=false;
  const nmB=/(\d{2,3}(?:[.,]\d)?)\s?bpm/i.exec(pkg+" "+files.map(f=>f.name).join(" ")),nameBpm=nmB?parseFloat(nmB[1].replace(",",".")):0;
  const fixHalf=b=>{if(!nameBpm)return b;const r=b/nameBpm;return Math.abs(r-2)<0.06||Math.abs(r-0.5)<0.03||Math.abs(r-1)<0.03?nameBpm:b};
  if(clickMono){const c=detectClick(clickMono,asr);if(c){bpm=fixHalf(c.bpm);offset=c.offset;bpmOk=true;fromClick=true;step(3,"ok",bpm+" BPM pelo metrônomo"+(bpm!==c.bpm?" (confirmado pelo nome)":""))}}
  await sleep(0);let ana=null,gm=null;const guideMarks=(b,o)=>{if(!guides.length)return null;guides.sort((a,c)=>(a.t.first??1e9)-(c.t.first??1e9));const ms=detectSections(guides[0].mono,asr,b,o,4);return ms.length>1?ms:null};
  if(mix){try{if(fromClick){gm=guideMarks(bpm,offset);ana=analyzeMix(mix,asr,{bpm,offset,sig:4,bounds:gm&&gm.map(x=>x.t)})}
    else{ana=analyzeMix(mix,asr,null);if(ana&&fixHalf(ana.bpm)!==ana.bpm)ana=analyzeMix(mix,asr,{bpm:nameBpm,offset:ana.offset,sig:4})||ana;if(ana){gm=guideMarks(ana.bpm,ana.offset);if(gm)ana=analyzeMix(mix,asr,{bpm:ana.bpm,offset:ana.offset,sig:4,bounds:gm.map(x=>x.t)})}}}catch(e){console.warn(e)}}
  else if(fromClick)gm=guideMarks(bpm,offset);
  if(!bpmOk&&ana){bpm=ana.bpm;offset=ana.offset;bpmOk=true;step(3,"ok",bpm+" BPM pela batida")}
  if(!bpmOk){const m=/(\d{2,3}(?:[.,]\d)?)\s?bpm/i.exec(files.map(f=>f.name).join(" ")+" "+pkg);if(m){bpm=parseFloat(m[1].replace(",","."));bpmOk=true;step(3,"ok",bpm+" BPM (pelo nome)")}else step(3,"warn","não detectado · ajuste depois")}
  await sleep(0);step(4,"run");let key="—",keyAlt="";
  if(chromas.length){const k=detectKey(chromas);key=keyName(k.best.i,k.best.minor);keyAlt=keyName(k.alt.i,k.alt.minor);step(4,"ok",k.confidence>0.05?key:key+" ou "+keyAlt)}
  else if(ana){key=ana.key;keyAlt=ana.keyAlt;step(4,"ok",ana.keyConf>0.05?key:key+" ou "+keyAlt)}else step(4,"warn","não detectado");
  await sleep(0);step(5,"run");let markers=[{name:"Intro",t:0}];
  if(ana&&ana.sections.length>1){markers=renumberSections(ana.sections);step(5,"ok",markers.length+" partes com nome"+(gm?" (pela guia)":""))}
  else if(gm){markers=gm;step(5,"ok",gm.length+" partes pela guia")}
  if(markers.length<2)step(5,"warn","marque depois em Ajustes");
  const chords=ana?ana.chords:[];step(6,chords.length?"ok":"warn",chords.length?chords.length+" trocas de acorde":"não detectada");
  const nm=parsePackageName(pkg);
  IMP.res={name:nm.title||"Nova música",artist:nm.artist,key,keyAlt:key!==keyAlt?keyAlt:"",bpm,offset,sig:4,markers,tracks,dur,lastSound,hasClick:!!clickMono,chords};
  IMP.stage="review";renderImport()}
async function saveImport(){const r=IMP.res;if(!r)return;
  r.tracks.forEach((t,i)=>{t.name=($("#iT"+i).value||t.name).trim();t.kind=$("#iK"+i).value});
  const song=newSong({name:$("#iName").value.trim()||r.name,artist:$("#iArtist").value.trim(),key:$("#iKey").value.trim()||r.key,bpm:parseFloat($("#iBpm").value)||r.bpm,sig:parseInt($("#iSig").value)||4,
    beatOffset:r.offset,duration:r.dur,trimEnd:r.lastSound>0&&r.lastSound+1.5<r.dur?Math.round((r.lastSound+1.5)*100)/100:null,markers:r.markers,
    click:{on:!r.hasClick,sub:1,countIn:r.hasClick?0:1},chords:r.chords||[],tracks:r.tracks.map(({blob,first,...t})=>t)});
  const add=$("#iAdd").checked;$("#imp").hidden=true;busy("Salvando no aparelho",0);
  try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}
  for(let i=0;i<r.tracks.length;i++){const ok=await idb("stems","readwrite",s=>s.put(r.tracks[i].blob,r.tracks[i].id));if(!ok){busy(null);toast("Sem espaço para salvar as faixas neste aparelho. Libere espaço e importe de novo.",7000);return}S.have.add(r.tracks[i].id);busy("Salvando no aparelho",(i+1)/r.tracks.length)}
  busy(null);IMP.res=null;S.songs.push(song);saveSong(song);
  const set=curSet();if(add&&set){set.songIds.push(song.id);saveSet(set)}
  toast(`"${song.name}" importada: ${song.tracks.length} faixas sincronizadas.`);
  const i=set?set.songIds.lastIndexOf(song.id):-1;if(!(E.cur&&E.cur.playing))await loadSong(song.id,{idx:i});else renderAll()}

/* ================= Interface ================= */
const PLAY='<path d="M8 5l12 7-12 7z"/>',PAUSE='<rect x="6" y="5" width="4.2" height="14" rx="1.2"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.2"/>';
function renderAll(){renderSetPick();renderHero();renderTransport();renderSections();renderArr();renderSide();renderTime()}
function renderSetPick(){$("#setSel").innerHTML=S.sets.map(x=>`<option value="${x.id}"${x.id===S.currentSet?" selected":""}>${esc(x.name)}</option>`).join("")}
function renderHero(){const s=curSong(),set=curSet();
  $("#hTitle").textContent=s?s.name:"DDS MultiTrack";$("#hArtist").textContent=s?(s.artist||""):"Importe o pacote de uma música para começar.";
  if(!s){$("#hChips").innerHTML="";return}
  const k=transposeKey(s.key,s.applied.semi),bpm=+(s.bpm*s.applied.tempo/100).toFixed(2);
  $("#hChips").innerHTML=`<span class="chip">Tom <b>${esc(k)}</b>${s.applied.semi?`<span class="mono">${s.applied.semi>0?"+":""}${s.applied.semi}</span>`:""}</span><span class="chip"><b>${bpm}</b> BPM</span><span class="chip"><b>${s.sig===6?"6/8":s.sig+"/4"}</b></span><span class="chip"><b>${s.tracks.length}</b> ${s.tracks.length>1?"faixas":"faixa"}</span>${s.demo?'<span class="chip warn">Exemplo</span>':""}${missingTracks(s).length?`<button class="chip warn" data-act="link">Áudios faltando neste aparelho · vincular</button>`:""}`;
  $("#mbTitle").textContent=s.name}
function renderTransport(){const d=E.cur,on=!!(d&&d.playing);document.querySelectorAll(".pi").forEach(x=>x.innerHTML=on?PAUSE:PLAY);
  $("#bPlay").setAttribute("aria-label",on?"Pausar":"Tocar");$("#mPlay").setAttribute("aria-label",on?"Pausar":"Tocar");
  const set=curSet(),eb=$("#hEyebrow");eb.classList.toggle("on",on);eb.querySelector("span").textContent=(on?"Tocando agora":"Pronto")+(set&&S.idx>=0?` · ${S.idx+1} de ${set.songIds.length}`:"");
  $("#tIem").classList.toggle("on",S.settings.iem);$("#tPad").classList.toggle("on",S.settings.padOn);const s=curSong();$("#tClick").classList.toggle("on",!!(s&&s.click.on));$("#mstVol").value=S.settings.master}
function songPosOrig(){const d=E.cur;if(!d||!d.song)return 0;return d.pos()*(d.ratio||1)}
let lastBeat=-1;
function renderTime(){const d=E.cur,s=curSong();let cur=0,tot=0;
  if(d&&d.song&&d.song===s&&d.loaded){cur=Math.max(0,d.pos()-d.startPos);tot=d.endPos-d.startPos}else if(s){const r=s.applied.tempo/100;tot=((s.trimEnd??s.duration)-(s.trimStart||0))/r}
  $("#tc").innerHTML=`${fmt(cur)}<small>/ ${fmt(tot)}</small>`;$("#mbTime").textContent=fmt(cur)+" / "+fmt(tot);$("#mbProg").style.width=(tot?clamp(cur/tot,0,1)*100:0)+"%";
  const sig=s?s.sig||4:4,beatsEl=$("#beats");if(beatsEl.children.length!==sig)beatsEl.innerHTML=Array.from({length:sig},(_,i)=>`<i class="${i===0?"one":""}"></i>`).join("");
  if(!s){$("#bb").textContent="Compasso —";$("#chordBox").hidden=true;return}
  const ch=s.chords||[];const cb=$("#chordBox");cb.hidden=!ch.length;
  if(ch.length){const po=d&&d.song===s?songPosOrig():(s.trimStart||0);let ci=-1;for(let i=0;i<ch.length;i++){if(ch[i].t<=po+0.05)ci=i;else break}
    const cur=transposeChord((ch[Math.max(0,ci)]||{}).c||"",s.applied.semi),nx=ch[ci+1]?transposeChord(ch[ci+1].c,s.applied.semi):"";
    if(cb.dataset.k!==cur+"|"+nx){cb.dataset.k=cur+"|"+nx;$("#chordNow").textContent=cur;$("#chordNext").textContent=nx?"→ "+nx:""}}
  const o=d&&d.song===s?songPosOrig():(s.trimStart||0),rel=o-(s.beatOffset||0),bi=Math.floor(rel/(60/s.bpm)+1e-6);
  const bar=rel<0?0:Math.floor(bi/sig)+1,beat=rel<0?0:(bi%sig)+1;$("#bb").textContent="Compasso "+bar+" · tempo "+(beat||"—");
  if(bi!==lastBeat){lastBeat=bi;[...beatsEl.children].forEach((x,i)=>x.classList.toggle("on",d&&d.playing&&i===beat-1))}}

/* Organizar partes de uma música já importada: detecta as que faltam e dá nome às genéricas */
const SEC_OPTS=["Intro","Verso","Pré-refrão","Refrão","Ponte","Instrumental","Interlúdio","Solo","Tag","Final"];
let organizing=false;
async function organizeSections(song){if(!song||organizing)return;organizing=true;ensureCtx();const sr=E.SR,down=Math.max(1,Math.round(sr/11025)),asr=sr/down;
  let mix=null,guide=null;busy("Organizando as partes",0.02);
  try{for(let i=0;i<song.tracks.length;i++){const t=song.tracks[i];let b=await stemBuffer(song,t);if(!b)continue;
      const chans=[b.getChannelData(0)];if(b.numberOfChannels>1)chans.push(b.getChannelData(1));const m=toMonoDown(chans,down);b=null;
      if(t.kind==="click"){}else if(t.kind==="guide"){if(!guide)guide=m}
      else{if(!mix||mix.length<m.length){const nm=new Float32Array(m.length);if(mix)nm.set(mix);mix=nm}for(let j=0;j<m.length;j++)mix[j]+=m[j]}
      busy("Organizando as partes",0.05+0.8*(i+1)/song.tracks.length);await sleep(0)}
    if(!mix){busy(null);toast("Os áudios desta música não estão neste aparelho. Vincule o pacote e tente de novo.",6000);return}
    const existing=[...song.markers].sort((a,b)=>a.t-b.t),hasReal=existing.length>2;let bounds=hasReal?existing.map(m=>m.t):null;
    if(!bounds&&guide){const g=detectSections(guide,asr,song.bpm,song.beatOffset||0,song.sig||4);if(g.length>1)bounds=g.map(x=>x.t)}
    busy("Organizando as partes",0.9);await sleep(0);
    const ana=analyzeMix(mix,asr,{bpm:song.bpm,offset:song.beatOffset||0,sig:song.sig||4,bounds});busy(null);
    if(!ana||ana.sections.length<2){toast("Não consegui identificar as partes desta música. Marque em Ajustes.",6000);return}
    const base=n=>n.replace(/\s+\d+$/,"").trim();let ms;
    if(hasReal)ms=existing.map(m=>{const auto=ana.sections.reduce((b,x)=>Math.abs(x.t-m.t)<Math.abs(b.t-m.t)?x:b,ana.sections[0]);return{name:GENERIC_SEC.test(m.name)?base(auto.name):base(m.name),t:m.t}});
    else ms=ana.sections.map(x=>({name:base(x.name),t:x.t}));
    song.markers=renumberSections(ms);let extra="";if(!(song.chords&&song.chords.length)&&ana.chords&&ana.chords.length){song.chords=ana.chords;extra=" e a cifra foi detectada"}
    E.vamp=null;E.queued=null;saveSong(song);renderAll();toast(`${song.markers.length} partes organizadas${extra}. Toque numa parte para ir até ela.`,5000)}
  catch(e){busy(null);console.warn(e);toast("Não foi possível organizar as partes: "+(e.message||e),6000)}
  finally{organizing=false}}
function renderSections(){const el=$("#secrail"),d=E.cur,s=curSong();if(!s){el.innerHTML="";return}
  const dd=d&&d.song===s?d:{song:s,ratio:s.applied.tempo/100,endPos:(s.trimEnd??s.duration)/(s.applied.tempo/100),pos:()=>(s.trimStart||0)/(s.applied.tempo/100)};
  const secs=sectionsOf(dd);const orgBtn=`<button class="vampbtn org" data-act="org" title="Detecta as partes e dá nome (Verso, Refrão, Ponte…)">✨ Organizar partes</button>`;
  if(secs.length<2&&!E.secEdit){el.innerHTML='<span class="hint">Esta música ainda não tem partes.</span>'+orgBtn;return}
  if(E.secEdit){const sorted=[...s.markers].sort((a,b)=>a.t-b.t),bar=(s.sig||4)*60/s.bpm;
    el.innerHTML=sorted.map((m,i)=>{const b=m.name.replace(/\s+\d+$/,"");const opts=SEC_OPTS.includes(b)?SEC_OPTS:[b,...SEC_OPTS];
      return`<div class="sec edit"><select data-secname="${i}" aria-label="Nome da parte ${i+1}">${opts.map(o=>`<option${o===b?" selected":""}>${esc(o)}</option>`).join("")}</select><span class="sub">c ${Math.round((m.t-(s.beatOffset||0))/bar)+1}</span></div>`}).join("")+
      `<button class="vampbtn on" data-act="secdone">✓ Concluir</button>`;return}
  const generic=s.markers.some(m=>GENERIC_SEC.test(m.name));
  const ci=curSectionIdx(dd),bar=(s.sig||4)*60/s.bpm,r=dd.ratio;
  el.innerHTML=secs.map((x,i)=>`<button class="sec${i===ci?" cur":""}${E.queued&&E.queued.idx===i?" queued":""}${E.vamp===i?" vamp":""}" data-sec="${i}" title="Tecla ${i+1} · toque duplo repete"><span class="nm">${esc(x.name)}</span><span class="sub">${E.vamp===i?"repetindo":"c "+(Math.round((x.start*r-(s.beatOffset||0))/bar)+1)}</span></button>`).join("")+
    `<button class="vampbtn${E.vamp!=null?" on":""}" id="bVamp" title="Repete a seção atual até soltar (V)"><svg class="icon" viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z"/></svg>${E.vamp!=null?"Soltar":"Repetir seção"}</button>`+
    `<button class="vampbtn min${E.min?" on":""}" data-act="min" title="A banda vira fundo e repete a parte até você tocar onde quer entrar (M)">🎙 ${E.min?(E.min.entering?"Entrando…":"Sair da ministração"):"Ministrar"}</button>`+
    `<button class="vampbtn ghost" data-act="stage" title="Tela de operação, estilo palco">⛶ Modo palco</button>`+(generic?orgBtn:"")+`<button class="vampbtn ghost" data-act="secedit" title="Renomear as partes">✎ Editar partes</button>`}
$("#secrail").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;if(b.id==="bVamp")return toggleVamp(E.vamp);
  if(b.dataset.act==="org")return organizeSections(curSong());if(b.dataset.act==="secedit"){E.secEdit=true;return renderSections()}if(b.dataset.act==="secdone"){E.secEdit=false;return renderSections()}
  if(b.dataset.act==="min")return toggleMin();if(b.dataset.act==="stage")return Stage.open();
  if(b.dataset.sec!=null)sectionTap(+b.dataset.sec)});
$("#secrail").addEventListener("change",e=>{const t=e.target;if(t.dataset.secname==null)return;const s=curSong();if(!s)return;const sorted=[...s.markers].sort((a,b)=>a.t-b.t);
  sorted[+t.dataset.secname].name=t.value;renumberSections(s.markers);saveSong(s);renderSections();renderArr();renderSide()});
$("#secrail").addEventListener("dblclick",e=>{const b=e.target.closest("[data-sec]");if(b)toggleVamp(+b.dataset.sec)});

/* Faixas: cabeçalhos + onda alinhada */
const arrCanvas=document.createElement("canvas");arrCanvas.id="arr";arrCanvas.setAttribute("aria-label","Faixas sincronizadas; toque para ir ao ponto");
function renderArr(){const s=curSong(),body=$("#arrBody");
  if(!s){$("#arrInfo").textContent="";body.innerHTML=`<div class="empty-arr"><h3>Nenhuma música aberta</h3><span>Importe o .zip de uma música. As faixas aparecem aqui alinhadas, com mixer por faixa.</span><button class="btn-primary" data-act="import">+ Importar pacote</button></div>`;return}
  const miss=missingTracks(s).length;$("#arrInfo").innerHTML=miss?`<button class="chip warn" data-act="link">${miss} de ${s.tracks.length} faixas sem áudio aqui · vincular</button>`:esc(s.tracks.length>1?s.tracks.length+" faixas sincronizadas":"Música completa · cifra e seções automáticas");
  const anySolo=s.tracks.some(t=>t.solo);
  body.innerHTML=`<div class="arr-body"><div class="heads"><div class="rs"><span class="eyebrow">Faixa</span></div>${(s.chords||[]).length?'<div class="chh"><span class="eyebrow">Cifra</span></div>':""}${s.tracks.map(t=>`<div class="lh${t.mute||(anySolo&&!t.solo)?" dim":""}" style="--kc:var(${KIND[t.kind||"other"].v})">
      <div class="meta"><span class="nm" title="${esc(t.name)}">${esc(t.name)}</span><span class="kd">${KIND[t.kind||"other"].l}</span></div>
      <input type="range" min="0" max="1.25" step="0.01" value="${t.vol}" data-tid="${t.id}" aria-label="Volume ${esc(t.name)}" title="Volume (toque duplo volta ao padrão)">
      <div class="ms"><button class="m${t.mute?" on":""}" data-tid="${t.id}" data-f="mute" aria-label="Mudo ${esc(t.name)}">M</button><button class="s${t.solo?" on":""}" data-tid="${t.id}" data-f="solo" aria-label="Solo ${esc(t.name)}">S</button></div></div>`).join("")}</div><div class="canvas-wrap" id="cvWrap"></div></div>`;
  $("#cvWrap").appendChild(arrCanvas);drawArr()}
$("#arrBody").addEventListener("input",e=>{const t=e.target;if(!t.dataset.tid)return;const s=curSong(),tr=s.tracks.find(x=>x.id===t.dataset.tid);tr.vol=+t.value;saveSong(s);applyTrackMix(E.cur)});
$("#arrBody").addEventListener("dblclick",e=>{const t=e.target;if(t.type==="range"&&t.dataset.tid){t.value=0.85;t.dispatchEvent(new Event("input",{bubbles:true}))}});
$("#arrBody").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.act==="import")return openImport();if(b.dataset.act==="link")return;
  const s=curSong(),tr=s&&s.tracks.find(x=>x.id===b.dataset.tid);if(!tr)return;tr[b.dataset.f]=!tr[b.dataset.f];saveSong(s,{local:true});applyTrackMix(E.cur);renderArr()});
function drawArr(){const s=curSong();if(!s||!arrCanvas.isConnected)return;const wrap=arrCanvas.parentElement,dpr=window.devicePixelRatio||1,W=wrap.clientWidth;
  const LH=parseFloat(cv("--lane"))||50,RH0=parseFloat(cv("--ruler"))||30,CH=(s.chords||[]).length?(parseFloat(cv("--chordrow"))||26):0,RH=RH0+CH,H=RH+s.tracks.length*LH;if(!W)return;
  if(arrCanvas.width!==Math.round(W*dpr)||arrCanvas.height!==Math.round(H*dpr)){arrCanvas.width=Math.round(W*dpr);arrCanvas.height=Math.round(H*dpr);arrCanvas.style.height=H+"px"}
  const g=arrCanvas.getContext("2d");g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,W,H);
  const total=s.duration||1,X=t=>t/total*W,d=E.cur,pos=d&&d.song===s&&d.loaded?songPosOrig():(d&&d.song===s?songPosOrig():(s.trimStart||0));
  const anySolo=s.tracks.some(t=>t.solo),r=s.applied.tempo/100,ms=[...s.markers].sort((a,b)=>a.t-b.t);
  // faixas alternadas
  g.fillStyle=cv("--surface");g.fillRect(0,0,W,H);
  ms.forEach((m,i)=>{if(i%2)return;const x0=X(m.t),x1=X(i+1<ms.length?ms[i+1].t:total);g.fillStyle="rgba(255,255,255,0.025)";g.fillRect(x0,RH,x1-x0,H-RH)});
  if(E.vamp!=null&&ms[E.vamp]){const x0=X(ms[E.vamp].t),x1=X(E.vamp+1<ms.length?ms[E.vamp+1].t:total);g.fillStyle="rgba(255,181,71,0.12)";g.fillRect(x0,0,x1-x0,H)}
  // ondas
  s.tracks.forEach((t,i)=>{const y0=RH+i*LH,mid=y0+LH/2,amp=LH/2-7,col=cv(KIND[t.kind||"other"].v),pk=t.peaks||[],P=pk.length,off=t.mute||(anySolo&&!t.solo);
    g.fillStyle=cv("--line");g.fillRect(0,y0+LH-1,W,1);if(!P)return;
    for(let x=0;x<W;x+=2){const tt=x/W*total;if(tt>t.dur)break;const v=pk[Math.min(P-1,Math.floor(tt/t.dur*P))];if(v<0.01)continue;const a=Math.max(0.8,v*amp);
      g.globalAlpha=off?0.18:(tt<pos?0.95:0.42);g.fillStyle=off?cv("--muted"):col;g.fillRect(x,mid-a,1.5,a*2)}
    g.globalAlpha=1;
    if(innerWidth<=760){/* no celular: nome da faixa dentro da própria onda */
      g.save();g.font="700 11px "+cv("--f-display");g.textBaseline="middle";const lb=t.name,tw=g.measureText(lb).width;
      g.globalAlpha=0.82;g.fillStyle=cv("--bg")||"#0b0d12";g.beginPath();(g.roundRect?g.roundRect(4,y0+4,tw+12,17,5):g.rect(4,y0+4,tw+12,17));g.fill();
      g.globalAlpha=off?0.5:1;g.fillStyle=col;g.fillText(lb,10,y0+12.5);g.restore()}});
  // corte de início/fim
  g.fillStyle="rgba(10,12,17,0.66)";if(s.trimStart>0)g.fillRect(0,RH,X(s.trimStart),H-RH);if(s.trimEnd!=null&&s.trimEnd<total)g.fillRect(X(s.trimEnd),RH,W-X(s.trimEnd),H-RH);
  // régua com compassos
  g.fillStyle=cv("--surface-2");g.fillRect(0,0,W,RH);g.fillStyle=cv("--line");g.fillRect(0,RH-1,W,1);
  if(CH){g.fillStyle=cv("--bg");g.fillRect(0,RH0,W,CH);g.fillStyle=cv("--line");g.fillRect(0,RH0-1,W,1);const chs=s.chords,semi=s.applied.semi;g.font="700 12px "+cv("--f-mono");g.textBaseline="middle";
    chs.forEach((c,i)=>{const x0=X(c.t),x1=X(chs[i+1]?chs[i+1].t:total),w=x1-x0;g.fillStyle=cv("--line-2");g.fillRect(Math.round(x0),RH0+3,1,CH-6);
      const name=transposeChord(c.c,semi),tw=g.measureText(name).width;if(w>tw+6){g.fillStyle=c.t<=pos&&(!chs[i+1]||chs[i+1].t>pos)?cv("--accent"):cv("--muted");g.fillText(name,x0+4,RH0+CH/2)}})}
  const RH_SAVE=RH;{const RH=RH0;
  const bar=(s.sig||4)*60/s.bpm,off=s.beatOffset||0,nb=Math.floor((total-off)/bar);let every=1;while(every*bar/total*W<34)every*=2;
  g.font="500 10px "+cv("--f-mono");g.textBaseline="middle";
  for(let b=0;b<=nb;b+=every){const x=Math.round(X(off+b*bar))+0.5;g.fillStyle=cv("--line-2");g.fillRect(x,RH-9,1,8);g.fillStyle=cv("--faint");g.fillText(String(b+1),x+3,RH-7)}}
  g.font="700 11px "+cv("--f-display");
  ms.forEach((m,i)=>{const x=Math.round(X(m.t))+0.5,x1=X(i+1<ms.length?ms[i+1].t:total);g.fillStyle=cv("--fg");g.globalAlpha=0.35;g.fillRect(x,RH,1,H-RH);g.globalAlpha=1;
    g.fillStyle=E.vamp===i?cv("--accent"):cv("--surface-3");const tw=Math.min(x1-x-3,g.measureText(m.name.toUpperCase()).width+12);if(tw>14){g.beginPath();g.roundRect?g.roundRect(x+1,3,tw,15,4):g.rect(x+1,3,tw,15);g.fill();
      g.fillStyle=E.vamp===i?cv("--accent-ink"):cv("--fg");g.save();g.beginPath();g.rect(x+1,3,tw,15);g.clip();g.fillText(m.name.toUpperCase(),x+7,11);g.restore()}});
  // cursor
  const px=Math.round(X(pos))+0.5;g.fillStyle=cv("--accent");g.fillRect(px-1,0,2,H);g.beginPath();g.moveTo(px-6,0);g.lineTo(px+6,0);g.lineTo(px,8);g.fill()}
arrCanvas.addEventListener("pointerdown",e=>{const s=curSong();if(!s)return;ensureCtx();const r=arrCanvas.getBoundingClientRect(),o=clamp((e.clientX-r.left)/r.width,0,1)*s.duration;
  const d=E.cur;if(!d||d.song!==s){return}const rr=d.ratio||1,lo=(s.trimStart||0),hi=(s.trimEnd??s.duration)-0.2;E.queued=null;d.seek(clamp(o,lo,hi)/rr);drawArr();renderTime();renderSections()});
window.addEventListener("resize",()=>{cssCache={};drawArr()});

/* Painel lateral */
function storageInfo(){const el=$("#cStorage");if(!el)return;if(!navigator.storage||!navigator.storage.estimate){el.textContent="indisponível";return}
  navigator.storage.estimate().then(e=>{const gb=v=>(v/1073741824).toFixed(v>1073741824?1:2).replace(".",",")+" GB";el.textContent=`${gb(e.usage||0)} usados de ${gb(e.quota||0)}`}).catch(()=>{el.textContent="indisponível"})}
function renderSide(){document.querySelectorAll(".seg button").forEach(b=>b.classList.toggle("on",b.dataset.side===S.side));
  document.querySelectorAll(".mtabs button").forEach(b=>b.classList.toggle("on",b.dataset.tab===S.tab));document.body.dataset.tab=S.tab;
  const el=$("#sideBody");el.innerHTML=S.side==="cfg"?cfgHTML():setHTML();if(S.side==="cfg")storageInfo()}
function setHTML(){const set=curSet();if(!set)return"";const tr=set.trans||{mode:"stop",xfade:6,gap:2},avail=S.songs.filter(s=>!set.songIds.includes(s.id));
  const nxt=nextSong(),nk=nxt&&prepKey(nxt),ready=nk&&E.decks.some(d=>d.key===nk&&d.loaded);
  return`<div class="group"><h3>Repertório<span class="grow"></span><button class="btn-ghost" data-a="newset" style="padding:4px 8px">+ Novo</button></h3>
    ${S.sets.length>1?`<select id="setSel2" aria-label="Escolher repertório">${S.sets.map(x=>`<option value="${x.id}"${x.id===set.id?" selected":""}>${esc(x.name)}</option>`).join("")}</select>`:""}
    <input type="text" id="setName" value="${esc(set.name)}" aria-label="Nome do repertório">
    ${set.songIds.length?`<ol class="queue">${set.songIds.map((id,i)=>{const s=songById(id);if(!s)return"";const isCur=i===S.idx&&s.id===S.curSongId,playing=isCur&&E.cur&&E.cur.playing;
      return`<li class="qi${isCur?" cur":""}" data-i="${i}"><span class="n">${playing?'<span class="eq"><i></i><i></i><i></i></span>':i+1}</span><span style="min-width:0"><div class="t">${esc(s.name)}</div>
      <div class="s"><span>${esc(s.artist||"")}</span><span class="mono">${esc(transposeKey(s.key,s.applied.semi))} · ${+(s.bpm*s.applied.tempo/100).toFixed(1)}</span>${i===S.idx+1&&S.idx>=0?`<span class="tag ${ready?"ready":"next"}">${ready?"pronta":"a seguir"}</span>`:""}</div></span>
      <span class="acts"><button data-a="up" aria-label="Subir">↑</button><button data-a="down" aria-label="Descer">↓</button><button data-a="rm" aria-label="Tirar do repertório">✕</button></span></li>`}).join("")}</ol>`:'<p class="help" style="margin:0">Repertório vazio. Adicione músicas da biblioteca.</p>'}
    ${avail.length?`<div class="row"><select id="addSel" style="flex:1" aria-label="Música para adicionar">${avail.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select><button data-a="add">Adicionar</button></div>`:""}</div>
  <div class="group"><h3>Entre as músicas</h3>
    <select id="trMode"><option value="stop"${tr.mode==="stop"?" selected":""}>Parar e deixar a próxima pronta</option><option value="auto"${tr.mode==="auto"?" selected":""}>Emendar a próxima sozinha</option><option value="xfade"${tr.mode==="xfade"?" selected":""}>Crossfade para a próxima</option></select>
    ${tr.mode==="xfade"?`<div class="field"><span>Crossfade</span><div class="row"><input type="range" id="trX" min="1" max="16" step="0.5" value="${tr.xfade}" style="flex:1"><span class="mono">${tr.xfade}s</span></div></div>`:""}
    ${tr.mode==="auto"?`<div class="field"><span>Pausa</span><div class="row"><input type="range" id="trG" min="0" max="20" step="0.5" value="${tr.gap}" style="flex:1"><span class="mono">${tr.gap}s</span></div></div>`:""}</div>
  <div class="group"><h3>Biblioteca<span class="grow"></span><span class="mono" style="letter-spacing:0">${S.songs.length}</span></h3>
    <ol class="queue">${S.songs.map(s=>`<li class="qi${s.id===S.curSongId?" cur":""}" data-song="${s.id}"><span class="n">♪</span><span style="min-width:0"><div class="t">${esc(s.name)}</div><div class="s"><span>${esc(s.artist||"")}</span><span class="mono">${s.tracks.length} faixas · ${fmt(s.duration)}</span></div></span>
      <span class="acts"><button data-a="del" class="${S.confirm==="song:"+s.id?"btn-danger armed":""}" style="${S.confirm==="song:"+s.id?"width:auto;padding:0 8px;font-size:12px":""}" aria-label="Excluir música">${S.confirm==="song:"+s.id?"Excluir?":"🗑"}</button></span></li>`).join("")}</ol>
    <button class="btn-primary" data-a="import">+ Importar música</button></div>
  <div class="group"><div class="blesscard"><b>Abençoe o DDS MultiTrack</b><p>Gratuito para todas as igrejas. Oferte o valor que sentir no coração para manter o app no ar.</p>
    <div class="row"><button class="btn-primary" data-bless>Ofertar via Pix</button><button class="btn-ghost" data-bless>Tenho músicas autorais</button></div></div>
    ${S.sets.length>1?`<button class="btn-danger${S.confirm==="set:"+set.id?" armed":""}" data-a="delset">${S.confirm==="set:"+set.id?"Confirmar: excluir este repertório":"Excluir repertório"}</button>`:""}</div>`}
function cfgHTML(){const s=curSong();if(!s)return'<p class="help">Abra uma música para ajustar tom, andamento, click e seções.</p>';
  const pend=s.semi!==s.applied.semi||s.tempo!==s.applied.tempo,o=songPosOrig(),bar=(s.sig||4)*60/s.bpm,barAt=t=>Math.max(1,Math.floor((t-(s.beatOffset||0))/bar+1e-6)+1);
  return`<div class="group"><h3>Tom e andamento</h3>
    <div class="keyshift"><button data-a="kdown" aria-label="Meio tom abaixo">−</button><output>${esc(transposeKey(s.key,s.semi))}<small>${s.semi===0?"tom original":(s.semi>0?"+":"")+s.semi+" semitom"+(Math.abs(s.semi)>1?"s":"")}</small></output><button data-a="kup" aria-label="Meio tom acima">+</button></div>
    <div class="field"><span>Andamento</span><div class="row"><input type="range" id="cTempo" min="80" max="120" step="1" value="${s.tempo}" style="flex:1"><span class="mono" id="cTempoOut">${s.tempo}% · ${+(s.bpm*s.tempo/100).toFixed(1)}</span></div></div>
    ${pend?`<div class="callout"><span style="flex:1">O áudio será processado no novo tom e andamento.</span><button class="btn-primary" data-a="apply">Aplicar</button><button class="btn-ghost" data-a="undo">Desfazer</button></div>`:""}</div>
  <div class="group"><h3>Seções<span class="grow"></span><button class="btn-ghost" data-a="mkadd" style="padding:4px 8px">+ Marcar no c ${barAt(o)}</button></h3>
    <button data-a="org" style="align-self:flex-start">✨ Organizar partes automaticamente</button>
    ${[...s.markers].map((m,i)=>({m,i})).sort((a,b)=>a.m.t-b.m.t).map(({m,i})=>`<div class="mk"><input type="text" list="secNames" value="${esc(m.name)}" data-mk="${i}" aria-label="Nome da seção"><span class="mono">c ${barAt(m.t)} · ${fmt(m.t)}</span><button class="btn-ghost" data-a="mkdel" data-i="${i}" aria-label="Remover seção">✕</button></div>`).join("")||'<p class="help" style="margin:0">Toque a música e marque onde começa cada parte.</p>'}
    <p class="help" style="margin:0">Seções detectadas automaticamente podem vir com nomes genéricos. Renomeie como Verso, Refrão, Ponte.</p></div>
  <div class="group"><h3>Cifra<span class="grow"></span><span class="mono" style="letter-spacing:0">${(s.chords||[]).length}</span></h3>
    ${(s.chords||[]).length?`<div class="chordedit">${s.chords.map((c,i)=>`<label title="Em ${fmt(c.t)}"><span class="mono">${fmt(c.t)}</span><input type="text" value="${esc(c.c)}" data-ch="${i}" maxlength="10" aria-label="Acorde em ${fmt(c.t)}" autocapitalize="characters"></label>`).join("")}</div>`:'<p class="help" style="margin:0">Sem cifra. Toque a música e acrescente os acordes nos pontos certos.</p>'}
    <button class="btn-ghost" data-a="chadd" style="align-self:flex-start">+ Acorde no ponto atual</button>
    <p class="help" style="margin:0">Escreva no tom original. Ao mudar o tom, a cifra é transposta sozinha. Apague o texto para remover um acorde.</p></div>
  <div class="group"><h3>Click extra (gerado)</h3>
    <div class="field"><span>Ligado</span><div class="row"><button class="tog${s.click.on?" on":""}" data-a="clk"><i></i>${s.click.on?"Ligado":"Desligado"}</button></div></div>
    <div class="field"><span>Subdivisão</span><select id="cSub">${[[1,"Semínima"],[2,"Colcheia"],[3,"Tercina"],[4,"Semicolcheia"]].map(([v,l])=>`<option value="${v}"${s.click.sub===v?" selected":""}>${l}</option>`).join("")}</select></div>
    <div class="field"><span>Contagem</span><select id="cCount">${[0,1,2].map(v=>`<option value="${v}"${s.click.countIn===v?" selected":""}>${v?v+" compasso"+(v>1?"s":""):"Sem contagem"}</option>`).join("")}</select></div>
    <div class="field"><span>Volume</span><input type="range" id="cClickVol" min="0" max="1.25" step="0.01" value="${S.settings.clickVol}"></div></div>
  <div class="group"><h3>Música</h3>
    <div class="field"><span>Nome</span><input type="text" id="cName" value="${esc(s.name)}"></div>
    <div class="field"><span>Artista</span><input type="text" id="cArtist" value="${esc(s.artist||"")}"></div>
    <div class="field"><span>Tom original</span><input type="text" id="cKey" value="${esc(s.key)}"></div>
    <div class="field"><span>BPM</span><input type="number" id="cBpm" min="30" max="260" step="0.01" value="${s.bpm}"></div>
    <div class="field"><span>Compasso</span><select id="cSig">${[[4,"4/4"],[3,"3/4"],[6,"6/8"],[2,"2/4"]].map(([v,l])=>`<option value="${v}"${s.sig===v?" selected":""}>${l}</option>`).join("")}</select></div>
    <div class="field"><span>Início / fim</span><div class="row"><button data-a="tstart">Início aqui</button><button data-a="tend">Fim aqui</button><button class="btn-ghost" data-a="tclr">Limpar</button></div></div>
    <p class="help mono" style="margin:0">${fmt(s.trimStart||0)} → ${fmt(s.trimEnd??s.duration)} de ${fmt(s.duration)}</p></div>
  <div class="group"><h3>Faixas</h3>${s.tracks.map(t=>`<div class="tk" style="--kc:var(${KIND[t.kind||"other"].v})"><i></i><input type="text" value="${esc(t.name)}" data-tn="${t.id}" aria-label="Nome da faixa"><select data-tk="${t.id}" aria-label="Tipo">${Object.entries(KIND).map(([k,v])=>`<option value="${k}"${k===t.kind?" selected":""}>${v.l}</option>`).join("")}</select></div>`).join("")}
    <p class="help" style="margin:0">No modo Fones L/R, Click e Guia vão para a esquerda e o resto para a direita.</p></div>
  <div class="group"><h3>Saída e palco</h3>
    <div class="field"><span>Pad</span><input type="range" id="cPadVol" min="0" max="1.25" step="0.01" value="${S.settings.padVol}"></div>
    <div class="field"><span>Fundo da ministração</span><select id="cMinBg"><option value="keys"${S.settings.minBg!=="pad"?" selected":""}>Teclado + pad</option><option value="pad"${S.settings.minBg==="pad"?" selected":""}>Só o pad</option></select></div>
    <div class="field"><span>Trocar seção</span><select id="cJump"><option value="bar"${S.settings.jumpMode==="bar"?" selected":""}>No próximo compasso</option><option value="now"${S.settings.jumpMode==="now"?" selected":""}>Imediatamente</option></select></div>
    <div class="field"><span>Próxima música</span><select id="cPre"><option value="always"${S.settings.preload==="always"?" selected":""}>Deixar carregada sempre</option><option value="end"${S.settings.preload==="end"?" selected":""}>Carregar no fim da atual (usa menos memória)</option></select></div>
    <div class="field"><span>Espaço</span><span class="mono muted" id="cStorage">calculando…</span></div>
    <p class="help" style="margin:0"><kbd>Espaço</kbd> tocar · <kbd>←</kbd><kbd>→</kbd> músicas · <kbd>1</kbd>–<kbd>9</kbd> seções · <kbd>V</kbd> repetir</p></div>`}
const sb=$("#sideBody");
sb.addEventListener("click",async e=>{const b=e.target.closest("button"),li=e.target.closest("li");const set=curSet(),s=curSong();const a=b&&b.dataset.a;
  if(a==="import")return openImport();
  if(a==="newset"){const ns={id:uid(),name:"Repertório "+(S.sets.length+1),songIds:[],trans:{mode:"stop",xfade:6,gap:2}};S.sets.push(ns);S.currentSet=ns.id;S.idx=-1;saveSet(ns);saveMeta();renderAll();setTimeout(()=>{const n=$("#setName");n&&n.select()},30);return}
  if(a==="add"){set.songIds.push($("#addSel").value);saveSet(set);renderSide();return}
  if(a==="delset"){if(S.confirm!=="set:"+set.id){S.confirm="set:"+set.id;renderSide();return}S.confirm=null;S.sets=S.sets.filter(x=>x!==set);idb("setlists","readwrite",st=>st.delete(set.id));Sync.tomb("mt_repertorios",set.id);S.currentSet=S.sets[0].id;S.idx=S.sets[0].songIds.indexOf(S.curSongId);saveMeta();renderAll();return}
  if(li&&li.dataset.song){const id=li.dataset.song;if(a==="del"){if(S.confirm!=="song:"+id){S.confirm="song:"+id;renderSide();return}S.confirm=null;return deleteSong(id)}
    if(E.cur&&E.cur.playing)pause();return loadSong(id,{idx:set?set.songIds.indexOf(id):-1})}
  if(li&&li.dataset.i!=null){const i=+li.dataset.i;
    if(a){if(a==="up"&&i>0){[set.songIds[i-1],set.songIds[i]]=[set.songIds[i],set.songIds[i-1]];if(S.idx===i)S.idx--;else if(S.idx===i-1)S.idx++}
      else if(a==="down"&&i<set.songIds.length-1){[set.songIds[i+1],set.songIds[i]]=[set.songIds[i],set.songIds[i+1]];if(S.idx===i)S.idx++;else if(S.idx===i+1)S.idx--}
      else if(a==="rm"){set.songIds.splice(i,1);if(S.idx===i)S.idx=-1;else if(S.idx>i)S.idx--}saveSet(set);renderAll();return}
    if(i===S.idx&&set.songIds[i]===S.curSongId)return;const was=E.cur&&E.cur.playing;if(was)pause();return loadSong(set.songIds[i],{idx:i})}
  if(!s)return;const d=E.cur;
  if(a==="kup"||a==="kdown"){s.semi=clamp(s.semi+(a==="kup"?1:-1),-6,6);saveSong(s);renderSide()}
  if(a==="undo"){s.semi=s.applied.semi;s.tempo=s.applied.tempo;saveSong(s);renderSide()}
  if(a==="apply"){ensureCtx();await E.ready;const was=d.playing,keep=songPosOrig();if(was)pause();s.applied={semi:s.semi,tempo:s.tempo};saveSong(s);
    E.decks.forEach(x=>{if(x.song&&x.song.id===s.id&&x!==d)x.unload()});
    try{busy("Processando tom e andamento",0);const ok=await loadIntoDeck(d,s,p=>busy("Processando tom e andamento",p));busy(null);if(!ok)return;d.anchorPos=clamp(keep/d.ratio,d.startPos,d.endPos);applyTrackMix(d);renderAll();padFollow(true);toast(`Pronto: ${transposeKey(s.key,s.applied.semi)} a ${+(s.bpm*s.applied.tempo/100).toFixed(1)} BPM.`)}
    catch(err){busy(null);s.applied={semi:0,tempo:100};s.semi=0;s.tempo=100;saveSong(s);toast(err.message||"Não foi possível processar.");renderAll()}}
  if(a==="clk"){s.click.on=!s.click.on;if(!s.click.on)cancelClicks();saveSong(s);renderSide();renderTransport()}
  if(a==="mkadd"){const bar=(s.sig||4)*60/s.bpm,off=s.beatOffset||0,o=songPosOrig(),t=Math.max(0,off+Math.round((o-off)/bar)*bar);s.markers.push({name:"Nova seção",t:Math.round(t*1000)/1000});saveSong(s);renderSide();renderSections();drawArr()}
  if(a==="org")return organizeSections(s);
  if(a==="chadd"){const beat=60/s.bpm,off=s.beatOffset||0,o=songPosOrig(),t=Math.max(0,off+Math.round((o-off)/beat)*beat);s.chords=s.chords||[];
    const prevC=[...s.chords].reverse().find(c=>c.t<=t);s.chords.push({t:Math.round(t*1000)/1000,c:prevC?prevC.c:(s.key&&s.key!=="—"?s.key:"C")});s.chords.sort((a,b)=>a.t-b.t);saveSong(s);renderSide();renderArr();renderTime()}
  if(a==="mkdel"){s.markers.splice(+b.dataset.i,1);E.vamp=null;saveSong(s);renderSide();renderSections();drawArr()}
  const loaded=d&&d.song===s&&d.loaded;
  if(a==="tstart"||a==="tend"||a==="tclr"){if(!loaded){toast("Abra e toque a música antes de marcar início ou fim.");return}const o=songPosOrig();
    if(a==="tstart"){s.trimStart=Math.max(0,Math.round(o*100)/100);if(s.trimEnd!=null&&s.trimEnd<=s.trimStart+1)s.trimEnd=null}
    if(a==="tend"){if(o<=(s.trimStart||0)+1){toast("O fim precisa ficar depois do início.");return}s.trimEnd=Math.round(o*100)/100}
    if(a==="tclr"){s.trimStart=0;s.trimEnd=null}
    saveSong(s);const was=d.playing;d.bounds();if(!was)d.anchorPos=clamp(d.anchorPos,d.startPos,d.endPos);d.endHandled=false;renderAll()}});
sb.addEventListener("change",e=>{const t=e.target,set=curSet(),s=curSong();
  if(t.id==="setSel2"){S.currentSet=t.value;S.idx=curSet().songIds.indexOf(S.curSongId);saveMeta();renderAll();return}
  if(t.id==="setName"){set.name=t.value.trim()||set.name;saveSet(set);renderSetPick();return}
  if(t.id==="trMode"){set.trans=Object.assign({xfade:6,gap:2},set.trans,{mode:t.value});saveSet(set);renderSide();return}
  if(t.id==="trX"){set.trans.xfade=+t.value;saveSet(set);renderSide();return}
  if(t.id==="trG"){set.trans.gap=+t.value;saveSet(set);renderSide();return}
  if(t.id==="cJump"){S.settings.jumpMode=t.value;saveMeta();return}
  if(t.id==="cMinBg"){S.settings.minBg=t.value;saveMeta();if(E.min)applyTrackMix(E.cur);return}
  if(t.id==="cPre"){S.settings.preload=t.value;saveMeta();freeIdle();return}
  if(!s)return;
  if(t.id==="cTempo"){s.tempo=+t.value;saveSong(s);renderSide();return}
  if(t.id==="cName")s.name=t.value.trim()||s.name;else if(t.id==="cArtist")s.artist=t.value.trim();else if(t.id==="cKey"){s.key=t.value.trim()||s.key;padFollow()}
  else if(t.id==="cBpm")s.bpm=clamp(+t.value||s.bpm,30,260);else if(t.id==="cSig")s.sig=+t.value;else if(t.id==="cSub")s.click.sub=+t.value;else if(t.id==="cCount")s.click.countIn=+t.value;
  else if(t.dataset.mk!=null){s.markers[+t.dataset.mk].name=(t.value.trim()||"Seção").replace(/\s+\d+$/,"");renumberSections(s.markers);setTimeout(renderSide,0)}
  else if(t.dataset.ch!=null){const v=t.value.trim().replace(/^([a-g])/,m=>m.toUpperCase());if(!v)s.chords.splice(+t.dataset.ch,1);else s.chords[+t.dataset.ch].c=v;saveSong(s);renderSide();renderArr();renderTime();return}
  else if(t.dataset.tn){s.tracks.find(x=>x.id===t.dataset.tn).name=t.value.trim()||"Faixa";renderArr()}
  else if(t.dataset.tk){s.tracks.find(x=>x.id===t.dataset.tk).kind=t.value;applyTrackMix(E.cur);renderArr()}
  if(["cBpm","cSig","cSub"].includes(t.id)&&E.cur&&E.cur.playing){cancelClicks();E.cur.clickFrom=E.ctx.currentTime}
  saveSong(s);renderHero();renderSections();drawArr();renderTime()});
sb.addEventListener("input",e=>{const t=e.target,s=curSong();
  if(t.id==="cTempo"&&s){$("#cTempoOut").textContent=t.value+"% · "+(+(s.bpm*t.value/100).toFixed(1))}
  if(t.id==="cClickVol"){S.settings.clickVol=+t.value;applyGlobalMix();saveMeta()}
  if(t.id==="cPadVol"){S.settings.padVol=+t.value;applyGlobalMix();saveMeta()}});
async function deleteSong(id){const s=songById(id);if(!s)return;E.decks.forEach(d=>{if(d.song&&d.song.id===id)d.unload()});if(S.curSongId===id){S.curSongId=null;cancelClicks()}
  S.songs=S.songs.filter(x=>x!==s);S.sets.forEach(x=>{const n=x.songIds.length;x.songIds=x.songIds.filter(y=>y!==id);if(x.songIds.length!==n)saveSet(x)});
  if(!s.demo)Sync.tomb("mt_musicas",id);
  await idb("songs","readwrite",st=>st.delete(id));for(const t of s.tracks){await idb("stems","readwrite",st=>st.delete(t.id));S.have.delete(t.id)}if(s.demo)idb("meta","readwrite",st=>st.put(true,"demoRemoved"));
  S.idx=curSet()?curSet().songIds.indexOf(S.curSongId):-1;toast(`"${s.name}" excluída.`);renderAll()}

/* Laço visual */
let lastSec=-2;
function frame(){const d=E.cur;if(d&&d.playing){drawArr();renderTime();const ci=curSectionIdx(d);if(ci!==lastSec){lastSec=ci;renderSections()}}requestAnimationFrame(frame)}
requestAnimationFrame(frame);

/* Controles fixos */
const togglePlay=()=>{ensureCtx();E.cur&&E.cur.playing?pause():startPlay()};
$("#bPlay").onclick=togglePlay;$("#mPlay").onclick=togglePlay;
$("#bStop").onclick=()=>{ensureCtx();stopToStart()};
const prev=()=>{ensureCtx();const d=E.cur;if(d&&d.playing&&d.pos()-d.startPos>3){d.seek(d.startPos);return}goNext(-1)};
$("#bPrev").onclick=prev;$("#mPrev").onclick=prev;$("#bNext").onclick=()=>goNext(1);$("#mNext").onclick=()=>goNext(1);
$("#bImport").onclick=openImport;try{$("#ano").textContent=new Date().getFullYear()}catch(e){}
/* Oferta (Pix) e convite para artistas */
const PIX_KEY="+5541991542931",PIX_CODE="00020101021126360014br.gov.bcb.pix0114+55419915429315204000053039865802BR5922Diogo Domingues Soares6009SAO PAULO622905251HGER0Y8YV0TYBV9ZT8FNSVJT630446F1";
function openBless(){$("#bless").hidden=false;$("#cpFallback").hidden=true}
function copyText(txt,label){const done=()=>toast(label+" copiado. Cole no app do seu banco.");
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(done).catch(()=>fallback());else fallback();
  function fallback(){const i=$("#cpFallback");i.hidden=false;i.value=txt;i.focus();i.select();toast("Selecione e copie o código destacado.")}}
document.addEventListener("click",e=>{if(e.target.closest("[data-bless]"))openBless();if(e.target.id==="bless"||e.target.closest("[data-blclose]"))$("#bless").hidden=true});
$("#bBless").onclick=openBless;$("#cpKey").onclick=()=>copyText(PIX_KEY,"Chave Pix");$("#cpCode").onclick=()=>copyText(PIX_CODE,"Pix copia e cola");
$("#wClose").onclick=()=>{$("#welcome").hidden=true;try{localStorage.setItem("ddsmt-welcome","fechado")}catch(e){}};
try{if(localStorage.getItem("ddsmt-welcome")!=="fechado")$("#welcome").hidden=false}catch(e){$("#welcome").hidden=false}$("#bAcc").onclick=()=>openAccount();
document.addEventListener("click",e=>{const b=e.target.closest('[data-act="link"]');if(b&&curSong())openLink(curSong())});
$("#tIem").onclick=()=>{ensureCtx();S.settings.iem=!S.settings.iem;applyGlobalMix();saveMeta();renderTransport();toast(S.settings.iem?"Fones L/R: click e guia na esquerda; banda e pad na direita.":"Fones L/R desligado.")};
$("#tPad").onclick=()=>{ensureCtx();S.settings.padOn=!S.settings.padOn;padFollow(true);saveMeta();renderTransport()};
$("#tClick").onclick=()=>{const s=curSong();if(!s)return;ensureCtx();s.click.on=!s.click.on;if(!s.click.on)cancelClicks();saveSong(s);renderTransport();if(S.side==="cfg")renderSide()};
$("#mstVol").oninput=e=>{S.settings.master=+e.target.value;applyGlobalMix();saveMeta()};
$("#setSel").onchange=e=>{S.currentSet=e.target.value;S.idx=curSet().songIds.indexOf(S.curSongId);saveMeta();renderAll()};
document.querySelectorAll(".seg button").forEach(b=>b.onclick=()=>{S.side=b.dataset.side;renderSide()});
document.querySelectorAll(".mtabs button").forEach(b=>b.onclick=()=>{S.tab=b.dataset.tab;if(S.tab!=="tracks")S.side=S.tab;renderSide();if(S.tab==="tracks")requestAnimationFrame(drawArr)});
document.addEventListener("keydown",e=>{if(e.target.closest("input,select,textarea")||!$("#imp").hidden||!$("#acc").hidden||!$("#bless").hidden)return;
  if(e.code==="Space"){e.preventDefault();togglePlay()}else if(e.key==="ArrowRight")goNext(1);else if(e.key==="ArrowLeft")prev();
  else if(/^[1-9]$/.test(e.key))sectionTap(+e.key-1);else if(e.key==="m"||e.key==="M")toggleMin();else if(e.key==="v"||e.key==="V")toggleVamp(E.vamp)});
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&E.cur&&E.cur.playing)keepAwake(true)});

/* ================= Início ================= */
(async function boot(){
  db=await idbOpen();
  const songs=(await idb("songs","readonly",s=>s.getAll()))||[],sets=(await idb("setlists","readonly",s=>s.getAll()))||[];
  const meta=await idb("meta","readonly",s=>s.get("state")),demoGone=await idb("meta","readonly",s=>s.get("demoRemoved"));
  if(meta&&meta.settings&&meta.settings!==true)Object.assign(S.settings,meta.settings);
  S.songs=Array.isArray(songs)?songs:[];let demo=S.songs.find(s=>s.id==="demo");
  if(!demo&&demoGone!==true){demo=demoSong();S.songs.unshift(demo)}
  if(demo&&!(demo.tracks[0].peaks||[]).length){try{await demoPeaks(demo);saveSong(demo)}catch(e){}}
  S.sets=Array.isArray(sets)&&sets.length?sets:[{id:uid(),name:"Culto de domingo",auto:true,songIds:demo?["demo"]:[],trans:{mode:"stop",xfade:6,gap:2}}];
  if(!(Array.isArray(sets)&&sets.length))S.sets.forEach(x=>saveSet(x,{local:true}));
  const keys=(await idb("stems","readonly",s=>s.getAllKeys()))||[];S.have=new Set(Array.isArray(keys)?keys:[]);
  S.currentSet=meta&&S.sets.some(x=>x.id===meta.currentSet)?meta.currentSet:S.sets[0].id;
  const set=curSet(),first=(meta&&meta.lastSong&&songById(meta.lastSong)&&meta.lastSong)||set.songIds.find(id=>songById(id))||(S.songs[0]&&S.songs[0].id);
  if(first){S.curSongId=first;S.idx=set.songIds.indexOf(first)}
  renderAll();
  if(!db)toast("Este navegador não permite guardar arquivos. As músicas importadas ficam só até fechar a página.",7000);
  Sync.init();
  if("serviceWorker" in navigator&&location.protocol==="https:"){navigator.serviceWorker.register("sw.js").then(reg=>{reg.addEventListener("updatefound",()=>{const w=reg.installing;w&&w.addEventListener("statechange",()=>{if(w.state==="installed"&&navigator.serviceWorker.controller)toast("Nova versão do app baixada. Ela entra na próxima vez que você abrir o app.",6000)})})}).catch(()=>{})}
})();

/* ================= Nuvem: conta (e-mail e senha) e sincronização da biblioteca =================
   Os áudios ficam em cada aparelho. Músicas e repertórios de cada pessoa vão para o Supabase
   e aparecem em todos os aparelhos dela. Funciona offline e envia quando a internet volta. */
const SUPA_URL="https://arffptuclrrzuzdrcmuc.supabase.co";
const SUPA_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyZmZwdHVjbHJyenV6ZHJjbXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MTcxMDAsImV4cCI6MjEwMTI5MzEwMH0.n3AqYrMwv2ayVa4la6vesVJOfd_LkdmY-ikp8P8uFAg";
const LOCAL_ONLY=["applied","dirty","syncedAt","updatedAt","auto"];
const Sync={sb:null,user:null,uid:null,nome:"",checked:false,member:false,status:"off",lastPull:null,lastOk:0,lastUid:null,tombs:{mt_musicas:[],mt_repertorios:[]},
  busy:false,again:false,timer:null,tab:"entrar",msg:"",channel:null,
  async init(){
    try{const m=await idb("meta","readonly",s=>s.get("sync"));if(m&&m!==true){this.lastPull=m.lastPull||null;this.lastUid=m.lastUid||null;this.tombs=Object.assign(this.tombs,m.tombs||{})}}catch(e){}
    if(!window.supabase||!window.supabase.createClient){this.set("off");return}
    this.sb=window.supabase.createClient(SUPA_URL,SUPA_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:"ddsmt-auth"}});
    this.sb.auth.onAuthStateChange((ev,session)=>{setTimeout(()=>this.onSession(session),0)});
    try{const {data}=await this.sb.auth.getSession();await this.onSession(data&&data.session)}catch(e){this.set(navigator.onLine?"erro":"offline")}
    window.addEventListener("online",()=>{this.syncNow();Live.reconnect()});window.addEventListener("offline",()=>this.set(this.user?"offline":"off"));
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)this.syncNow()});
    setInterval(()=>this.syncNow(),60000)},
  saveMeta(){idb("meta","readwrite",s=>s.put({lastPull:this.lastPull,lastUid:this.lastUid,tombs:this.tombs},"sync"))},
  set(st){this.status=st;renderAccount()},
  async onSession(session){const u=session&&session.user;const uid=u?u.id:null;
    if(uid&&uid===this.uid&&this.checked)return;
    this.uid=uid;this.user=u&&u.email?u.email.toLowerCase():null;this.nome=(u&&u.user_metadata&&u.user_metadata.nome)||(this.user?this.user.split("@")[0]:"");
    this.checked=!!uid;this.member=!!uid;
    if(!uid){this.set("off");this.unsubscribe();Live.onLogout();return}
    if(this.lastUid!==uid){this.lastPull=null;this.lastUid=uid;this.saveMeta();
      S.songs.forEach(x=>{if(!x.demo){x.dirty=true;x.updatedAt=Date.now();saveSong(x,{local:true})}});S.sets.forEach(x=>{if(!x.auto){x.dirty=true;x.updatedAt=Date.now();saveSet(x,{local:true})}})}
    if(!$("#acc").hidden&&this.tab!=="perfil")setTimeout(closeAccount,700);
    this.subscribe();Live.onLogin();
    if(!navigator.onLine){this.set("offline");return}await this.syncNow()},
  subscribe(){if(this.channel||!this.sb)return;try{this.channel=this.sb.channel("ddsmt-lib-"+this.uid)
      .on("postgres_changes",{event:"*",schema:"public",table:"mt_musicas",filter:"dono=eq."+this.uid},()=>this.soon(700))
      .on("postgres_changes",{event:"*",schema:"public",table:"mt_repertorios",filter:"dono=eq."+this.uid},()=>this.soon(700)).subscribe()}catch(e){}},
  unsubscribe(){if(this.channel){try{this.sb.removeChannel(this.channel)}catch(e){}this.channel=null}},
  soon(ms){clearTimeout(this.timer);this.timer=setTimeout(()=>this.syncNow(),ms||1500)},
  tomb(tbl,id){if(!this.tombs[tbl].includes(id))this.tombs[tbl].push(id);this.saveMeta();this.soon()},
  async syncNow(){if(!this.sb||!this.uid)return;if(!navigator.onLine){this.set("offline");return}
    if(this.busy){this.again=true;return}this.busy=true;this.set("syncing");
    try{await this.push();await this.pull();this.lastOk=Date.now();this.set("ok")}
    catch(e){console.warn("sync",e);this.set(navigator.onLine?"erro":"offline")}
    this.busy=false;if(this.again){this.again=false;this.soon(300)}},
  clean(x){const c=JSON.parse(JSON.stringify(x));LOCAL_ONLY.forEach(k=>delete c[k]);if(c.tracks)c.tracks.forEach(t=>{delete t.mute;delete t.solo});return c},
  async push(){const t0=Date.now();
    const plan=[["mt_musicas",S.songs.filter(x=>x.dirty&&!x.demo),saveSong],["mt_repertorios",S.sets.filter(x=>x.dirty&&!x.auto),saveSet]];
    for(const [tbl,list,save] of plan){if(!list.length)continue;
      const {data,error}=await this.sb.from(tbl).upsert(list.map(x=>({id:x.id,dados:this.clean(x),excluida:false,dono:this.uid}))).select("id,atualizado_em");if(error)throw error;
      const at=new Map((data||[]).map(r=>[r.id,r.atualizado_em]));list.forEach(x=>{if(!at.has(x.id))return;x.syncedAt=at.get(x.id);if(!(x.updatedAt>t0))x.dirty=false;save(x,{local:true})})}
    for(const tbl of ["mt_musicas","mt_repertorios"]){const ids=this.tombs[tbl];if(!ids.length)continue;
      const {error}=await this.sb.from(tbl).update({excluida:true}).in("id",ids);if(error)throw error;this.tombs[tbl]=[];this.saveMeta()}},
  async pull(){const since=this.lastPull?new Date(new Date(this.lastPull).getTime()-15000).toISOString():"1970-01-01T00:00:00Z";let max=this.lastPull,changed=false;
    for(const tbl of ["mt_musicas","mt_repertorios"]){for(let from=0;;from+=500){
      const {data,error}=await this.sb.from(tbl).select("id,dados,atualizado_em,excluida").gt("atualizado_em",since).order("atualizado_em").range(from,from+499);if(error)throw error;
      for(const r of data){if(!max||new Date(r.atualizado_em)>new Date(max))max=r.atualizado_em;if(this.apply(tbl,r))changed=true}
      if(data.length<500)break}}
    if(changed){if(S.sets.some(x=>!x.auto)){const drop=S.sets.filter(x=>x.auto);if(drop.length&&S.sets.length>drop.length){drop.forEach(x=>idb("setlists","readwrite",st=>st.delete(x.id)));S.sets=S.sets.filter(x=>!x.auto);if(!S.sets.some(x=>x.id===S.currentSet)){S.currentSet=S.sets[0].id;saveMeta()}}}
      S.idx=curSet()?curSet().songIds.indexOf(S.curSongId):-1;if(S.curSongId&&!songById(S.curSongId))S.curSongId=null;refreshAfterSync()}
    this.lastPull=max;this.saveMeta()},
  apply(tbl,r){
    if(tbl==="mt_musicas"){const loc=songById(r.id);
      if(r.excluida){if(!loc||loc.dirty)return false;E.decks&&E.decks.forEach(d=>{if(d.song===loc)d.unload()});S.songs=S.songs.filter(x=>x!==loc);idb("songs","readwrite",st=>st.delete(loc.id));
        loc.tracks.forEach(t=>{idb("stems","readwrite",st=>st.delete(t.id));S.have.delete(t.id)});return true}
      if(loc&&(loc.dirty||loc.syncedAt===r.atualizado_em))return false;
      const d=r.dados||{};d.id=r.id;d.tracks=d.tracks||[];
      if(loc){const keep=new Map(loc.tracks.map(t=>[t.id,t])),applied=loc.applied||{semi:0,tempo:100};
        d.tracks.forEach(t=>{const o=keep.get(t.id);t.mute=o?!!o.mute:false;t.solo=o?!!o.solo:false});
        Object.keys(loc).forEach(k=>delete loc[k]);Object.assign(loc,d,{applied,dirty:false,syncedAt:r.atualizado_em});
        (E.decks||[]).forEach(dk=>{if(dk.song===loc&&dk.loaded){dk.bounds();applyTrackMix(dk)}});saveSong(loc,{local:true})}
      else{d.tracks.forEach(t=>{t.mute=false;t.solo=false});Object.assign(d,{applied:{semi:0,tempo:100},dirty:false,syncedAt:r.atualizado_em});S.songs.push(d);saveSong(d,{local:true})}
      return true}
    const loc=S.sets.find(x=>x.id===r.id);
    if(r.excluida){if(!loc||loc.dirty||S.sets.length<2)return false;S.sets=S.sets.filter(x=>x!==loc);idb("setlists","readwrite",st=>st.delete(loc.id));if(S.currentSet===loc.id){S.currentSet=S.sets[0].id;saveMeta()}return true}
    if(loc&&(loc.dirty||loc.syncedAt===r.atualizado_em))return false;
    const d=Object.assign(r.dados||{},{id:r.id,dirty:false,syncedAt:r.atualizado_em,auto:false});d.songIds=d.songIds||[];
    if(loc){Object.keys(loc).forEach(k=>delete loc[k]);Object.assign(loc,d);saveSet(loc,{local:true})}else{S.sets.push(d);saveSet(d,{local:true})}
    return true},
  /* Conta: e-mail e senha */
  errMsg(e){const m=(e&&e.message)||"";
    if(/invalid login|invalid credentials/i.test(m))return"E-mail ou senha incorretos.";
    if(/already registered|already exists/i.test(m))return"Esse e-mail já tem conta. Use a aba Entrar.";
    if(/password.*(6|short|least)/i.test(m))return"A senha precisa ter pelo menos 6 caracteres.";
    if(/rate|too many/i.test(m))return"Muitas tentativas seguidas. Espere um minuto e tente de novo.";
    if(/network|fetch/i.test(m))return"Sem conexão com o servidor. Verifique a internet.";
    return"Não foi possível: "+m},
  async signIn(email,senha){email=(email||"").trim().toLowerCase();if(!email||!senha){this.msg="Preencha e-mail e senha.";return accHTML()}
    if(!navigator.onLine){this.msg="Sem internet. Conecte para entrar.";return accHTML()}
    this.msg="Entrando…";accHTML();const {error}=await this.sb.auth.signInWithPassword({email,password:senha});
    this.msg=error?this.errMsg(error):"";if(error)accHTML()},
  async signUp(f){const email=(f.email||"").trim().toLowerCase(),email2=(f.email2||"").trim().toLowerCase();
    if(!f.nome.trim()){this.msg="Digite seu nome.";return accHTML()}
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){this.msg="Digite um e-mail válido.";return accHTML()}
    if(email!==email2){this.msg="Os dois e-mails não são iguais.";return accHTML()}
    if((f.senha||"").length<6){this.msg="A senha precisa ter pelo menos 6 caracteres.";return accHTML()}
    if(f.senha!==f.senha2){this.msg="As duas senhas não são iguais.";return accHTML()}
    if(!navigator.onLine){this.msg="Sem internet. Conecte para criar a conta.";return accHTML()}
    this.msg="Criando sua conta…";accHTML();
    const {data,error}=await this.sb.auth.signUp({email,password:f.senha,options:{data:{nome:f.nome.trim().slice(0,60)}}});
    if(error){this.msg=this.errMsg(error);return accHTML()}
    if(!data.session){const r=await this.sb.auth.signInWithPassword({email,password:f.senha});if(r.error){this.msg="Conta criada. Entre com seu e-mail e senha.";this.tab="entrar";return accHTML()}}
    this.msg="";toast("Conta criada. Bem-vindo, "+f.nome.trim().split(" ")[0]+"!")},
  async signOut(){Live.stopAll();await this.sb.auth.signOut();this.tab="entrar";this.set("off")}
};
function refreshAfterSync(){const f=document.activeElement;renderSetPick();renderHero();renderTransport();renderSections();renderArr();renderTime();
  if(!(f&&f.closest&&f.closest("#sideBody")))renderSide()}
const STATUS={off:["Entrar","",""],ok:["Sincronizado","ok","Biblioteca salva na nuvem"],syncing:["Sincronizando","run","Enviando e recebendo mudanças"],offline:["Sem internet","off","Mudanças ficam no aparelho e sobem quando a internet voltar"],erro:["Erro ao sincronizar","bad","Tentaremos de novo automaticamente"]};
function renderAccount(){const b=$("#bAcc");if(!b)return;const st=STATUS[Sync.status]||STATUS.off;
  b.innerHTML=Sync.user?`<i class="sdot ${st[1]}"></i><span class="acc-l">${esc(Sync.nome||st[0])}</span><span class="avatar">${esc((Sync.nome||Sync.user)[0].toUpperCase())}</span>`:`<svg class="icon" viewBox="0 0 24 24"><path d="M12 12a4.5 4.5 0 100-9 4.5 4.5 0 000 9zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5z"/></svg><span class="acc-l">Entrar</span>`;
  b.title=Sync.user?(Sync.user+" · "+st[2]):"Entrar ou criar conta";
  if(!$("#acc").hidden)accHTML();renderLiveChip()}
function openAccount(tab){Sync.tab=tab||(Sync.user?"perfil":"entrar");Sync.msg="";$("#acc").hidden=false;accHTML();setTimeout(()=>{const i=$("#acc input");i&&i.focus()},40)}
function closeAccount(){$("#acc").hidden=true}
function accHTML(){const el=$("#accDlg"),st=STATUS[Sync.status]||STATUS.off,msg=Sync.msg?`<p class="help" style="margin:0;color:var(--accent)" role="status">${esc(Sync.msg)}</p>`:"";
  if(!Sync.sb){el.innerHTML=`<button class="btn-ghost x" data-acc="close" aria-label="Fechar">✕</button><h2>Conta</h2><p class="muted">Não consegui carregar o módulo da nuvem. Recarregue o app com internet.</p>`;return}
  if(!Sync.user){const up=Sync.tab==="criar";
    el.innerHTML=`<button class="btn-ghost x" data-acc="close" aria-label="Fechar">✕</button><h2>${up?"Criar conta":"Entrar"}</h2>
    <div class="seg2"><button data-acc="tab-entrar" class="${up?"":"on"}">Entrar</button><button data-acc="tab-criar" class="${up?"on":""}">Criar conta</button></div>
    ${up?`<form class="stack" data-acc="criar" autocomplete="on">
        <input type="text" id="suNome" placeholder="Seu nome" autocomplete="name" maxlength="60">
        <input type="email" id="suEmail" placeholder="E-mail" autocomplete="email">
        <input type="email" id="suEmail2" placeholder="Repita o e-mail" autocomplete="off">
        <input type="password" id="suSenha" placeholder="Senha (mínimo 6 caracteres)" autocomplete="new-password">
        <input type="password" id="suSenha2" placeholder="Repita a senha" autocomplete="new-password">
        <button class="btn-primary">Criar conta</button></form>${msg}
        <p class="help" style="margin:0">Com a conta, sua biblioteca aparece em todos os seus aparelhos e você pode criar ou entrar na sala do ministério.</p>`
    :`<form class="stack" data-acc="entrar" autocomplete="on">
        <input type="email" id="liEmail" placeholder="E-mail" autocomplete="username">
        <input type="password" id="liSenha" placeholder="Senha" autocomplete="current-password">
        <button class="btn-primary">Entrar</button></form>${msg}
        <p class="help" style="margin:0">Esqueceu a senha? Fale com o suporte no <a href="https://wa.me/5541991542931?text=Ol%C3%A1!%20Esqueci%20minha%20senha%20do%20DDS%20MultiTrack." target="_blank" rel="noopener" style="color:var(--accent)">WhatsApp</a>.</p>`}
    <p class="help" style="margin:0">Não precisa de conta para tocar: o app funciona sem cadastro neste aparelho.</p>`;return}
  el.innerHTML=`<button class="btn-ghost x" data-acc="close" aria-label="Fechar">✕</button><h2>Sua conta</h2>
    <div class="mem"><span class="avatar big">${esc((Sync.nome||Sync.user)[0].toUpperCase())}</span><span style="min-width:0"><b>${esc(Sync.nome)}</b><span class="muted">${esc(Sync.user)}</span></span></div>
    <div class="callout" style="border-color:${Sync.status==="ok"?"var(--ok)":Sync.status==="erro"?"var(--danger)":"var(--line-2)"};background:transparent"><i class="sdot ${st[1]}"></i><span style="flex:1"><b>${esc(st[0])}</b><br><span class="muted">${esc(st[2])}${Sync.lastOk?" · última vez às "+new Date(Sync.lastOk).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}):""}</span></span><button data-acc="sync">Sincronizar agora</button></div>
    <p class="help" style="margin:0">Músicas e repertórios ficam iguais em todos os seus aparelhos. Os áudios (stems) ficam guardados em cada aparelho.</p>
    <div class="row" style="justify-content:space-between"><button data-acc="sala">Sala do ministério</button><button class="btn-ghost" data-acc="out">Sair desta conta</button></div>`}
$("#acc").addEventListener("click",e=>{if(e.target.id==="acc")return closeAccount();const b=e.target.closest("[data-acc]");if(!b||b.tagName==="FORM")return;const a=b.dataset.acc;
  if(a==="close")closeAccount();if(a==="tab-entrar"||a==="tab-criar"){Sync.tab=a.slice(4);Sync.msg="";accHTML()}
  if(a==="sync")Sync.syncNow();if(a==="out")Sync.signOut();if(a==="sala"){closeAccount();openSala()}});
$("#acc").addEventListener("submit",e=>{e.preventDefault();const a=e.target.dataset.acc;
  if(a==="entrar")Sync.signIn($("#liEmail").value,$("#liSenha").value);
  if(a==="criar")Sync.signUp({nome:$("#suNome").value,email:$("#suEmail").value,email2:$("#suEmail2").value,senha:$("#suSenha").value,senha2:$("#suSenha2").value})});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("#acc").hidden)closeAccount()});

/* ================= Sala do ministério e modo Acompanhar =================
   O líder cria a sala e passa o código. Quando ele toca, o app publica o estado (música, posição,
   seção, fila de salto, repetição, repertório) na linha da sala. A equipe acompanha ao vivo,
   calculando a posição pelo relógio do servidor. */
const Live={salas:[],cur:null,papel:null,chan:null,presence:[],membros:[],offset:0,following:false,lastSent:null,lastPush:0,hbAt:0,
  transmit:true,pollT:null,raf:0,msg:"",confirm:null,pendingCode:null,lastIdx:-9,lastChordIdx:-9,lastBeat:-9,
  async onLogin(){try{await this.clock()}catch(e){}await this.load();if(this.pendingCode){const c=this.pendingCode;this.pendingCode=null;this.entrar(c)}},
  onLogout(){this.stopAll();this.salas=[];this.cur=null;this.papel=null;renderLive()},
  stopAll(){this.closeFollow();this.leaveChannel()},
  reconnect(){if(this.cur&&Sync.sb){this.leaveChannel();this.joinChannel();this.clock().catch(()=>{})}},
  async clock(){if(!Sync.sb)return;let best=1e9;for(let i=0;i<3;i++){const t0=Date.now();const {data,error}=await Sync.sb.rpc("mt_agora");const t1=Date.now();if(error)return;if(t1-t0<best){best=t1-t0;this.offset=Number(data)-(t0+t1)/2}}},
  now(){return Date.now()+this.offset},
  async load(){if(!Sync.sb||!Sync.uid)return;const {data,error}=await Sync.sb.from("mt_salas").select("id,codigo,nome,lider,lider_nome,estado,estado_em").order("criado_em");if(error)return;
    this.salas=data||[];let keep=null;try{keep=localStorage.getItem("ddsmt-sala")}catch(e){}
    this.select(this.salas.find(x=>x.id===keep)||this.salas.find(x=>x.lider===Sync.uid)||this.salas[0]||null)},
  select(s){if(this.cur&&s&&this.cur.id===s.id){Object.assign(this.cur,s);return renderLive()}
    this.closeFollow();this.leaveChannel();this.cur=s;this.papel=s?(s.lider===Sync.uid?"lider":"membro"):null;this.lastSent=null;this.membros=[];
    try{localStorage.setItem("ddsmt-sala",s?s.id:"")}catch(e){}if(s){this.joinChannel();if(this.papel==="lider")this.loadMembros()}renderLive()},
  joinChannel(){const s=this.cur;if(!s||!Sync.sb)return;try{
    this.chan=Sync.sb.channel("mt-sala-"+s.id,{config:{presence:{key:Sync.uid}}})
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"mt_salas",filter:"id=eq."+s.id},p=>this.onRow(p.new))
      .on("postgres_changes",{event:"DELETE",schema:"public",table:"mt_salas",filter:"id=eq."+s.id},()=>this.gone())
      .on("postgres_changes",{event:"*",schema:"public",table:"mt_sala_membros",filter:"sala_id=eq."+s.id},()=>{if(this.papel==="lider")this.loadMembros()})
      .on("presence",{event:"sync"},()=>{const st=this.chan?this.chan.presenceState():{};this.presence=Object.values(st).map(a=>a[0]).filter(Boolean);renderLive()})
      .subscribe(st=>{if(st==="SUBSCRIBED")this.track()})}catch(e){}},
  track(){try{return this.chan&&this.chan.track({nome:Sync.nome,papel:this.papel,seguindo:this.following})}catch(e){}},
  leaveChannel(){if(this.chan){try{Sync.sb.removeChannel(this.chan)}catch(e){}this.chan=null;this.presence=[]}},
  gone(){if(!this.cur)return;toast("A sala \""+this.cur.nome+"\" foi encerrada pelo líder.");const id=this.cur.id;this.salas=this.salas.filter(x=>x.id!==id);this.cur=null;this.select(this.salas[0]||null)},
  onRow(r){if(!this.cur||!r||r.id!==this.cur.id)return;Object.assign(this.cur,r);if(this.following)this.renderFollow(true);renderLiveChip()},
  err(e){const m=(e&&e.message)||"";if(/codigo_invalido/.test(m))return"Código não encontrado. Confira com o líder.";if(/precisa_entrar/.test(m))return"Entre na sua conta primeiro.";
    if(/limite_de_salas/.test(m))return"Você já tem muitas salas. Exclua uma para criar outra.";if(/so_o_lider/.test(m))return"Só o líder pode fazer isso.";return"Não foi possível: "+m},
  async criar(nome){if(!Sync.uid)return openAccount("criar");this.msg="Criando…";renderLive();
    const {data,error}=await Sync.sb.rpc("mt_criar_sala",{p_nome:(nome||"").trim()||"Ministério de Louvor",p_lider_nome:Sync.nome});
    if(error){this.msg=this.err(error);return renderLive()}this.msg="";this.salas.push(data);this.select(data);toast("Sala criada. Passe o código "+fmtCode(data.codigo)+" para a equipe.")},
  async entrar(cod){if(!Sync.uid){this.pendingCode=cod;return openAccount("criar")}cod=(cod||"").replace(/[^a-z0-9]/gi,"").toUpperCase();if(cod.length<6){this.msg="O código tem 6 letras e números.";return renderLive()}
    this.msg="Entrando…";renderLive();const {data,error}=await Sync.sb.rpc("mt_entrar_sala",{p_codigo:cod,p_nome:Sync.nome});
    if(error){this.msg=this.err(error);return renderLive()}this.msg="";if(!this.salas.some(x=>x.id===data.id))this.salas.push(data);this.select(this.salas.find(x=>x.id===data.id));
    toast("Você entrou na sala \""+data.nome+"\".");if(data.lider!==Sync.uid){closeSala();this.openFollow()}},
  async sair(){const s=this.cur;if(!s)return;const {error}=await Sync.sb.from("mt_sala_membros").delete().eq("sala_id",s.id).eq("usuario",Sync.uid);if(error){toast(this.err(error));return}
    this.salas=this.salas.filter(x=>x.id!==s.id);this.cur=null;this.select(this.salas[0]||null);toast("Você saiu da sala.")},
  async excluir(){const s=this.cur;if(!s)return;const {error}=await Sync.sb.from("mt_salas").delete().eq("id",s.id);if(error){toast(this.err(error));return}
    this.salas=this.salas.filter(x=>x.id!==s.id);this.cur=null;this.select(this.salas[0]||null);toast("Sala excluída.")},
  async novoCodigo(){const {data,error}=await Sync.sb.rpc("mt_novo_codigo",{p_sala:this.cur.id});if(error){toast(this.err(error));return}this.cur.codigo=data;renderLive();toast("Novo código: "+fmtCode(data)+". O antigo deixou de funcionar.")},
  async loadMembros(){if(!this.cur)return;const {data}=await Sync.sb.from("mt_sala_membros").select("usuario,nome,entrou_em").eq("sala_id",this.cur.id).order("entrou_em");this.membros=data||[];renderLive()},
  async remover(uid){const {error}=await Sync.sb.from("mt_sala_membros").delete().eq("sala_id",this.cur.id).eq("usuario",uid);if(error){toast(this.err(error));return}this.confirm=null;this.loadMembros()},
  /* Líder: publica o estado quando algo muda e um sinal de vida periódico */
  snapshot(){const d=E.cur,s=curSong(),set=curSet();const playing=!!(d&&d.playing&&!d.handoff&&d.song===s);
    const pos=s&&d&&d.song===s?songPosOrig():(s?(s.trimStart||0):0),rate=(d&&d.song===s&&d.ratio)||1;
    const mus=s?{id:s.id,nome:s.name,artista:s.artist||"",tom:transposeKey(s.key,s.applied.semi),bpm:+(s.bpm*(s.applied.tempo/100)).toFixed(2),bpmOrig:s.bpm,sig:s.sig||4,off:s.beatOffset||0,
      dur:s.duration,ini:s.trimStart||0,fim:s.trimEnd??s.duration,secoes:[...s.markers].sort((a,b)=>a.t-b.t).map(m=>({n:m.name,t:m.t})),
      cifra:(s.chords||[]).map(c=>[Math.round(c.t*100)/100,transposeChord(c.c,s.applied.semi)])}:null;
    const fila=E.queued&&E.ctx?{i:E.queued.idx,at:Math.round(this.now()+(E.queued.time-E.ctx.currentTime)*1000)}:null;
    const rep=set?{nome:set.name,i:S.idx,itens:set.songIds.map(id=>songById(id)).filter(Boolean).map(x=>({n:x.name,tom:transposeKey(x.key,x.applied.semi)}))}:null;
    const st={v:1,at:Math.round(this.now()),tocando:playing,pos:+pos.toFixed(3),rate,musica:mus,vamp:E.vamp,fila,rep,lider:Sync.nome};
    const sig=JSON.stringify([playing,mus&&[mus.id,mus.tom,mus.bpm,mus.ini,mus.fim,mus.secoes,mus.cifra.length],E.vamp,fila&&fila.i,rep&&[rep.nome,rep.i,rep.itens]]);
    return{st,sig}},
  tick(){if(!this.cur||this.papel!=="lider"||!this.transmit||!Sync.sb||!navigator.onLine)return;const t=Date.now();if(t-this.lastPush<250)return;
    const {st,sig}=this.snapshot(),lp=this.lastSent;let need=!lp||lp.sig!==sig;
    if(!need&&st.tocando){const pred=lp.pos+(st.at-lp.at)/1000*lp.rate;if(Math.abs(pred-st.pos)>0.12)need=true}
    if(!need&&t-this.hbAt>(st.tocando?10000:30000))need=true;if(!need)return;
    this.lastPush=t;this.hbAt=t;this.lastSent={pos:st.pos,at:st.at,rate:st.rate,sig};this.cur.estado=st;
    Sync.sb.from("mt_salas").update({estado:st}).eq("id",this.cur.id).then(({error})=>{if(error){console.warn("sala",error);this.lastSent=null}});renderLiveChip()},
  /* Equipe: tela de acompanhar */
  openFollow(){if(!this.cur)return openSala();this.following=true;$("#follow").hidden=false;document.body.classList.add("following");keepAwake(true);this.track();
    this.lastIdx=this.lastChordIdx=this.lastBeat=-9;this.renderFollow(true);cancelAnimationFrame(this.raf);const f=()=>{if(!this.following)return;this.renderFollow(false);this.raf=requestAnimationFrame(f)};this.raf=requestAnimationFrame(f);
    clearInterval(this.pollT);this.pollT=setInterval(()=>this.poll(),4000);this.clock().catch(()=>{})},
  closeFollow(){if(!this.following)return;this.following=false;$("#follow").hidden=true;document.body.classList.remove("following");clearInterval(this.pollT);cancelAnimationFrame(this.raf);this.track();if(!(E.cur&&E.cur.playing))keepAwake(false)},
  async poll(){if(!this.cur||!Sync.sb||!navigator.onLine)return;const {data}=await Sync.sb.from("mt_salas").select("id,estado,estado_em,nome,codigo").eq("id",this.cur.id).maybeSingle();
    if(!data){if(this.following)this.gone();return}const changed=JSON.stringify(data.estado)!==JSON.stringify(this.cur.estado);Object.assign(this.cur,data);if(changed)this.renderFollow(true)},
  posNow(st){const m=st.musica;let p=st.pos||0;const n=this.now();if(st.tocando)p+=(n-st.at)/1000*(st.rate||1);if(!m)return p;
    if(st.fila&&n>=st.fila.at){const sec=m.secoes[st.fila.i];if(sec)p=sec.t+(st.tocando?(n-st.fila.at)/1000*(st.rate||1):0)}
    if(st.vamp!=null){const a=m.secoes[st.vamp],b=m.secoes[st.vamp+1],end=b?b.t:m.fim;if(a&&p>=end){const L=end-a.t;if(L>0)p=a.t+((p-a.t)%L)}}
    return Math.max(0,Math.min(p,m.fim))},
  renderFollow(full){const el=$("#fwBody"),s=this.cur;if(!el||!s)return;const st=s.estado||{},m=st.musica;
    if(full){$("#fwSala").textContent=s.nome;$("#fwLider").textContent="Líder: "+(st.lider||s.lider_nome||"—");this.lastIdx=this.lastChordIdx=this.lastBeat=-9;
      if(!m){el.innerHTML=`<div class="fw-wait"><b>Aguardando o líder</b><span class="muted">Assim que o líder abrir uma música, ela aparece aqui.</span></div>${repHTML(st.rep)}`;return}
      const segs=m.secoes.map((x,i)=>{const end=i+1<m.secoes.length?m.secoes[i+1].t:m.fim;return`<i style="left:${(x.t-m.ini)/(m.fim-m.ini)*100}%;width:${Math.max(0,(end-x.t)/(m.fim-m.ini)*100)}%"></i>`}).join("");
      el.innerHTML=`<header class="fw-head"><div style="min-width:0"><h2>${esc(m.nome)}</h2><span class="muted">${esc(m.artista)}</span></div>
          <div class="chips"><span class="chip">Tom <b>${esc(m.tom)}</b></span><span class="chip"><b>${m.bpm}</b> BPM</span><span class="chip"><b>${m.sig===6?"6/8":m.sig+"/4"}</b></span></div></header>
        <div class="fw-status" id="fwStatus"></div>
        <div class="fw-grid">
          <div class="fw-card fw-sec"><span class="eyebrow">Agora</span><b id="fwSecNow">—</b><span id="fwSecNext" class="muted"></span></div>
          <div class="fw-card fw-chord"><span class="eyebrow">Acorde</span><b id="fwChord">${m.cifra.length?"—":"sem cifra"}</b><span id="fwChordNext" class="muted"></span></div>
          <div class="fw-card fw-bar"><span class="eyebrow">Compasso</span><b id="fwBar">—</b><span class="fw-beats" id="fwBeats">${Array.from({length:m.sig},(_,i)=>`<i class="${i?"":"one"}"></i>`).join("")}</span></div>
        </div>
        <div class="fw-prog"><div class="segs">${segs}</div><span id="fwHead"></span></div>
        <div class="row" style="justify-content:space-between"><span class="mono" id="fwTime">0:00</span><span class="mono muted">${fmt(m.fim-m.ini)}</span></div>
        <div class="fw-secs" id="fwSecs">${m.secoes.map((x,i)=>`<span data-i="${i}">${esc(x.n)}</span>`).join("")}</div>${repHTML(st.rep)}`;}
    if(!m)return;const p=this.posNow(st),n=this.now();
    let si=-1;m.secoes.forEach((x,i)=>{if(p>=x.t-0.02)si=i});
    if(si!==this.lastIdx){this.lastIdx=si;$("#fwSecNow").textContent=si>=0?m.secoes[si].n:"Início";
      document.querySelectorAll("#fwSecs span").forEach(x=>x.classList.toggle("on",+x.dataset.i===si))}
    const nx=st.fila&&n<st.fila.at?`Indo para ${m.secoes[st.fila.i]?m.secoes[st.fila.i].n:"—"} no próximo compasso`:st.vamp!=null?`Repetindo ${m.secoes[st.vamp]?m.secoes[st.vamp].n:""}`:(m.secoes[si+1]?"Depois: "+m.secoes[si+1].n:"Última parte");
    const nxEl=$("#fwSecNext");if(nxEl.textContent!==nx){nxEl.textContent=nx;nxEl.classList.toggle("hot",!!(st.fila&&n<st.fila.at)||st.vamp!=null)}
    if(m.cifra.length){let ci=-1;for(let i=0;i<m.cifra.length;i++){if(m.cifra[i][0]<=p+0.05)ci=i;else break}
      if(ci!==this.lastChordIdx){this.lastChordIdx=ci;$("#fwChord").textContent=ci>=0?m.cifra[ci][1]:m.cifra[0][1];$("#fwChordNext").textContent=m.cifra[ci+1]?"→ "+m.cifra[ci+1][1]:""}}
    const beat=60/m.bpmOrig,rel=p-m.off,bi=Math.floor(rel/beat+1e-6),bar=rel<0?0:Math.floor(bi/m.sig)+1,bt=rel<0?0:(bi%m.sig)+1;
    if(bi!==this.lastBeat){this.lastBeat=bi;$("#fwBar").textContent=bar?bar+" · "+bt:"—";[...$("#fwBeats").children].forEach((x,i)=>x.classList.toggle("on",!!st.tocando&&i===bt-1))}
    $("#fwHead").style.left=clamp((p-m.ini)/(m.fim-m.ini),0,1)*100+"%";$("#fwTime").textContent=fmt(p-m.ini);
    const age=(n-st.at)/1000,stEl=$("#fwStatus"),txt=!st.tocando?"Pausado pelo líder":age>25?"Sem sinal do líder há "+Math.round(age)+" s":"Tocando ao vivo";
    if(stEl.textContent!==txt){stEl.textContent=txt;stEl.className="fw-status "+(!st.tocando?"":age>25?"bad":"ok")}}
};
function repHTML(rep){if(!rep||!rep.itens||!rep.itens.length)return"";return`<div class="fw-rep"><span class="eyebrow">Repertório · ${esc(rep.nome)}</span><ol>${rep.itens.map((x,i)=>`<li class="${i===rep.i?"on":""}"><span>${esc(x.n)}</span><span class="mono muted">${esc(x.tom)}</span></li>`).join("")}</ol></div>`}
const fmtCode=c=>(c||"").replace(/^(.{3})(.{3})$/,"$1-$2");
function renderLiveChip(){const b=$("#bSala");if(!b)return;const s=Live.cur;let lbl="Sala",cls="";
  if(s&&Live.papel==="lider"){const seg=Live.presence.filter(x=>x.papel!=="lider").length;lbl=fmtCode(s.codigo)+(seg?" · "+seg+" na sala":"");cls=E.cur&&E.cur.playing?"live":""}
  else if(s){lbl="Acompanhar";cls=s.estado&&s.estado.tocando&&(Live.now()-s.estado.at)<25000?"live":""}
  b.className="sala-btn "+cls;b.querySelector("span").textContent=lbl}
function renderLive(){renderLiveChip();if(!$("#sala").hidden)salaHTML()}
function openSala(){$("#sala").hidden=false;Live.msg="";if(Live.papel==="lider")Live.loadMembros();salaHTML()}
function closeSala(){$("#sala").hidden=true}
function salaHTML(){const el=$("#salaDlg"),s=Live.cur,msg=Live.msg?`<p class="help" style="margin:0;color:var(--accent)" role="status">${esc(Live.msg)}</p>`:"";
  const head=`<button class="btn-ghost x" data-sl="close" aria-label="Fechar">✕</button><span class="eyebrow">Sala do ministério</span>`;
  if(!Sync.user){el.innerHTML=`${head}<h2>Toque junto com a equipe</h2><p class="muted" style="margin:0">O líder cria a sala e passa um código. Quem entra acompanha ao vivo, no próprio celular, a música, a seção, o compasso e o acorde que o líder está tocando.</p>
    <div class="row"><button class="btn-primary" data-sl="conta-criar">Criar conta</button><button data-sl="conta-entrar">Já tenho conta</button></div><p class="help" style="margin:0">É grátis. Só precisa de e-mail e senha.</p>`;return}
  const others=Live.salas.length>1?`<select id="salaSel" aria-label="Escolher sala">${Live.salas.map(x=>`<option value="${x.id}"${s&&x.id===s.id?" selected":""}>${esc(x.nome)}${x.lider===Sync.uid?" (líder)":""}</option>`).join("")}</select>`:"";
  const joinForm=`<form class="row" data-sl="entrar"><input type="text" id="salaCod" placeholder="Código da sala (ex.: K7M-42P)" maxlength="8" autocapitalize="characters" style="flex:1;font-family:var(--f-mono);letter-spacing:.12em;text-transform:uppercase"><button class="btn-primary">Entrar</button></form>`;
  const createForm=`<form class="row" data-sl="criar"><input type="text" id="salaNome" placeholder="Nome do ministério (ex.: Louvor IEQ Vila Real)" maxlength="80" style="flex:1"><button>Criar sala</button></form>`;
  if(!s){el.innerHTML=`${head}<h2>Sala do ministério</h2>
    <div class="sl-opt"><b>Sou da equipe</b><span class="muted">Digite o código que o líder passou.</span>${joinForm}</div>
    <div class="sl-opt"><b>Sou o líder</b><span class="muted">Crie a sala e passe o código para a equipe. Ela vale para todos os cultos.</span>${createForm}</div>${msg}`;return}
  if(Live.papel==="lider"){const online=Live.presence.filter(x=>x.papel!=="lider");const share=`Entre na sala "${s.nome}" no DDS MultiTrack para acompanhar o louvor ao vivo.\nCódigo: ${fmtCode(s.codigo)}\nhttps://www.ddsinovacao.com.br/multitrack/#sala-${s.codigo}`;
    el.innerHTML=`${head}<h2>${esc(s.nome)}</h2>${others}
      <div class="sl-code"><span class="eyebrow">Código da sala</span><b class="mono">${esc(fmtCode(s.codigo))}</b>
        <div class="row" style="justify-content:center"><button class="btn-primary" data-sl="copiar">Copiar código</button><a class="wa" href="https://wa.me/?text=${encodeURIComponent(share)}" target="_blank" rel="noopener">Enviar no WhatsApp</a></div></div>
      <label class="row help"><input type="checkbox" id="slTx"${Live.transmit?" checked":""}> Transmitir ao vivo o que eu tocar</label>
      <div class="group"><h3>Na sala agora<span class="grow"></span><span class="mono" style="letter-spacing:0">${online.length}</span></h3>
        ${online.length?online.map(x=>`<div class="mem"><span class="avatar">${esc((x.nome||"?")[0].toUpperCase())}</span><span><b>${esc(x.nome||"Sem nome")}</b><span class="muted">${x.seguindo?"acompanhando ao vivo":"com o app aberto"}</span></span><i class="sdot ok"></i></div>`).join(""):'<p class="help" style="margin:0">Ninguém conectado agora.</p>'}</div>
      <div class="group"><h3>Equipe<span class="grow"></span><span class="mono" style="letter-spacing:0">${Live.membros.length}</span></h3>
        ${Live.membros.map(x=>`<div class="mem"><span class="avatar">${esc((x.nome||"?")[0].toUpperCase())}</span><span><b>${esc(x.nome||"Sem nome")}</b><span class="muted">entrou em ${new Date(x.entrou_em).toLocaleDateString("pt-BR")}</span></span>
          <button class="btn-danger${Live.confirm===x.usuario?" armed":""}" data-sl="rm" data-u="${x.usuario}">${Live.confirm===x.usuario?"Remover?":"✕"}</button></div>`).join("")||'<p class="help" style="margin:0">Ninguém entrou ainda. Passe o código.</p>'}</div>
      <div class="row" style="justify-content:space-between"><button class="btn-ghost" data-sl="novo">Gerar novo código</button><button class="btn-danger${Live.confirm==="sala"?" armed":""}" data-sl="excluir">${Live.confirm==="sala"?"Confirmar: excluir a sala":"Excluir sala"}</button></div>
      <details class="sl-more"><summary>Entrar em outra sala</summary>${joinForm}</details>${msg}`;return}
  const st=s.estado||{},liderOn=Live.presence.some(x=>x.papel==="lider")||(st.at&&Live.now()-st.at<35000);
  el.innerHTML=`${head}<h2>${esc(s.nome)}</h2>${others}
    <div class="callout" style="background:transparent"><i class="sdot ${liderOn?"ok":""}"></i><span style="flex:1"><b>Líder: ${esc(st.lider||s.lider_nome||"—")}</b><br><span class="muted">${liderOn?(st.tocando&&st.musica?"Tocando "+esc(st.musica.nome):"Conectado"):"Desconectado no momento"}</span></span></div>
    <button class="btn-primary big" data-sl="seguir">Acompanhar ao vivo</button>
    <p class="help" style="margin:0">Você vê a música, a seção, o compasso e o acorde que o líder está tocando, em tempo real. Deixe a tela ligada durante o culto.</p>
    <div class="row" style="justify-content:space-between"><details class="sl-more"><summary>Entrar em outra sala</summary>${joinForm}</details><button class="btn-ghost" data-sl="sair">Sair desta sala</button></div>${msg}`}
$("#sala").addEventListener("click",e=>{if(e.target.id==="sala")return closeSala();const b=e.target.closest("[data-sl]");if(!b||b.tagName==="FORM")return;const a=b.dataset.sl;
  if(a==="close")closeSala();if(a==="conta-criar"){closeSala();openAccount("criar")}if(a==="conta-entrar"){closeSala();openAccount("entrar")}
  if(a==="seguir"){closeSala();Live.openFollow()}if(a==="sair")Live.sair();if(a==="novo")Live.novoCodigo();
  if(a==="copiar"){const c=fmtCode(Live.cur.codigo);try{navigator.clipboard.writeText(c).then(()=>toast("Código "+c+" copiado."),()=>toast("Código: "+c))}catch(err){toast("Código: "+c)}}
  if(a==="excluir"){if(Live.confirm!=="sala"){Live.confirm="sala";return salaHTML()}Live.confirm=null;Live.excluir()}
  if(a==="rm"){const u=b.dataset.u;if(Live.confirm!==u){Live.confirm=u;return salaHTML()}Live.remover(u)}});
$("#sala").addEventListener("submit",e=>{e.preventDefault();const a=e.target.dataset.sl;if(a==="entrar")Live.entrar($("#salaCod").value);if(a==="criar")Live.criar($("#salaNome").value)});
$("#sala").addEventListener("change",e=>{if(e.target.id==="salaSel"){Live.select(Live.salas.find(x=>x.id===e.target.value))}if(e.target.id==="slTx"){Live.transmit=e.target.checked;Live.lastSent=null;if(!Live.transmit&&Live.cur){const st=Object.assign({},Live.cur.estado||{},{tocando:false,at:Math.round(Live.now())});Sync.sb.from("mt_salas").update({estado:st}).eq("id",Live.cur.id)}renderLiveChip()}});
$("#fwExit").onclick=()=>Live.closeFollow();
$("#bSala").onclick=()=>{if(Live.cur&&Live.papel==="membro")return Live.openFollow();openSala()};
document.addEventListener("keydown",e=>{if(e.key==="Escape"){if(!$("#sala").hidden)closeSala();else if(Live.following)Live.closeFollow()}});
(function deepLink(){const m=/^#sala-([A-Za-z0-9]{6})$/.exec(location.hash||"");if(!m)return;Live.pendingCode=m[1].toUpperCase();try{history.replaceState(null,"",location.pathname+location.search)}catch(e){}
  setTimeout(()=>{if(Sync.uid&&Live.pendingCode){const c=Live.pendingCode;Live.pendingCode=null;Live.entrar(c)}else if(!Sync.uid){openAccount("criar");toast("Crie sua conta ou entre para acompanhar a sala.",6000)}},1800)})();

/* ================= Modo palco: tela de operação (transporte, mapa da música, mixer, repertório, pad) ================= */
const SEC_COLORS=[[/^intro/i,"#4fc3dc"],[/^verso/i,"#e3d34a"],[/^pr[eé]/i,"#f0a35e"],[/^refr/i,"#ff5f7e"],[/^ponte/i,"#b48cff"],[/^(instrumental|interl|solo)/i,"#5aa9ff"],[/^tag/i,"#9aa3b5"],[/^final/i,"#3fd0a8"]];
const secColor=n=>{for(const [r,c] of SEC_COLORS)if(r.test(n))return c;return"#8fa0b8"};
function secShort(n){const m=/^(.*?)(?:\s+(\d+))?$/.exec(n),b=m[1].toLowerCase(),k=m[2]||"";
  const map=[[/^intro/,"In"],[/^verso/,"V"],[/^pr[eé]/,"PR"],[/^refr/,"R"],[/^ponte/,"P"],[/^instrumental/,"Ins"],[/^interl/,"It"],[/^solo/,"So"],[/^tag/,"Tag"],[/^final/,"F"]];
  for(const [r,s] of map)if(r.test(b))return s+k;return n.slice(0,3)}
const PAD_KEYS=["C","D♭","D","E♭","E","F","G♭","G","A♭","A","B♭","B"];
const Stage={isOpen:false,pane:null,sig:"",cv:null,
  open(){ensureCtx();this.isOpen=true;$("#stage").hidden=false;document.body.classList.add("stage-on");if(!this.pane)this.pane=innerWidth<700?"parts":"mix";
    try{const o=screen.orientation;if(o&&o.lock&&innerWidth<700)o.lock("landscape").catch(()=>{})}catch(e){}
    this.render()},
  close(){this.isOpen=false;$("#stage").hidden=true;document.body.classList.remove("stage-on");try{screen.orientation&&screen.orientation.unlock&&screen.orientation.unlock()}catch(e){}renderAll()},
  sync(){if(this.isOpen)this.render()},
  state(){const d=E.cur,s=curSong();const ci=d&&d.song?curSectionIdx(d):-1;
    return[s&&s.id,s&&s.markers.length,s&&s.markers.map(m=>m.name).join(),ci,E.vamp,E.queued&&E.queued.idx,E.min?(E.min.entering?2:1):0,d&&d.playing,S.idx,S.settings.padOn,S.settings.padKey,this.pane,
      s&&s.tracks.map(t=>(t.mute?1:0)+""+(t.solo?1:0)).join("")].join("|")},
  render(){if(!this.isOpen)return;const s=curSong(),d=E.cur;this.sig=this.state();
    const k=s?transposeKey(s.key,s.applied.semi):"—",bpm=s?+(s.bpm*s.applied.tempo/100).toFixed(1):"—";
    $("#sgKey").textContent=k;$("#sgBpm").textContent=bpm;$("#sgName").textContent=s?s.name:"Nenhuma música";
    $("#sgVamp").classList.toggle("on",E.vamp!=null);
    const mb=$("#sgMin");mb.classList.toggle("on",!!E.min);mb.querySelector("span").textContent=E.min?(E.min.entering?"Entrando…":"Ministrando"):"Ministrar";
    $("#sgHint").textContent=E.min?(E.min.entering?"A banda entra no próximo compasso":"Toque na parte em que a banda deve entrar"):"";
    document.querySelectorAll("#stage .st-nav button").forEach(b=>b.classList.toggle("on",b.dataset.pane===this.pane));
    const pn=$("#sgPane");pn.className="st-pane p-"+this.pane;
    pn.innerHTML=this.pane==="mix"?this.mixHTML():this.pane==="set"?this.setHTML():this.pane==="pad"?this.padHTML():this.partsHTML();
    this.draw();this.time()},
  partsHTML(){const d=E.cur,s=curSong();if(!s)return'<p class="st-empty">Abra uma música.</p>';
    const dd=d&&d.song===s?d:null;const secs=dd?sectionsOf(dd):[...s.markers].sort((a,b)=>a.t-b.t).map(m=>({name:m.name}));const ci=dd?curSectionIdx(dd):-1;
    if(secs.length<2)return`<p class="st-empty">Esta música ainda não tem partes. <button data-act="org">✨ Organizar partes</button></p>`;
    return`<div class="st-parts">${secs.map((x,i)=>`<button class="sp${i===ci?" cur":""}${E.queued&&E.queued.idx===i?" queued":""}${E.vamp===i?" vamp":""}" data-sec="${i}" style="--sc:${secColor(x.name)}"><b>${esc(secShort(x.name))}</b><span>${esc(x.name)}</span></button>`).join("")}</div>`},
  mixHTML(){const s=curSong();if(!s)return'<p class="st-empty">Abra uma música.</p>';const anySolo=s.tracks.some(t=>t.solo);
    const fader=(id,v,col,label,dim)=>`<div class="fd${dim?" dim":""}" data-fd="${id}" style="--fc:${col}" role="slider" aria-label="Volume ${esc(label)}" aria-valuemin="0" aria-valuemax="125" aria-valuenow="${Math.round(v*100)}" tabindex="0"><i style="height:${Math.min(100,v/1.25*100)}%"></i></div>`;
    return`<div class="st-mix"><div class="ch mst"><span class="cn">Master</span>${fader("master",S.settings.master,"#f2f4f8","Master")}<div class="ms"><button data-act="clickt" class="${s.click.on?"on":""}" title="Click gerado pelo app">Click</button></div></div>`+
      s.tracks.map(t=>{const dim=t.mute||(anySolo&&!t.solo);const col=cv(KIND[t.kind||"other"].v);
        return`<div class="ch"><span class="cn" title="${esc(t.name)}" style="color:${col}">${esc(t.name)}</span>${fader(t.id,t.vol,col,t.name,dim)}<div class="ms"><button class="m${t.mute?" on":""}" data-tid="${t.id}" data-f="mute">M</button><button class="s${t.solo?" on":""}" data-tid="${t.id}" data-f="solo">S</button></div></div>`}).join("")+`</div>`},
  setHTML(){const set=curSet();if(!set)return'<p class="st-empty">Sem repertório.</p>';
    return`<div class="st-set"><div class="st-sethd">${esc(set.name)}</div>${set.songIds.map((id,i)=>{const x=songById(id);if(!x)return"";
      return`<button class="ss${i===S.idx?" cur":""}" data-song="${i}"><span class="n">${i===S.idx&&E.cur&&E.cur.playing?"▶":i+1}</span><span class="t"><b>${esc(x.name)}</b><small>${esc(transposeKey(x.key,x.applied.semi))} · ${+(x.bpm*x.applied.tempo/100).toFixed(1)} BPM${x.artist?" · "+esc(x.artist):""}</small></span></button>`}).join("")||'<p class="st-empty">Repertório vazio.</p>'}</div>`},
  padHTML(){const st=S.settings,p=padKeyNow(),auto=st.padKey==null;
    return`<div class="st-pad"><div class="pad-top"><button class="pw${st.padOn?" on":""}" data-act="padpow" aria-label="Ligar ou desligar o pad">⏻</button>
      <div class="pad-info"><small>Pad</small><b>${st.padOn?(p?(auto?keyName(p.i,p.minor):PAD_KEYS[p.i]):"sem tom"):"desligado"}</b><small>${auto?"segue o tom da música":"tom fixo"}</small></div>
      <button class="pa${auto?" on":""}" data-act="padauto">Tom da música</button></div>
      <div class="pad-keys">${PAD_KEYS.map((k,i)=>`<button class="${st.padOn&&p&&p.i===i?"on":""}" data-padkey="${i}">${k}</button>`).join("")}</div>
      <div class="pad-vol">${`<div class="fd" data-fd="pad" style="--fc:var(--k-pad)" role="slider" aria-label="Volume do pad" tabindex="0"><i style="height:${Math.min(100,st.padVol/1.25*100)}%"></i></div>`}</div></div>`},
  time(){const d=E.cur;const cur=d&&d.song?Math.max(0,d.pos()-d.startPos):0,tot=d&&d.song?Math.max(0,d.endPos-d.startPos):0;$("#sgTime").innerHTML=`${fmt(cur)}<small>/ ${fmt(tot)}</small>`},
  frame(){if(!this.isOpen)return;if(this.state()!==this.sig)this.render();else{this.draw();this.time()}},
  draw(){const cv0=$("#sgCv"),s=curSong(),d=E.cur;if(!cv0)return;const wrap=cv0.parentElement,W=wrap.clientWidth,H=wrap.clientHeight,dpr=devicePixelRatio||1;
    if(cv0.width!==Math.round(W*dpr)||cv0.height!==Math.round(H*dpr)){cv0.width=Math.round(W*dpr);cv0.height=Math.round(H*dpr);cv0.style.width=W+"px";cv0.style.height=H+"px"}
    const g=cv0.getContext("2d");g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,W,H);if(!s||!W)return;
    const dd=d&&d.song===s?d:null,r=dd?dd.ratio:s.applied.tempo/100,total=dd?dd.endPos:(s.trimEnd??s.duration)/r;if(!(total>0))return;
    const secs=dd?sectionsOf(dd):[...s.markers].sort((a,b)=>a.t-b.t).map((m,i,a)=>({name:m.name,start:m.t/r,end:a[i+1]?a[i+1].t/r:total}));
    const X=t=>t/total*W,pos=dd?dd.pos():0;this.blocks=[];
    /* onda da mistura (sem click e guia) */
    const tr=s.tracks.filter(t=>t.kind!=="click"&&t.kind!=="guide"&&(t.peaks||[]).length),N=Math.max(1,Math.floor(W/2)),env=new Float32Array(N);
    tr.forEach(t=>{const pk=t.peaks,P=pk.length,du=(t.dur||s.duration)/r;for(let x=0;x<N;x++){const tt=x/N*total;if(tt>du)break;env[x]=Math.max(env[x],pk[Math.min(P-1,Math.floor(tt/du*P))]||0)}});
    const top=6,bh=H-12,mid=top+bh/2;
    const list=secs.length?secs:[{name:"",start:0,end:total}];
    list.forEach((x,i)=>{const x0=X(x.start),x1=X(Math.min(x.end,total)),col=x.name?secColor(x.name):"#8fa0b8";this.blocks.push({i,x0,x1});
      g.globalAlpha=0.16;g.fillStyle=col;g.fillRect(x0,top,x1-x0,bh);g.globalAlpha=1;
      for(let px=Math.floor(x0/2);px<Math.min(N,Math.ceil(x1/2));px++){const a=Math.max(0.6,env[px]*(bh/2-4));g.globalAlpha=px*2/W*total<pos?1:0.55;g.fillStyle=col;g.fillRect(px*2,mid-a,1.5,a*2)}
      g.globalAlpha=1;g.fillStyle="rgba(10,12,17,.9)";g.fillRect(x0,top,1.5,bh);
      if(E.vamp===i||(E.queued&&E.queued.idx===i)){g.strokeStyle=E.vamp===i?"#ffb547":"#ffffff";g.lineWidth=2;g.setLineDash(E.vamp===i?[]:[5,4]);g.strokeRect(x0+1,top+1,x1-x0-2,bh-2);g.setLineDash([])}
      if(x.name&&x1-x0>16){const lb=x1-x0>90?x.name:secShort(x.name);g.font="700 13px "+cv("--f-display");const tw=Math.min(g.measureText(lb).width,x1-x0-14);
        g.fillStyle="rgba(10,12,17,.85)";g.beginPath();(g.roundRect?g.roundRect(x0+5,top+5,tw+12,22,6):g.rect(x0+5,top+5,tw+12,22));g.fill();
        g.save();g.beginPath();g.rect(x0+5,top+5,x1-x0-8,22);g.clip();g.fillStyle=col;g.textBaseline="middle";g.fillText(lb,x0+11,top+16.5);g.restore()}});
    g.save();g.beginPath();(g.roundRect?g.roundRect(0,top,W,bh,10):g.rect(0,top,W,bh));g.strokeStyle="rgba(255,255,255,.08)";g.lineWidth=1;g.stroke();g.restore();
    const px=X(Math.min(pos,total));g.fillStyle="#ff4d5e";g.fillRect(px-1,top-4,2.5,bh+8);g.beginPath();g.moveTo(px-6,top-4);g.lineTo(px+7,top-4);g.lineTo(px+.5,top+4);g.fill()},
  tapOverview(e){const r=$("#sgCv").getBoundingClientRect(),x=e.clientX-r.left;const b=(this.blocks||[]).find(b=>x>=b.x0&&x<b.x1);if(!b)return;
    const s=curSong();if(!s||s.markers.length<2){const d=E.cur;if(d&&d.song){const t=x/r.width*d.endPos;d.seek?d.playing?d.seek(t):(d.anchorPos=t):0}return}
    sectionTap(b.i)},
  setFader(el,v){const id=el.dataset.fd,s=curSong();v=clamp(v,0,1.25);el.querySelector("i").style.height=Math.min(100,v/1.25*100)+"%";el.setAttribute("aria-valuenow",Math.round(v*100));
    if(id==="master"){S.settings.master=v;applyGlobalMix();saveMeta()}else if(id==="pad"){S.settings.padVol=v;applyGlobalMix();saveMeta()}
    else{const t=s&&s.tracks.find(x=>x.id===id);if(t){t.vol=v;applyTrackMix(E.cur);saveSong(s,{local:true})}}},
  getFader(el){const id=el.dataset.fd,s=curSong();if(id==="master")return S.settings.master;if(id==="pad")return S.settings.padVol;const t=s&&s.tracks.find(x=>x.id===id);return t?t.vol:0},
  fader(el,e){const s=curSong(),r=el.getBoundingClientRect(),at=ev=>this.setFader(el,(1-(ev.clientY-r.top)/r.height)*1.25);
    const now=Date.now();if(now-(el._t||0)<300){el._t=0;return this.setFader(el,el.dataset.fd==="master"?0.9:el.dataset.fd==="pad"?0.45:0.85)}el._t=now;
    at(e);try{el.setPointerCapture(e.pointerId)}catch(x){}const mv=ev=>at(ev),up=()=>{el.removeEventListener("pointermove",mv);el.removeEventListener("pointerup",up);el.removeEventListener("pointercancel",up);if(s)saveSong(s)};
    el.addEventListener("pointermove",mv);el.addEventListener("pointerup",up);el.addEventListener("pointercancel",up)},
  click(e){const b=e.target.closest("button");if(!b)return;const s=curSong();
    if(b.dataset.pane){this.pane=b.dataset.pane;return this.render()}
    if(b.dataset.sec!=null)return sectionTap(+b.dataset.sec);
    if(b.dataset.song!=null){const set=curSet(),i=+b.dataset.song;if(i===S.idx)return;const was=E.cur&&E.cur.playing;if(was&&!E.min){crossfadeTo(i,2)}else{pause();loadSong(set.songIds[i],{idx:i,play:false})}return}
    if(b.dataset.padkey!=null){const k=+b.dataset.padkey;ensureCtx();if(S.settings.padOn&&S.settings.padKey===k){S.settings.padOn=false}else{S.settings.padKey=k;S.settings.padOn=true}padFollow(true);saveMeta();renderTransport();return this.render()}
    const a=b.dataset.act;
    if(a==="padpow"){ensureCtx();S.settings.padOn=!S.settings.padOn;padFollow(true);saveMeta();renderTransport();return this.render()}
    if(a==="padauto"){S.settings.padKey=null;ensureCtx();padFollow(true);saveMeta();return this.render()}
    if(a==="org")return organizeSections(s);
    if(a==="clickt"&&s){ensureCtx();s.click.on=!s.click.on;if(!s.click.on)cancelClicks();saveSong(s);return this.render()}
    if(b.dataset.tid&&s){const tr=s.tracks.find(x=>x.id===b.dataset.tid);if(!tr)return;tr[b.dataset.f]=!tr[b.dataset.f];saveSong(s,{local:true});applyTrackMix(E.cur);renderArr();return this.render()}}};
$("#sgExit").onclick=()=>Stage.close();
$("#sgPlay").onclick=()=>{ensureCtx();const d=E.cur;if(d&&d.playing)pause();else startPlay()};
$("#sgStop").onclick=()=>{ensureCtx();stopToStart()};
$("#sgPrev").onclick=()=>{const d=E.cur;if(d&&d.song&&d.pos()-d.startPos>3){d.seek(d.startPos);return}goNext(-1)};
$("#sgNext").onclick=()=>goNext(1);
$("#sgVamp").onclick=()=>toggleVamp(E.vamp);
$("#sgMin").onclick=()=>toggleMin();
$("#stage").addEventListener("click",e=>{if(e.target.closest(".st-top"))return;Stage.click(e)});
$("#sgCv").addEventListener("click",e=>Stage.tapOverview(e));
$("#sgCv").addEventListener("dblclick",e=>{const r=$("#sgCv").getBoundingClientRect(),b=(Stage.blocks||[]).find(b=>e.clientX-r.left>=b.x0&&e.clientX-r.left<b.x1);if(b)toggleVamp(b.i)});
$("#sgPane").addEventListener("pointerdown",e=>{const f=e.target.closest(".fd");if(f){e.preventDefault();Stage.fader(f,e)}});
$("#sgPane").addEventListener("keydown",e=>{const f=e.target.closest(".fd");if(!f||!/Arrow(Up|Down)/.test(e.key))return;e.preventDefault();e.stopPropagation();Stage.setFader(f,Stage.getFader(f)+(e.key==="ArrowUp"?0.05:-0.05))});
document.addEventListener("keydown",e=>{if(Stage.isOpen&&e.key==="Escape")Stage.close()});
addEventListener("resize",()=>{if(Stage.isOpen)Stage.draw()});
(function stageLoop(){Stage.frame();requestAnimationFrame(stageLoop)})();
