/**
 * D4.2: friendly, side-effect-free explanation of the exact port rules used
 * by the React Flow skill editor. Never grants permissions or alters PCH.
 */
export type MicroPortKind="NUMBER"|"ITEM"|"TARGET"|"STAT";
export type MicroPortInfo={id:string;label:string;kind:MicroPortKind};

export type MicroConnectionChoice={
 readOnly:boolean;
 sourceIndex:number;
 sourceOutput?:string|null;
 sourceKind?:MicroPortKind|null;
 targetIndex:number;
 targetPorts:readonly MicroPortInfo[];
 portId:string|null;
};
const readableKind:Record<MicroPortKind,string>={
 NUMBER:"un valor numérico",ITEM:"un objeto",TARGET:"un objetivo",STAT:"una estadística",
};

/** Null means only that the wiring shape is compatible; the server still validates. */
export function explainMicroConnection(choice:MicroConnectionChoice):string|null{
 if(choice.readOnly)return "Este diagrama es de solo lectura.";
 if(choice.sourceIndex<0)return "Selecciona primero un módulo que produzca una salida.";
 if(!choice.sourceOutput?.trim())
  return "El módulo de origen no produce una salida conectable.";
 if(choice.targetIndex<0)
  return "Selecciona un módulo que reciba el resultado.";
 if(choice.targetIndex<=choice.sourceIndex)
  return "El destino debe estar después del origen; no puedes conectarlo hacia atrás ni a sí mismo.";
 const port=choice.targetPorts.find(item=>item.id===choice.portId);
 if(!port)
  return "Selecciona una entrada disponible del módulo de destino.";
 if(!choice.sourceKind)return "No se conoce el tipo de la salida del módulo de origen.";
 if(choice.sourceKind!==port.kind)
  return "Conexión incompatible: «"+port.label+"» necesita "+readableKind[port.kind]+
   ", pero este módulo entrega "+readableKind[choice.sourceKind]+".";
 return null;
}
