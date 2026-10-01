import * as T from './vendor/three.js';

// Shared geometry keeps each little companion inexpensive to draw on a phone.
const sphere=new T.SphereGeometry(1,32,24);
export function buildPet(id,stage=0){
  const root=new T.Group(),head=new T.Group(),tail=new T.Group(),ears=[];
  const colors={bunny:'#fff1e4',cat:'#c9b9de',dog:'#deb58c',monkey:'#b88771',phoenix:'#f2adbf'};
  const coat=colors[id],cream='#fff0d9',pink='#ed93ad',dark='#483740';
  const materials=new Map();
  const material=color=>{if(!materials.has(color))materials.set(color,new T.MeshStandardMaterial({color,roughness:.72}));return materials.get(color);};
  function ball(parent,color,x,y,z,sx,sy,sz){const m=new T.Mesh(sphere,material(color));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  function tube(parent,color,points,radius){const path=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));const m=new T.Mesh(new T.TubeGeometry(path,30,radius,10,false),material(color));m.castShadow=true;parent.add(m);return m;}
  const bodyY=stage===0?.61:stage===1?.77:.87,headY=stage===0?1.28:stage===1?1.62:1.82;
  ball(root,coat,0,bodyY,0,.53,bodyY,.43);
  ball(root,cream,0,bodyY,.365,.35,bodyY*.65,.12);
  for(const side of [-1,1]){ball(root,id==='phoenix'?'#efbf80':coat,side*.35,.18,.26,.26,.18,.34);if(id!=='phoenix'){const arm=ball(root,coat,side*.48,bodyY,.17,.16,stage===0?.27:.38,.19);arm.rotation.z=side*.25;}}
  head.position.set(0,headY,.12);root.add(head);
  ball(head,coat,0,0,0,stage===0?.68:.62,.57,.52);
  if(id==='monkey'){for(const side of [-1,1]){ball(head,coat,side*.67,0,0,.27,.29,.16);ball(head,pink,side*.68,0,.13,.16,.18,.05);ball(head,cream,side*.23,.02,.34,.32,.36,.21);}ball(head,cream,0,-.22,.38,.4,.24,.18);}
  else if(id==='phoenix')ball(head,cream,0,-.1,.42,.4,.36,.14);
  else {for(const side of [-1,1])ball(head,cream,side*.13,-.18,.46,.2,.15,.13);}
  for(const side of [-1,1]){
    ball(head,dark,side*.25,.055,id==='monkey'?.565:.482,.067,.091,.053);ball(head,'#ffffff',side*.25-.018,.087,id==='monkey'?.610:.525,.022,.026,.013);
    ball(head,pink,side*.4,-.14,id==='monkey'?.516:.427,.098,.057,.025);
  }
  if(id==='phoenix'){const beak=new T.Mesh(new T.ConeGeometry(.12,.23,24),material('#efb960'));beak.rotation.x=Math.PI/2;beak.position.set(0,-.14,.65);head.add(beak);}
  else ball(head,id==='bunny'?pink:dark,0,-.17,.61,.067,.046,.045);
  tube(head,dark,[[-.085,-.265,.53],[0,-.3,.56],[.085,-.265,.53]],.012);
  if(id==='bunny')for(const side of [-1,1]){const ear=new T.Group();ear.position.set(side*.3,.4,0);ear.rotation.z=side*-.13;head.add(ear);ears.push(ear);const length=[.36,.61,.72][stage];ball(ear,coat,0,length*.68,0,.18,length,.15);ball(ear,'#edb2c2',0,length*.7,.125,.093,length*.73,.035);}
  if(id==='cat')for(const side of [-1,1]){const ear=new T.Mesh(new T.ConeGeometry(.27,.53,3),material(coat));ear.position.set(side*.42,.44,-.035);ear.rotation.y=-Math.PI/2;ear.rotation.z=side*-.24;head.add(ear);ball(head,pink,side*.43,.48,.115,.1,.17,.04);}
  if(id==='dog')for(const side of [-1,1]){const ear=ball(head,'#b9815b',side*.58,stage===0?.02:-.12,-.02,.23,stage===0?.33:.47,.16);ear.rotation.z=side*.18;ears.push(ear);}
  if(id==='monkey'||id==='cat') {root.add(tail);tube(tail,coat,[[.25,.45,-.26],[.83,.5,-.22],[.92,1,-.15],[.74,1.13,0]],stage===2?.14:.10);}
  if(id==='dog'){root.add(tail);tube(tail,coat,[[.25,.4,-.3],[.7,.7,-.35],[.72,1,-.28],stage===2?[.47,.97,-.23]:[.76,1.1,-.35]],.13);}
  if(id==='bunny')ball(root,'#fff9ef',.5,.4,-.25,.25,.25,.25);
  if(id==='phoenix'){
    for(const side of [-1,1]){const wing=new T.Group();wing.position.set(side*.45,.85,-.04);root.add(wing);ears.push(wing);for(let i=0;i<(stage===0?2:4);i++){const feather=ball(wing,i%2?'#e7badb':'#f3c5a0',side*i*.13,-i*.1,0,.17,[.28,.46,.63][stage],.10);feather.rotation.z=side*-(.5+i*.17);}}
    for(let i=-1;i<=1;i++){const crest=ball(head,i===0?'#f3ca85':pink,i*.14,.62,0,.085,.24+stage*.06,.085);crest.rotation.z=-i*.3;}
    if(stage>0)for(let i=-2;i<=2;i++){const feather=ball(root,i%2?'#c4badf':'#eca1b8',i*.20,.43,-.44,.14,.63+(stage===2?.44:0),.12);feather.rotation.x=-.9;feather.rotation.z=i*.29;}
  }
  if(stage===1&&id!=='phoenix'){ball(root,pink,0,1.08,.42,.38,.08,.14);ball(root,'#f2c86d',0,1.01,.56,.09,.12,.045);}
  if(stage===2){
    if(id==='cat')for(let i=0;i<9;i++){const a=i*Math.PI*2/9;ball(root,'#e4d5ef',Math.cos(a)*.39,1.37+Math.sin(a)*.17,.18+Math.cos(a*.5)*.14,.22,.20,.19);}
    if(id==='dog'){ball(root,'#cae1d0',0,1.38,.1,.47,.11,.38);ball(root,'#cae1d0',.16,1.18,.47,.16,.26,.08);}
    if(id==='monkey')for(let i=0;i<3;i++){const leaf=ball(head,'#a7c8a6',i*.15-.1,.61+i*.03,.03,.12,.25,.06);leaf.rotation.z=-.6+i*.4;}
    if(id==='bunny'||id==='cat')for(let i=0;i<5;i++){const a=i*Math.PI*2/5;ball(head,pink,.43+Math.cos(a)*.1,.45+Math.sin(a)*.1,.27,.077,.077,.04);}
    if(id==='bunny'||id==='cat')ball(head,'#f5d485',.43,.45,.32,.055,.055,.03);
  }
  return {root,head,tail,ears};
}

export function createPetStage(host,{id='bunny',stage=0,scene='room',rug='basic',bowl='basic'}={}){
  let renderer;
  try{renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});}catch{return null;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  const world=new T.Scene(),camera=new T.OrthographicCamera(-2,2,2,-2,.1,40),half=[1.6,1.9,2.05][stage];camera.position.set(2.5,3.7,7);camera.lookAt(0,[1.02,1.38,1.5][stage],0);
  world.add(new T.HemisphereLight('#fff5ed','#a797b4',1.8));const light=new T.DirectionalLight('#fff4e5',3.3);light.position.set(-3,6,5);light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.normalBias=.035;world.add(light);
  const pet=buildPet(id,stage);world.add(pet.root);
  const mat=c=>new T.MeshStandardMaterial({color:c,roughness:.9});
  function ellipsoid(c,x,y,z,sx,sy,sz){const m=new T.Mesh(sphere,mat(c));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.receiveShadow=true;m.castShadow=true;world.add(m);return m;}
  ellipsoid(scene==='garden'?'#d6e3ca':scene==='sky'?'#dcd5ee':'#f2dce0',0,-.07,0,1.66,.14,1.05);
  if(rug==='heart-rug'){for(const side of [-1,1])ellipsoid('#e8a1b6',side*.28,.04,.21,.52,.035,.5);ellipsoid('#e8a1b6',0,.04,.48,.5,.035,.45);}
  const dish=new T.Mesh(new T.TorusGeometry(.25,.072,12,40),mat(bowl==='flower-bowl'?'#ebb5cb':'#cfbdda'));dish.rotation.x=Math.PI/2;dish.position.set(-.92,.13,.55);dish.castShadow=true;world.add(dish);ellipsoid('#f6d99f',-.92,.07,.55,.2,.06,.2);
  if(bowl==='flower-bowl')for(let i=0;i<5;i++){const a=i*Math.PI*2/5;ellipsoid('#e5a3ba',-.92+Math.cos(a)*.3,.12,.55+Math.sin(a)*.3,.1,.06,.1);}
  if(scene==='garden')for(const side of [-1,1]){ellipsoid('#a7c2a2',side*1.26,.24,-.3,.37,.32,.30);for(let i=0;i<5;i++){const a=i*Math.PI*2/5;ellipsoid('#f1b3c7',side*1.22+Math.cos(a)*.12,.59+Math.sin(a)*.12,-.2,.11,.11,.06);}ellipsoid('#f4d183',side*1.22,.59,-.13,.075,.075,.04);}
  if(scene==='sky')for(const side of [-1,1])for(let i=0;i<3;i++)ellipsoid('#fff5ef',side*1.1+i*.15,.34+(i===1?.1:0),-.4,.27,.19,.22);
  const canvas=renderer.domElement;canvas.setAttribute('aria-hidden','true');host.append(canvas);host.classList.add('has-3d');
  let frame=0,disposed=false,angle=0,down=null;
  const draw=()=>{if(!disposed)renderer.render(world,camera);};
  function resize(){const w=host.clientWidth||360,h=host.clientHeight||300,aspect=w/h;camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();renderer.setSize(w,h,false);draw();}
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  canvas.style.touchAction='pan-y';
  canvas.onpointerdown=e=>{down={x:e.clientX,angle};canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(down){angle=Math.max(-.85,Math.min(.85,down.angle+(e.clientX-down.x)/160));pet.root.rotation.y=angle;draw();}};
  canvas.onpointerup=()=>{down=null;};canvas.onpointercancel=()=>{down=null;};
  canvas.addEventListener('webglcontextlost',()=>{host.classList.remove('has-3d');canvas.style.visibility='hidden';});
  function animate(){cancelAnimationFrame(frame);if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;const start=performance.now();function tick(now){const t=(now-start)/1500;if(t>=1||disposed||document.hidden){pet.head.rotation.x=0;pet.root.position.y=0;pet.tail.rotation.y=0;draw();return;}pet.head.rotation.x=Math.sin(t*Math.PI*2)*.16;pet.root.position.y=Math.sin(t*Math.PI*4)*.045;pet.tail.rotation.y=Math.sin(t*Math.PI*8)*.3;draw();frame=requestAnimationFrame(tick);}frame=requestAnimationFrame(tick);}
  return {animate,canvas,dispose(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();world.traverse(o=>{if(o.geometry&&o.geometry!==sphere)o.geometry.dispose();if(o.material)o.material.dispose();});renderer.dispose();renderer.forceContextLoss();canvas.remove();host.classList.remove('has-3d');}};
}

let active=null;
export function clearPetStage(){active?.dispose();active=null;}
export function mountPetStage(root=document){clearPetStage();const host=root.querySelector('[data-pet-stage]');if(host&&host.offsetParent!==null)active=createPetStage(host,{id:host.dataset.pet,stage:Number(host.dataset.stage),scene:host.dataset.scene,rug:host.dataset.rug,bowl:host.dataset.bowl});}
export function animatePet(){active?.animate();}
