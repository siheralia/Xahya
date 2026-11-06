"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {
 Background,BackgroundVariant,Controls,Handle,Position,ReactFlow,
 type Connection,type Edge,type Node,type NodeChange,type NodeProps
} from "@xyflow/react";
import type {EffectContainer,MicroStep,NumericExpr} from "@/lib/effects/micro-modules";
import {friendlyMicroKey,MICRO_OPERATOR_LABELS} from "@/lib/effects/micro-labels";

type Port={id:string;label:string;expr?:NumericExpr;kind?:"NUMBER"|"ITEM"|"TARGET"|"STAT"};
type GraphNode=Node<{
  title:string;subtitle:string;index:number;output?:string;outputKind?:"ITEM"|"NUMBER"|"TARGET"|"STAT";
  ports:Port[];unresolved:boolean;mobile:boolean;
},"skillStep">;
const nodeTypes={skillStep:StepNode};
const nodeId=(index:number)=>"step-"+index;
const indexOfNode=(id:string|null|undefined)=>id?.startsWith("step-")?Number(id.slice(5)):-1;
const outputOf=(step:MicroStep):string|undefined=>"output" in step?step.output:undefined;
const outputKindOf=(step:MicroStep):"NUMBER"|"ITEM"|"TARGET"|"STAT"=>
  step.kind==="READ_ITEM"?"ITEM":step.kind==="SELECT_TARGET"?"TARGET":
  step.kind==="SELECT_STAT"?"STAT":"NUMBER";
const referencedOutputs=(expr:NumericExpr|undefined|null):string[]=>{
  // Partially edited or old expressions should never take down the graph.
  if(expr===undefined||expr===null||typeof expr!=="object")return [];
  if("source" in expr)return expr.source==="OUTPUT"&&typeof expr.key==="string"?[expr.key]:[];
  return Array.isArray(expr.args)?expr.args.flatMap(referencedOutputs):[];
};
const inputsOf=(step:MicroStep):Port[]=>{
 switch(step.kind){
  case "CALCULATE":return [{id:"expression",label:"Operación",expr:step.expression}];
  case "REQUIRE_CONTACT":
  case "READ_STATUSES":
  case "INVERT_STATUS":
    return [{id:"target",label:"Objetivo",expr:step.target,kind:"TARGET"}];
  case "APPLY_STATUS":return [
    {id:"target",label:"Objetivo",expr:step.target,kind:"TARGET"},
    ...(typeof step.stat!=="string"?[{id:"stat",label:"Estadística",
      expr:{source:"OUTPUT",key:step.stat.key} as NumericExpr,kind:"STAT" as const}]:[]),
    {id:"value",label:"Valor",expr:step.value,kind:"NUMBER"}
  ];
  case "LINK_ENTITY_STAT":return [{id:"factor",label:"Factor",expr:step.factor,kind:"NUMBER"}];
  case "STORE":return [{id:"value",label:"Almacenar",expr:step.value}];
  case "HEAL":return [{id:"amount",label:"Curación",expr:step.amount}];
  case "REPAIR_DURABILITY":return [
   {id:"target",label:"Objeto",expr:step.target},
   {id:"amount",label:"Cantidad",expr:step.amount}
  ];
  case "DAMAGE":return [
   {id:"amount",label:"Daño",expr:step.amount},
   ...(step.radiusMeters!==undefined?[{id:"radiusMeters",label:"Radio",expr:step.radiusMeters}]:[])
  ];
  case "MODIFIER":return [{id:"multiplier",label:"Factor",expr:step.multiplier}];
  case "BONUS":return [{id:"amount",label:"Bono",expr:step.amount}];
  case "VARIABLE_RESISTANCE":return [
   {id:"base",label:"Base",expr:step.base},{id:"input",label:"Variable",expr:step.input}
  ];
  default:return [];
 }
};
const exprLabel=(v:NumericExpr|undefined|null):string=>{
  if(v===undefined)return "Automático";
  if(v===null||(typeof v!=="number"&&typeof v!=="object"))return "Valor incompleto";
  if(typeof v==="number")return String(v);
  if("source" in v)return typeof v.key==="string"?
    (v.source==="OUTPUT"?"← ":"")+friendlyMicroKey(v.key):"Referencia incompleta";
  return Array.isArray(v.args)?
    (MICRO_OPERATOR_LABELS[v.operator]??v.operator)+"("+v.args.map(exprLabel).join(", ")+")":
    "Operación incompleta";
};
const display=(step:MicroStep):{title:string;subtitle:string;unresolved:boolean}=>{
 switch(step.kind){
  case "CALCULATE":return {title:typeof step.expression==="number"?"Valor configurado":"Calcular valor",subtitle:exprLabel(step.expression),unresolved:false};
  case "SELECT_TARGET":return {title:"Seleccionar objetivo",subtitle:friendlyMicroKey(step.selector),unresolved:true};
  case "SELECT_STAT":return {title:"Seleccionar estadística",subtitle:step.mode+" · "+step.allowed.map(friendlyMicroKey).join(", "),unresolved:step.mode!=="FIXED"};
  case "READ_HP_DAMAGE":return {title:"Leer daño a HP",subtitle:"HP perdido tras la defensa",unresolved:true};
  case "REQUIRE_CONTACT":return {title:"Comprobar contacto",subtitle:"Exige contacto real",unresolved:true};
  case "SUMMON_ENTITY":return {title:"Invocar entidad",subtitle:step.label+" · "+step.manaCost+" maná",unresolved:true};
  case "LINK_ENTITY_STAT":return {title:"Vincular estadística",subtitle:friendlyMicroKey(step.sourceStat)+" → "+friendlyMicroKey(step.destStat),unresolved:true};
  case "SET_ENTITY_BEHAVIOR":return {title:"Configurar comportamiento",subtitle:step.entityKey+" · "+friendlyMicroKey(step.mode),unresolved:true};
  case "APPLY_STATUS":return {title:"Aplicar estado",subtitle:typeof step.stat==="string"?friendlyMicroKey(step.stat):"Estadística conectada",unresolved:true};
  case "READ_STATUSES":return {title:"Contar estados",subtitle:friendlyMicroKey(step.filter),unresolved:true};
  case "INVERT_STATUS":return {title:"Invertir debilitamiento",subtitle:step.manaCost+" maná por inversión",unresolved:true};
  case "READ_STAT":return {title:"Leer estadística",subtitle:(step.actor==="USER"?"Usuario":"Oponente")+" · "+friendlyMicroKey(step.stat),unresolved:false};
  case "READ_ITEM":return {title:"Leer objeto",subtitle:friendlyMicroKey(step.selector),unresolved:false};
  case "REPAIR_DURABILITY":return {title:"Restaurar durabilidad",subtitle:"Objeto y cantidad conectables · máx. 100",unresolved:false};
  case "READ_STORED":return {title:"Leer almacén",subtitle:friendlyMicroKey(step.accumulator)+" · "+(step.metric==="TOTAL"?"Total":"Cargas"),unresolved:false};
  case "CONSUME":return {title:"Consumir cargas",subtitle:friendlyMicroKey(step.accumulator)+" · "+friendlyMicroKey(String(step.charges)),unresolved:false};
  case "STORE":return {title:"Almacenar",subtitle:friendlyMicroKey(step.accumulator)+" · máx. "+step.capacity,unresolved:false};
  case "HEAL":return {title:"Curar",subtitle:"Recuperar puntos de vida",unresolved:false};
  case "DAMAGE":return {title:"Aplicar daño",subtitle:step.channel==="MAGICAL"?"Mágico · "+(step.element??"sin elemento"):"Físico",unresolved:false};
  case "MODIFIER":{
   const targets:Record<string,string>={MAGIC_ATTACK:"Ataque mágico",MAGIC_ATK:"Ataque mágico",
     PHYS_ATK:"Ataque físico",PHYSICAL_ATTACK:"Ataque físico",
     PHYS_DEF:"Defensa física",MAGIC_DEF:"Defensa mágica"};
   const target=step.sourceTarget?(targets[step.sourceTarget]??friendlyMicroKey(step.sourceTarget)):
     friendlyMicroKey(step.stat);
   return {title:"Aplicar multiplicador",subtitle:target+(step.sourceElement?" · "+step.sourceElement:""),unresolved:false};
  }
  case "BONUS":return {title:"Aplicar bono",subtitle:friendlyMicroKey(step.stat),unresolved:false};
  case "VARIABLE_RESISTANCE":return {title:"Resistencia variable",subtitle:friendlyMicroKey(step.config.formula)+" · "+friendlyMicroKey(step.config.baseStat),unresolved:false};
  case "CAPABILITY":return {title:"Capacidad declarativa",subtitle:(step.description||step.code)+(step.element?" · "+step.element:""),unresolved:true};
 }
};
function StepNode({data}:NodeProps<GraphNode>){
 const sourcePosition=data.mobile?Position.Bottom:Position.Right;
 const targetPosition=data.mobile?Position.Top:Position.Left;
 const tall=Math.max(105,89+data.ports.length*29);
 return <div style={{minHeight:tall}} className={"relative w-[204px] rounded-xl border bg-zinc-950 px-3 py-2.5 text-zinc-100 shadow-lg shadow-black/20 "+
   (data.unresolved?"border-amber-600/70":"border-cyan-500/70")}>
   <div className={"text-[10px] font-semibold uppercase tracking-wider "+(data.unresolved?"text-amber-300":"text-cyan-300")}>
     {data.unresolved?"Pendiente de resolver":"Paso "+(data.index+1)}
   </div>
   <div className="mt-1 text-sm font-semibold leading-tight">{data.title}</div>
   <div className="mt-1 break-words text-[11px] text-zinc-400">{data.subtitle}</div>
   {data.ports.map((port,i)=><div key={port.id} className="relative mt-1 flex items-center gap-1.5 pl-1 text-[10px] text-zinc-400">
     <Handle type="target" id={port.id} position={targetPosition}
       style={data.mobile?{left:22+i*36,top:-2,width:10,height:10,background:i===0?"#22d3ee":"#c084fc"}:
         {top:79+i*28,left:-6,width:10,height:10,background:i===0?"#22d3ee":"#c084fc"}}/>
     <span className="text-cyan-300">{port.label}:</span>
     <span className="min-w-0 truncate">{exprLabel(port.expr)}</span>
   </div>)}
   {data.output&&<div className={"mt-2 truncate rounded-md bg-zinc-800 px-1.5 py-1 text-[10px] "+
    (data.outputKind==="ITEM"?"text-amber-300":data.outputKind==="TARGET"?"text-sky-300":
      data.outputKind==="STAT"?"text-violet-300":"text-emerald-300")}>
     Salida {data.outputKind==="ITEM"?"(objeto)":data.outputKind==="TARGET"?"(objetivo)":data.outputKind==="STAT"?"(estadística)":"(valor)"} · {friendlyMicroKey(data.output)}
   </div>}
   {data.output&&<Handle type="source" id="value" position={sourcePosition}
     style={{width:12,height:12,background:data.outputKind==="ITEM"?"#fbbf24":
       data.outputKind==="TARGET"?"#38bdf8":data.outputKind==="STAT"?"#c084fc":"#34d399"}}/>}
 </div>;
}
function wire(step:MicroStep,port:string,expr:NumericExpr):MicroStep{
 switch(step.kind){
  case "CALCULATE":return port==="expression"?{...step,expression:expr}:step;
  case "REQUIRE_CONTACT":
  case "READ_STATUSES":
  case "INVERT_STATUS":
    return port==="target"&&typeof expr==="object"&&"source" in expr&&expr.source==="OUTPUT"
      ?{...step,target:{source:"OUTPUT",key:expr.key}}:step;
  case "APPLY_STATUS":
    if(port==="target"&&typeof expr==="object"&&"source" in expr&&expr.source==="OUTPUT")
      return {...step,target:{source:"OUTPUT",key:expr.key}};
    if(port==="stat"&&typeof expr==="object"&&"source" in expr&&expr.source==="OUTPUT")
      return {...step,stat:{source:"STAT_SELECTION",key:expr.key}};
    return port==="value"?{...step,value:expr}:step;
  case "LINK_ENTITY_STAT":return port==="factor"?{...step,factor:expr}:step;
  case "STORE":return port==="value"?{...step,value:expr}:step;
  case "HEAL":return port==="amount"?{...step,amount:expr}:step;
  case "REPAIR_DURABILITY":
   return port==="target"&&typeof expr==="object"&&"source" in expr&&expr.source==="OUTPUT"
    ?{...step,target:{source:"OUTPUT",key:expr.key}}:
     port==="amount"?{...step,amount:expr}:step;
  case "DAMAGE":return port==="amount"?{...step,amount:expr}:port==="radiusMeters"?{...step,radiusMeters:expr}:step;
  case "BONUS":return port==="amount"?{...step,amount:expr}:step;
  case "MODIFIER":return port==="multiplier"?{...step,multiplier:expr}:step;
  case "VARIABLE_RESISTANCE":return port==="base"?{...step,base:expr}:port==="input"?{...step,input:expr}:step;
  default:return step;
 }
}
function disconnect(step:MicroStep,port:string):MicroStep{
 if(step.kind==="VARIABLE_RESISTANCE"){
  if(port==="base"){const {base:_,...rest}=step;return rest;}
  if(port==="input"){const {input:_,...rest}=step;return rest;}
 }
 if(["REQUIRE_CONTACT","READ_STATUSES","INVERT_STATUS","APPLY_STATUS"].includes(step.kind)&&port==="target")
   return {...step,target:{source:"OUTPUT",key:"MissingTarget"}} as MicroStep;
 if(step.kind==="APPLY_STATUS"&&port==="stat")return {...step,stat:"STR"};
 if(step.kind==="REPAIR_DURABILITY"&&port==="target")
  return {...step,target:{source:"OUTPUT",key:"MissingItem"}};
 if(step.kind==="DAMAGE"&&port==="radiusMeters"){const {radiusMeters:_,...rest}=step;return rest;}
 return wire(step,port,step.kind==="MODIFIER"?1:0);
}
export function MicroEffectFlowEditor({
 value,onChange,onEditStep,readOnly=false,
}:{
 value:EffectContainer;
 onChange:(value:EffectContainer)=>void;
 onEditStep?:(index:number)=>void;
 readOnly?:boolean;
}){
 const [positions,setPositions]=useState<Record<string,{x:number;y:number}>>({});
 const [mobile,setMobile]=useState(false);
 useEffect(()=>{
  const mq=window.matchMedia("(max-width: 640px)");
  const update=()=>setMobile(mq.matches);
  update();mq.addEventListener("change",update);
  return ()=>mq.removeEventListener("change",update);
 },[]);
 const graph=useMemo(()=>{
  const layers:number[]=[];
  const lanes=new Map<number,number>();
  for(let i=0;i<value.steps.length;i++){
   const links=inputsOf(value.steps[i]).flatMap(port=>referencedOutputs(port.expr));
   const sources=links.map(key=>value.steps.findIndex((x,j)=>j<i&&outputOf(x)===key)).filter(j=>j>=0);
   layers[i]=sources.length?Math.max(...sources.map(j=>layers[j]+1)):0;
  }
  const nodes:GraphNode[]=value.steps.map((step,i)=>{
   const layer=layers[i],lane=lanes.get(layer)??0;
   lanes.set(layer,lane+1);
   const text=display(step);
   const position=positions[nodeId(i)]??
     (mobile?{x:12,y:i*165}:{x:layer*260+16,y:lane*172+12});
   return {id:nodeId(i),type:"skillStep",position,
     draggable:true,selectable:true,
     data:{...text,index:i,ports:inputsOf(step),output:outputOf(step),
       outputKind:outputKindOf(step),mobile}};
  });
  const edges:Edge[]=[];
  value.steps.forEach((step,i)=>{
   for(const port of inputsOf(step)){
    for(const key of referencedOutputs(port.expr)){
     const from=value.steps.findIndex((producer,j)=>j<i&&outputOf(producer)===key);
     if(from<0)continue;
     edges.push({id:nodeId(from)+"-"+port.id+"-"+nodeId(i),source:nodeId(from),
       sourceHandle:"value",target:nodeId(i),targetHandle:port.id,
       animated:false,deletable:!readOnly,type:"smoothstep",
       style:{stroke:port.id==="base"?"#22d3ee":"#a78bfa",strokeWidth:2.3}});
    }
   }
  });
  const maximum=Math.max(0,...lanes.values());
  return {nodes,edges,canvasHeight:mobile?Math.max(260,Math.min(500,value.steps.length*112)):
    Math.max(240,Math.min(510,120+maximum*155))};
 },[value.steps,mobile,positions,readOnly]);
 const onNodesChange=useCallback((changes:NodeChange<GraphNode>[])=>{
  setPositions(prev=>{
   let next=prev;
   for(const change of changes){
    if(change.type!=="position"||!change.position)continue;
    if(next===prev)next={...prev};
    next[change.id]=change.position;
   }
   return next;
  });
 },[]);
 const validLink=useCallback((link:Connection | Edge)=>{
  const from=indexOfNode(link.source),to=indexOfNode(link.target);
  const sourceType=from>=0?outputKindOf(value.steps[from]):null;
  const receiver=to>=0?inputsOf(value.steps[to]).find(p=>p.id===link.targetHandle):undefined;
  const targetType=receiver?.kind??(to>=0&&value.steps[to]?.kind==="REPAIR_DURABILITY"&&link.targetHandle==="target"?"ITEM":"NUMBER");
  return !readOnly&&from>=0&&to>from&&to<value.steps.length&&
   Boolean(outputOf(value.steps[from]))&&Boolean(receiver)&&sourceType===targetType;
 },[readOnly,value.steps]);
 const onConnect=useCallback((link:Connection)=>{
  if(!validLink(link))return;
  const from=indexOfNode(link.source),to=indexOfNode(link.target);
  const out=outputOf(value.steps[from]);
  if(!out)return;
  const steps=value.steps.map((step,i)=>i===to?wire(step,String(link.targetHandle),{source:"OUTPUT",key:out}):step);
  onChange({...value,steps});
 },[value,onChange,validLink]);
 const onEdgesDelete=useCallback((deleted:Edge[])=>{
  if(readOnly)return;
  let next=[...value.steps];
  for(const edge of deleted){
   const i=indexOfNode(edge.target);
   if(next[i])next=next.map((step,j)=>j===i?disconnect(step,String(edge.targetHandle)):step);
  }
  onChange({...value,steps:next});
 },[readOnly,value,onChange]);
 return <section className="min-w-0 space-y-2">
   <div className="flex flex-wrap items-center justify-between gap-2">
    <div>
     <h3 className="text-base font-semibold">Conexiones de micromódulos</h3>
     <p className="max-w-lg text-xs text-zinc-400">{readOnly?
       "Diagrama de la ejecución modular. Los nodos amarillos todavía necesitan un resolutor.":"Conecta valores con valores y salidas tipadas de objetivo/estadística con sus entradas correspondientes. El grafo guarda las referencias reales."}</p>
    </div>
    <span className="text-xs text-zinc-400">{value.steps.length} módulos · {graph.edges.length} conexiones</span>
   </div>
   <div style={{height:graph.canvasHeight}}
     className="min-w-0 w-full overflow-hidden rounded-xl border border-zinc-700 bg-[#090d18]">
     <ReactFlow key={value.id+"-"+value.steps.length}
       nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes}
       onNodesChange={onNodesChange} onConnect={onConnect} onEdgesDelete={onEdgesDelete}
       onNodeClick={(_event,node)=>onEditStep?.(indexOfNode(node.id))}
       colorMode="dark" fitView fitViewOptions={{padding:0.16}}
       minZoom={0.22} maxZoom={1.8} nodesConnectable={!readOnly} edgesReconnectable={false}
       deleteKeyCode={["Backspace","Delete"]}
       isValidConnection={validLink} proOptions={{hideAttribution:true}}>
       <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#334155"/>
       <Controls showInteractive={false}/>
     </ReactFlow>
   </div>
   {!readOnly&&<p className="text-xs text-zinc-500">Solo se permiten salidas de módulos anteriores. Al eliminar una conexión, el valor se restablece y debe revisarse. El servidor valida todas las referencias.</p>}
 </section>;
}
