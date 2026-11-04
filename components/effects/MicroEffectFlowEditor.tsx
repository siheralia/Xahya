"use client";

import {useCallback,useMemo,useState} from "react";
import {
  Background,BackgroundVariant,Controls,Handle,Position,ReactFlow,
  type Connection,type Edge,type Node,type NodeChange,type NodeProps
} from "@xyflow/react";
import type {EffectContainer,MicroStep,NumericExpr} from "@/lib/effects/micro-modules";

type FlowNode=Node<{
  title:string;
  description:string;
  category:string;
  output?:string;
  isResistance:boolean;
},"skillStep">;

const nodeTypes={skillStep:StepNode};
const nodeId=(i:number)=>"step-"+i;
const indexOfNode=(id:string|null|undefined)=>id?.startsWith("step-")?Number(id.slice(5)):-1;
const outputOf=(step:MicroStep):string|undefined=>"output" in step?step.output:undefined;
const connectionsFrom=(value:NumericExpr|undefined):string[]=>{
  if(value===undefined||typeof value==="number")return [];
  if("source" in value)return value.source==="OUTPUT"?[value.key]:[];
  return value.args.flatMap(connectionsFrom);
};
const roleOf=(step:MicroStep):string=>{
  switch(step.kind){
    case "READ_STAT":return (step.actor==="USER"?"Usuario":"Oponente")+" · "+step.stat;
    case "READ_STORED":return step.accumulator+" · "+(step.metric==="TOTAL"?"Total":"Cargas");
    case "VARIABLE_RESISTANCE":return step.config.formula+" · "+step.config.baseStat;
    case "CONSUME":return "Consumo de "+step.accumulator;
    case "STORE":return step.accumulator+" · hasta "+step.capacity+" cargas";
    case "CAPABILITY":return step.code;
    case "DAMAGE":return "Daño "+step.channel.toLowerCase();
    case "HEAL":return "Recuperar HP";
    case "MODIFIER":return step.stat+" ×";
    case "BONUS":return step.stat+" +";
  }
};
function StepNode({data}:NodeProps<FlowNode>){
  return <div className="relative min-w-[212px] max-w-[238px] rounded-xl border border-cyan-500/60 bg-zinc-950 px-3 py-3 text-zinc-100 shadow-xl shadow-black/25">
    {data.isResistance&&<>
      <Handle type="target" id="base" position={Position.Left} style={{top:42,width:11,height:11,background:"#22d3ee"}}/>
      <Handle type="target" id="input" position={Position.Left} style={{top:78,width:11,height:11,background:"#c084fc"}}/>
    </>}
    <div className="text-[10px] font-semibold uppercase tracking-wide text-cyan-300">{data.category}</div>
    <div className="mt-1 text-sm font-semibold">{data.title}</div>
    <p className="mt-1 max-w-[194px] truncate text-xs text-zinc-400" title={data.description}>{data.description}</p>
    {data.isResistance&&<div className="mt-2 text-[10px] text-zinc-500">Entrada azul: base · violeta: variable</div>}
    {data.output&&<>
      <div className="mt-2 truncate rounded bg-zinc-800 px-2 py-1 text-[10px] text-emerald-300">Salida: {data.output}</div>
      <Handle type="source" id="value" position={Position.Right} style={{width:12,height:12,background:"#34d399"}}/>
    </>}
  </div>;
}

/** Edges are projections of the executable module expressions, not a second
 * state machine. Removing an edge resets that input to its configured default.
 */
export function MicroEffectFlowEditor({
 value,onChange,onEditStep,readOnly=false,
}:{
 value:EffectContainer;
 onChange:(value:EffectContainer)=>void;
 onEditStep?:(index:number)=>void;
 readOnly?:boolean;
}){
 const [positions,setPositions]=useState<Record<string,{x:number;y:number}>>({});
 const nodes=useMemo<FlowNode[]>(()=>value.steps.map((step,i)=>({
   id:nodeId(i),type:"skillStep",
   position:positions[nodeId(i)]??{x:(i%3)*290,y:Math.floor(i/3)*178},
   draggable:true,selectable:true,
   data:{title:step.kind.replaceAll("_"," "),category:"Módulo "+(i+1),
     description:roleOf(step),output:outputOf(step),isResistance:step.kind==="VARIABLE_RESISTANCE"},
 })),[value.steps,positions]);
 const edges=useMemo<Edge[]>(()=>{
   const result:Edge[]=[];
   for(let target=0;target<value.steps.length;target++){
     const step=value.steps[target];
     if(step.kind!=="VARIABLE_RESISTANCE")continue;
     for(const [targetHandle,sourceExpr] of [["base",step.base],["input",step.input]] as const){
       for(const key of connectionsFrom(sourceExpr)){
         const source=value.steps.findIndex((s,i)=>i<target&&outputOf(s)===key);
         if(source<0)continue;
         result.push({
           id:nodeId(source)+"-"+targetHandle+"-"+nodeId(target),
           source:nodeId(source),sourceHandle:"value",
           target:nodeId(target),targetHandle,
           type:"smoothstep",animated:false,
           style:{stroke:targetHandle==="base"?"#22d3ee":"#c084fc",strokeWidth:2.5},
         });
       }
     }
   }
   return result;
 },[value.steps]);
 const onNodesChange=useCallback((changes:NodeChange<FlowNode>[])=>{
   setPositions(current=>{
     let next=current;
     for(const change of changes){
       if(change.type!=="position"||!change.position)continue;
       if(next===current)next={...current};
       next[change.id]=change.position;
     }
     return next;
   });
 },[]);
 const onConnect=useCallback((link:Connection)=>{
   const from=indexOfNode(link.source),to=indexOfNode(link.target);
   const targetHandle=link.targetHandle;
   if(readOnly||from<0||to<0||from>=to||!["base","input"].includes(targetHandle??""))return;
   const producer=value.steps[from],consumer=value.steps[to];
   const output=outputOf(producer);
   if(!output||consumer?.kind!=="VARIABLE_RESISTANCE")return;
   onChange({...value,steps:value.steps.map((step,i)=>{
     if(i!==to||step.kind!=="VARIABLE_RESISTANCE")return step;
     const expr:NumericExpr={source:"OUTPUT",key:output};
     return targetHandle==="base"?{...step,base:expr}:{...step,input:expr};
   })});
 },[onChange,value,readOnly]);
 const onEdgesDelete=useCallback((removed:Edge[])=>{
   if(readOnly)return;
   const next=value.steps.map(step=>({...step}));
   for(const edge of removed){
     const i=indexOfNode(edge.target);
     const step=next[i];
     if(!step||step.kind!=="VARIABLE_RESISTANCE")continue;
     if(edge.targetHandle==="base")delete step.base;
     if(edge.targetHandle==="input")delete step.input;
   }
   onChange({...value,steps:next});
 },[onChange,value,readOnly]);
 return <section className="space-y-2">
   <div className="flex flex-wrap items-center justify-between gap-2">
     <div>
       <h3 className="font-semibold">Diagrama React Flow</h3>
       <p className="text-xs text-zinc-400">{readOnly?"Vista de conexiones de la copia modular. Las habilidades originales siguen intactas.":"Arrastra el punto verde de una salida hasta la entrada azul o violeta de Resistencia variable. Selecciona un nodo para editar sus parámetros debajo."}</p>
     </div>
     <span className="text-xs text-zinc-400">{value.steps.length} nodos · {edges.length} conexiones</span>
   </div>
   <div className="h-[430px] w-full overflow-hidden rounded-xl border border-zinc-700 bg-[#090d18]">
     <ReactFlow
       nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
       onConnect={onConnect} onEdgesDelete={onEdgesDelete}
       onNodeClick={(_event,node)=>onEditStep?.(indexOfNode(node.id))}
       colorMode="dark" fitView fitViewOptions={{padding:0.22}}
       minZoom={0.2} maxZoom={1.7} nodesConnectable={!readOnly} edgesDeletable={!readOnly} edgesReconnectable={false}
       deleteKeyCode={["Backspace","Delete"]}
       isValidConnection={link=>{
         const from=indexOfNode(link.source),to=indexOfNode(link.target);
         return !readOnly&&from>=0&&to>from&&["base","input"].includes(link.targetHandle??"")&&
           Boolean(outputOf(value.steps[from]))&&value.steps[to]?.kind==="VARIABLE_RESISTANCE";
       }}
       proOptions={{hideAttribution:true}}
     >
       <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#334155"/>
       <Controls showInteractive={false}/>
     </ReactFlow>
   </div>
   {!readOnly&&<p className="text-xs text-zinc-500">Las posiciones son locales al editor; las conexiones reales se guardan dentro de las expresiones de los micromódulos. Ninguna conexión permite usar datos de otro personaje sin validación del servidor.</p>}
 </section>;
}
