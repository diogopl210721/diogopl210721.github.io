/* DDS MultiTrack — mixer de stems em AudioWorklet. Áudio em Int16 (metade da memória), eventos com precisão de amostra. */
class DDSMixer extends AudioWorkletProcessor{
  constructor(){super();this.decks=[this.mk(),this.mk()];this.port.onmessage=e=>this.msg(e.data);this.dgBuf=new Float32Array(128)}
  mk(){return{stems:[],playing:false,pos:0,events:[],dg:1,dgStep:0,dgLeft:0,dgTarget:1}}
  msg(m){const d=this.decks[m.deck];if(!d)return;
    switch(m.type){
      case"reset":d.stems=[];d.playing=false;d.events=[];d.pos=0;d.dg=1;d.dgLeft=0;break;
      case"stem":{if(!m.buf)break;const g=m.g||[0,0,0,0],data=new Int16Array(m.buf);d.stems.push({id:m.id,ch:m.ch,len:Math.min(m.len,Math.floor(data.length/m.ch)),data,c:g.slice(),t:g.slice()});break}
      case"gains":for(const s of d.stems){const g=m.g[s.id];if(g)s.t=g.slice()}break;
      case"clear":d.events=[];break;
      default:d.events.push(m);d.events.sort((a,b)=>a.at-b.at)}}
  apply(d,ev){
    if(ev.type==="start"||ev.type==="jump"){d.playing=true;d.pos=ev.pos}
    else if(ev.type==="stop"){d.playing=false}
    else if(ev.type==="fade"){if(ev.from!=null)d.dg=ev.from;d.dgTarget=ev.target;d.dgLeft=Math.max(1,ev.frames|0);d.dgStep=(ev.target-d.dg)/d.dgLeft}}
  render(d,L,R,a,b){const cnt=b-a;if(cnt<=0||!d.playing)return;const dg=this.dgBuf;
    for(let i=0;i<cnt;i++){if(d.dgLeft>0){d.dg+=d.dgStep;d.dgLeft--;if(d.dgLeft===0)d.dg=d.dgTarget}dg[i]=d.dg}
    const p0=d.pos,k=0.0015;
    for(const s of d.stems){const c=s.c,t=s.t;let ll=c[0],rl=c[1],lr=c[2],rr=c[3];
      if(Math.abs(ll)+Math.abs(rl)+Math.abs(lr)+Math.abs(rr)<1e-5&&Math.abs(t[0])+Math.abs(t[1])+Math.abs(t[2])+Math.abs(t[3])<1e-5){c[0]=t[0];c[1]=t[1];c[2]=t[2];c[3]=t[3];continue}
      const data=s.data,len=s.len;
      if(s.ch===2){for(let i=0;i<cnt;i++){ll+=(t[0]-ll)*k;rl+=(t[1]-rl)*k;lr+=(t[2]-lr)*k;rr+=(t[3]-rr)*k;const f=p0+i;if(f>=len||f<0)continue;const g=dg[i]/32768,l=data[2*f]*g,r=data[2*f+1]*g;
          L[a+i]+=l*ll+r*rl;R[a+i]+=l*lr+r*rr}}
      else{for(let i=0;i<cnt;i++){ll+=(t[0]-ll)*k;lr+=(t[2]-lr)*k;const f=p0+i;if(f>=len||f<0)continue;const v=data[f]*dg[i]/32768;L[a+i]+=v*ll;R[a+i]+=v*lr}}
      c[0]=ll;c[1]=rl;c[2]=lr;c[3]=rr}
    d.pos=p0+cnt}
  process(inputs,outputs){const out=outputs[0];const L=out[0],R=out[1]||out[0];const n=L.length;const t0=currentFrame;
    for(const d of this.decks){let o=0;
      while(o<n){const ev=d.events[0];
        if(ev&&ev.at<t0+n){const eo=Math.max(o,ev.at-t0);if(eo>o){this.render(d,L,R,o,eo);o=eo;continue}this.apply(d,ev);d.events.shift();continue}
        this.render(d,L,R,o,n);o=n}}
    return true}
}
registerProcessor("dds-mixer",DDSMixer);
