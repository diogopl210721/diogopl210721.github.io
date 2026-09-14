import * as THREE from './vendor/three.module.js';

const host = document.querySelector('#lens-stage');
const section = document.querySelector('.experience');
const toggle = document.querySelector('.motion-toggle');
toggle.hidden=false;
const panels = [...document.querySelectorAll('.scene-panel')];
const dots = [...document.querySelectorAll('.scene-progress button')];
const preference = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (n,a=0,b=1) => Math.min(b,Math.max(a,n));
const smooth = (a,b,x) => { const t=clamp((x-a)/(b-a)); return t*t*(3-2*t); };
let disabled = preference.matches;
let renderer, world, camera, frame = 0, target = 0, progress = 0, mobile = false;
let openingLens, closingLens, stars, site, system, designs, lastTime=0, visible=true;
let pointerX=0, pointerY=0, viewX=0, viewY=0, disposed=false;
const dynamicGroups=[];
const setStatic = value => {
  disabled=value;
  document.body.classList.toggle('motion-off',value);
  toggle.setAttribute('aria-pressed',String(value));
  toggle.textContent=value?'Ativar experiência 3D':'Reduzir movimento';
  if(value){ cancelAnimationFrame(frame); frame=0; panels.forEach((panel,i)=>{panel.inert=i!==0;}); }
  else if(renderer){ measure(); requestFrame(); }
};
toggle.addEventListener('click',()=>{
  const top=section.offsetTop;
  if(disabled&&!renderer) init();
  setStatic(!disabled);
  window.scrollTo({top,behavior:'instant'});
  target=progress=0;
});
preference.addEventListener('change',e=>{if(!e.matches&&!renderer)init();setStatic(e.matches);});
dots.forEach(dot=>dot.addEventListener('click',()=>{
  const range=section.offsetHeight-host.clientHeight;
  window.scrollTo({top:section.offsetTop+range*Number(dot.dataset.progress),behavior:'instant'});
}));

function material(color, metalness=.4, roughness=.28, extra={}){
  return new THREE.MeshStandardMaterial({color,metalness,roughness,...extra});
}
function mesh(geometry,mat,parent,x=0,y=0,z=0){
  const object=new THREE.Mesh(geometry,mat);object.position.set(x,y,z);parent.add(object);return object;
}
function rainbowMaterial(){
  return new THREE.MeshStandardMaterial({vertexColors:true,metalness:.45,roughness:.22,emissive:0x14355d,emissiveIntensity:.25});
}
function coloredRing(radius,tube){
  const geometry=new THREE.TorusGeometry(radius,tube,16,100);
  const position=geometry.attributes.position;const colors=[];const color=new THREE.Color();
  for(let i=0;i<position.count;i++){
    const angle=Math.atan2(position.getY(i),position.getX(i));
    color.setHSL(((angle/(Math.PI*2))+.7+1)%1,.82,.57);
    colors.push(color.r,color.g,color.b);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return geometry;
}
function makeLens(){
  const root=new THREE.Group();const shell=new THREE.Group();root.add(shell);
  const silver=material(0xbacbdf,.76,.21),dark=material(0x152036,.7,.28);
  const cyan=material(0x319bff,.45,.25,{emissive:0x0760bf,emissiveIntensity:.8});
  const rings=[];
  [[1.78,.13,-.2,silver],[1.6,.15,-.06,dark],[1.42,.08,.07,silver],[1.23,.12,.2,cyan],[.99,.045,.28,dark]].forEach(([r,t,z,mat])=>{
    const ring=mesh(new THREE.TorusGeometry(r,t,18,100),mat,shell,0,0,z);ring.userData.baseZ=z;rings.push(ring);
  });
  const rainbow=mesh(coloredRing(1.12,.10),rainbowMaterial(),shell,0,0,.3);rings.push(rainbow);rainbow.userData.baseZ=.3;
  const identityTexture=new THREE.TextureLoader().load('./lente-original.png');identityTexture.colorSpace=THREE.SRGBColorSpace;
  const identity=mesh(new THREE.PlaneGeometry(7.45,4.19),new THREE.MeshBasicMaterial({map:identityTexture,transparent:true,depthWrite:false,toneMapped:false}),shell,0,0,.43);
  const barrel=mesh(new THREE.CylinderGeometry(1.7,1.7,.48,96,1,true),dark,shell,0,0,-.36);barrel.rotation.x=Math.PI/2;
  mesh(new THREE.RingGeometry(1.01,1.77,96),dark,shell,0,0,.24);
  for(let i=0;i<64;i++){
    const angle=i/64*Math.PI*2;
    const notch=mesh(new THREE.BoxGeometry(.028,.07,.26),silver,shell,Math.cos(angle)*1.76,Math.sin(angle)*1.76,-.39);notch.rotation.z=angle-Math.PI/2;
  }
  const iris=new THREE.Group();iris.position.z=.2;shell.add(iris);const blades=[];
  for(let i=0;i<8;i++){
    const shape=new THREE.Shape();shape.moveTo(-.05,-.04);shape.lineTo(1.13,-.04);shape.absarc(0,0,1.13,0,Math.PI*.31,false);shape.lineTo(-.05,-.04);
    const geo=new THREE.ExtrudeGeometry(shape,{depth:.018,bevelEnabled:false,curveSegments:14});
    const blade=mesh(geo,material(new THREE.Color().setHSL(.55+i*.011,.62,.15+i*.016),.72,.24),iris);
    blade.rotation.z=i*Math.PI/4;blade.userData.angle=i*Math.PI/4;blades.push(blade);
  }
  // Open-ended construction leaves a real central aperture for the camera passage.
  const halo=mesh(new THREE.TorusGeometry(2.04,.008,6,120),new THREE.MeshBasicMaterial({color:0x54c7ff,transparent:true,opacity:.43}),root);
  const halo2=mesh(new THREE.TorusGeometry(2.25,.005,6,120),new THREE.MeshBasicMaterial({color:0x4082d4,transparent:true,opacity:.27}),root);halo2.rotation.x=.35;
  root.userData={shell,rings,iris,blades,halo,halo2,identity};return root;
}
function round(ctx,x,y,w,h,r,fill){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();}
function text(ctx,value,x,y,size=24,color='#eaf5ff',weight=400){ctx.fillStyle=color;ctx.font=`${weight} ${size}px Arial, sans-serif`;ctx.fillText(value,x,y);}
function texture(kind){
  const c=document.createElement('canvas');c.width=1024;c.height=680;const ctx=c.getContext('2d');
  round(ctx,0,0,1024,680,26,'#0b172c');
  if(kind==='web'){
    round(ctx,0,0,1024,50,20,'#192943');
    ['#79c9ff','#476889','#476889'].forEach((color,i)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(26+i*20,25,5,0,Math.PI*2);ctx.fill();});
    text(ctx,'seu-negocio.com.br',360,33,15,'#98b6d6');text(ctx,'SUA MARCA',55,114,24,'#ffffff',700);text(ctx,'SOBRE     SERVIÇOS     CONTATO',650,111,13,'#8faeca');
    const gradient=ctx.createLinearGradient(0,0,1024,680);gradient.addColorStop(0,'#143254');gradient.addColorStop(1,'#091123');ctx.fillStyle=gradient;ctx.fillRect(0,150,1024,530);
    text(ctx,'Seu próximo',60,280,69,'#f4f8ff',700);text(ctx,'grande passo.',60,357,69,'#6edaff',700);
    text(ctx,'Uma presença digital à altura da sua ideia.',65,424,22,'#afc5dc');round(ctx,60,473,275,60,10,'#52baff');text(ctx,'Vamos conversar  ↗',88,513,22,'#071629',700);
    ctx.strokeStyle='#4988c0';ctx.lineWidth=2;for(let i=0;i<5;i++){ctx.beginPath();ctx.ellipse(822,370,110+i*16,130+i*10,-.3,0,Math.PI*2);ctx.stroke();}
    text(ctx,'SITE / CONCEITO ILUSTRATIVO',60,627,13,'#6d92b4');
  }else if(kind==='system'){
    round(ctx,0,0,90,680,20,'#102740');text(ctx,'d.',25,65,44,'#78d9ff',700);for(let i=0;i<6;i++)round(ctx,28,110+i*65,30,27,5,i===0?'#55b9ff':'#284460');
    text(ctx,'Tudo no lugar.',135,86,38,'#f0f8ff',700);text(ctx,'Uma rotina mais simples começa aqui.',138,126,19,'#8dacc8');
    [['TAREFAS','Organizadas'],['PROCESSOS','Conectados'],['SEU TEMPO','Valorizado']].forEach((a,i)=>{round(ctx,135+i*275,171,252,130,12,'#142b44');text(ctx,a[0],155+i*275,210,13,'#84a6c5');text(ctx,a[1],155+i*275,262,27,'#80d5ff',700);});
    round(ctx,135,330,800,204,12,'#101f36');text(ctx,'Visão geral do seu negócio',160,370,19,'#b3cce3');
    for(let i=0;i<9;i++){const h=30+Math.sin(i*.7)*18+i*8;round(ctx,170+i*80,508-h,43,h,5,i===8?'#63dcff':'#2b6fa9');}
    text(ctx,'✓ Informações em um só lugar',150,581,20,'#bddcf2');text(ctx,'✓ Menos tarefas repetitivas',150,625,20,'#bddcf2');
  }else{
    const blue=kind==='poster';round(ctx,0,0,1024,680,20,blue?'#266beb':'#d2edff');
    text(ctx,blue?'SUA MARCA EM MOVIMENTO':'DESIGN + CONTEÚDO',65,85,20,blue?'#c6e5ff':'#174c79',700);
    text(ctx,blue?'Ideias que':'Não é só',60,250,99,blue?'#fff':'#0a2044',700);text(ctx,blue?'ganham':'aparecer.',60,355,99,blue?'#fff':'#0a2044',700);text(ctx,blue?'o mundo.':'É conectar.',60,465,99,blue?'#86eaff':'#2873c7',700);
    text(ctx,blue?'ARTES • BANNERS • FOLDERS':'COPY • REDES SOCIAIS • IDENTIDADE',65,615,22,blue?'#c3e7ff':'#225d8d');
  }
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),4);return tex;
}
function screen(kind,width=4.7,height=3.12){
  const group=new THREE.Group();const body=mesh(new THREE.BoxGeometry(width+.13,height+.13,.12),material(0x193759,.65,.26),group,0,0,-.075);
  mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture(kind),toneMapped:false}),group,0,0,.005);
  const edge=new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry),new THREE.LineBasicMaterial({color:0x599fd5,transparent:true,opacity:.5}));edge.position.copy(body.position);group.add(edge);return group;
}
function makeSite(){
  const root=new THREE.Group();const main=screen('web');root.add(main);main.rotation.y=-.23;main.rotation.x=.08;
  const back=screen('web');back.scale.setScalar(.9);back.position.set(.27,.22,-.55);back.rotation.copy(main.rotation);root.add(back);
  const phone=screen('web',1.05,1.75);phone.position.set(1.98,-.77,.75);phone.rotation.y=-.28;phone.rotation.z=-.06;root.add(phone);
  dynamicGroups.push({root,main,back,phone});return root;
}
function makeSystem(){const root=new THREE.Group();const main=screen('system');main.rotation.y=.18;main.rotation.z=.025;root.add(main);
  const accent=material(0x329efc,.4,.25,{emissive:0x126abf,emissiveIntensity:.4});
  for(let i=0;i<5;i++){const h=.3+i*.18;const bar=mesh(new THREE.BoxGeometry(.19,h,.3),accent,root,-1.45+i*.38,-1.75+h/2,.65);bar.userData.h=h;}
  dynamicGroups.push({root,main});return root;}
function makeDesigns(){const root=new THREE.Group();const a=screen('poster',3.2,2.13);a.position.set(-.7,.35,.1);a.rotation.set(.06,.22,-.11);root.add(a);
  const b=screen('social',3.2,2.13);b.position.set(.95,-.7,.8);b.rotation.set(-.05,-.22,.1);root.add(b);
  dynamicGroups.push({root,main:a,back:b});return root;}
function init(){
  if(renderer)return;
  try{
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.55;
    host.appendChild(renderer.domElement);world=new THREE.Scene();world.fog=new THREE.FogExp2(0x040a16,.017);camera=new THREE.PerspectiveCamera(43,1,.05,140);
    world.add(new THREE.HemisphereLight(0xafdfff,0x142045,3));
    const key=new THREE.DirectionalLight(0xd1edff,5);key.position.set(-3,5,8);world.add(key);
    const rim=new THREE.DirectionalLight(0x248fff,5);rim.position.set(4,-1,-8);world.add(rim);
    const fill=new THREE.DirectionalLight(0xd2bdff,2);fill.position.set(-5,-3,2);world.add(fill);
    openingLens=makeLens();closingLens=makeLens();closingLens.position.z=-76;world.add(openingLens,closingLens);
    site=makeSite();site.position.z=-19;system=makeSystem();system.position.z=-38;designs=makeDesigns();designs.position.z=-57;world.add(site,system,designs);
    const points=[];let seed=41;const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
    for(let i=0;i<550;i++)points.push((random()-.5)*28,(random()-.5)*18,6-random()*100);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    stars=new THREE.Points(geo,new THREE.PointsMaterial({color:0x72bfff,size:.024,transparent:true,opacity:.55,sizeAttenuation:true,depthWrite:false}));world.add(stars);
    renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();setStatic(true);toggle.textContent='Modo leve ativado';toggle.disabled=true;});
    document.body.classList.add('immersive-ready');measure();requestFrame();
  }catch(error){
    if(renderer){renderer.dispose();renderer.domElement.remove();renderer=null;}
    document.body.classList.remove('immersive-ready');setStatic(true);toggle.hidden=true;
    console.warn('DDS: experiência leve disponível; 3D indisponível.');
  }
}
function measure(){
  if(!renderer)return;const w=host.clientWidth,h=host.clientHeight;mobile=w<701;
  renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.35:1.75));renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=mobile?48:43;camera.updateProjectionMatrix();
  const scale=mobile?.64:1;openingLens.scale.setScalar(scale);closingLens.scale.setScalar(scale);
  [site,system,designs].forEach(o=>o.scale.setScalar(mobile?.52:1));
  updateTarget();requestFrame();
}
function updateTarget(){
  const rect=section.getBoundingClientRect();const range=section.offsetHeight-host.clientHeight;
  target=range>0?clamp(-rect.top/range):0;
  visible=rect.bottom>0&&rect.top<innerHeight;
}
function pathAt(p){
  const stops=[[0,9],[.13,6],[.24,-7],[.32,-10],[.4,-10],[.52,-29],[.59,-29],[.71,-48],[.78,-48],[.9,-67],[1,-67]];
  for(let i=1;i<stops.length;i++){if(p<=stops[i][0]){const [a,z1]=stops[i-1],[b,z2]=stops[i];return THREE.MathUtils.lerp(z1,z2,smooth(a,b,p));}}return -67;
}
function animateLens(lens,open,explode,time,ending=false){
  const data=lens.userData;
  data.shell.rotation.z=(ending?-.12:.12)+progress*.8;
  data.shell.rotation.y=(ending?-.22:.20)*(1-smooth(.03,.15,progress));
  data.rings.forEach((ring,i)=>ring.position.z=ring.userData.baseZ+(i-2)*explode*.09);
  data.blades.forEach(blade=>{const a=blade.userData.angle;blade.position.set(Math.cos(a+.3)*open*1.34,Math.sin(a+.3)*open*1.34,.005*Math.sin(a));blade.rotation.z=a+open*.65;blade.scale.setScalar(1-open*.8);});
  data.identity.material.opacity=ending?smooth(.965,1,progress):1-smooth(.015,.065,progress);
  data.iris.rotation.z=open*.5;data.halo.rotation.z=time*.03;data.halo2.rotation.z=-time*.018;
}
function updatePanels(p){
  const spans=[[0,.07,.15],[.23,.28,.41],[.46,.51,.6],[.65,.7,.79],[.85,.91,1.2]];
  let active=p<.23?0:p<.46?1:p<.65?2:p<.85?3:4,best=0;
  panels.forEach((panel,i)=>{const [start,full,end]=spans[i];const enter=i===0?1:smooth(start,full,p);const leave=1-smooth(end-.045,end,p);const alpha=enter*leave;
    if(alpha>best){best=alpha;active=i;}
    panel.style.opacity=alpha.toFixed(3);panel.style.visibility=alpha>.015?'visible':'hidden';panel.style.pointerEvents=alpha>.65?'auto':'none';panel.inert=alpha<.65;
    const shift=(1-enter)*24-(1-leave)*18;
    panel.style.transform=mobile?`translateY(${shift}px)`:`translateY(calc(-46% + ${shift}px))`;
  });
  dots.forEach((dot,i)=>{dot.classList.toggle('is-past',i<=active);if(i===active)dot.setAttribute('aria-current','step');else dot.removeAttribute('aria-current');});document.querySelector('.scene-counter').textContent=`0${active+1} / 05`;
}
function render(now){
  frame=0;if(disabled||!renderer||document.hidden||!visible)return;
  const dt=Math.min((now-lastTime)/1000||.016,.05);lastTime=now;
  progress+= (target-progress)*(1-Math.exp(-dt*12));if(Math.abs(target-progress)<.00003)progress=target;
  const time=now/1000;viewX+=(pointerX-viewX)*.035;viewY+=(pointerY-viewY)*.035;
  camera.position.set(viewX*(mobile?0:.12),viewY*(mobile?0:.09),pathAt(progress));camera.rotation.set(0,0,0);
  const x=mobile?0:2.75,y=mobile?-2.45:-.05;
  openingLens.position.x=x*(1-smooth(.045,.15,progress));openingLens.position.y=y*(1-smooth(.045,.15,progress));
  openingLens.visible=progress<.3;closingLens.position.x=x;closingLens.position.y=y;closingLens.visible=progress>.75;
  site.position.x=x;site.position.y=y;system.position.x=x;system.position.y=y;designs.position.x=x;designs.position.y=y;
  site.visible=progress>.17&&progress<.46;system.visible=progress>.38&&progress<.65;designs.visible=progress>.58&&progress<.85;
  animateLens(openingLens,smooth(.035,.16,progress),Math.sin(clamp(progress/.2)*Math.PI),time);
  animateLens(closingLens,1-smooth(.85,.99,progress),0,time,true);
  dynamicGroups.forEach(({root},i)=>{root.rotation.y=Math.sin(time*.22+i)*.035;root.rotation.x=Math.cos(time*.19+i)*.018;});
  updatePanels(progress);renderer.render(world,camera);
  // Stop animation outside the immersive stage or in a background tab.
  if(!disposed)frame=requestAnimationFrame(render);
}
function requestFrame(){if(!frame&&!disabled&&renderer&&visible&&!document.hidden&&!disposed)frame=requestAnimationFrame(render);}
addEventListener('scroll',()=>{updateTarget();requestFrame();},{passive:true});
addEventListener('resize',measure,{passive:true});
host.parentElement.addEventListener('pointermove',event=>{if(event.pointerType==='mouse'){pointerX=(event.clientX/innerWidth-.5)*2;pointerY=-(event.clientY/innerHeight-.5)*2;}},{passive:true});
host.parentElement.addEventListener('pointerleave',()=>{pointerX=pointerY=0;});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else{lastTime=performance.now();requestFrame();}});
addEventListener('pagehide',()=>{cancelAnimationFrame(frame);frame=0;});
addEventListener('pageshow',()=>{measure();requestFrame();});
setStatic(disabled);
if(!disabled)init();
