import type {EffectContainer,NumericExpr,MicroCondition} from "./micro-modules.ts";

const energy="DIVINE_GRACE";
const count:NumericExpr={source:"CHARGES",key:energy};
const out=(key:string):NumericExpr=>({source:"OUTPUT",key});
const sum=(...args:NumericExpr[]):NumericExpr=>({operator:"ADD",args});
const mul=(...args:NumericExpr[]):NumericExpr=>({operator:"MULTIPLY",args});
const div=(a:NumericExpr,b:NumericExpr):NumericExpr=>({operator:"DIVIDE",args:[a,b]});
const cond=(compare:MicroCondition["compare"],right:NumericExpr):MicroCondition=>
  ({left:count,compare,right});

/** These five compositions belong to Gloria's skill *examples*, not to the
 * active character catalog. Source → calculator → action links are executable
 * by the micro interpreter and have regression tests for stored energy. */
export const GLORIA_MICRO_PRESETS:readonly {label:string;effect:EffectContainer}[]=[
 {label:"Gracia divina · Acumulador",effect:{
   id:"GRACIA_DIVINA",name:"Gracia divina",type:"PASSIVE",
   description:"Almacena el daño mitigado como bono de curación.",
   trigger:"DAMAGE_RESOLVED",
   steps:[
     {kind:"CALCULATE",output:"mitigatedDamage",
       expression:{source:"EVENT",key:"MITIGATED_DAMAGE"}},
     {kind:"STORE",accumulator:energy,capacity:5,value:out("mitigatedDamage")},
   ],
 }},
 {label:"Santuario Interior · Defensa",effect:{
   id:"SANTUARIO_DEFENSA",name:"Santuario Interior · Defensa",type:"PASSIVE",
   description:"30% a las resistencias si no existen cargas de bono de curación.",
   trigger:"PASSIVE",requirements:[cond("EQ",0)],
   steps:[
     {kind:"CALCULATE",output:"defenseFactor",expression:1.3},
     {kind:"MODIFIER",stat:"RESISTANCE",multiplier:out("defenseFactor")},
   ],
 }},
 {label:"Santuario Interior · Regeneración",effect:{
   id:"SANTUARIO_REGENERACION",name:"Santuario Interior · Regeneración",type:"PASSIVE",
   description:"Regenera un 10% del HP máximo al iniciar turno mientras haya cargas.",
   trigger:"TURN_START",requirements:[cond("GTE",1)],
   steps:[
     {kind:"READ_STAT",actor:"USER",stat:"MAX_HP",output:"maxHealth"},
     {kind:"CALCULATE",output:"healing",expression:mul(out("maxHealth"),0.1)},
     {kind:"HEAL",amount:out("healing")},
   ],
 }},
 {label:"Retribución divina · Impacto directo",effect:{
   id:"RETRIBUCION_DIRECTA",name:"Retribución divina · Impacto directo",
   type:"ATTACK",description:"Golpe físico 100 + fuerza; la reserva se convierte en daño mágico de Luz.",
   trigger:"IMPACT",impactKind:"CHARACTER",requirements:[cond("GTE",1)],
   steps:[
     {kind:"CONSUME",accumulator:energy,output:"stored_energy",charges:"ALL"},
     {kind:"READ_STAT",actor:"USER",stat:"STR",output:"strength"},
     {kind:"CALCULATE",output:"physicalDamage",expression:sum(100,out("strength"))},
     {kind:"DAMAGE",channel:"PHYSICAL",amount:out("physicalDamage")},
     {kind:"DAMAGE",channel:"MAGICAL",element:"LIGHT",amount:out("stored_energy")},
   ],
 }},
 {label:"Retribución divina · Impacto contra suelo",effect:{
   id:"RETRIBUCION_SUELO",name:"Retribución divina · Terremoto",type:"ATTACK",
   description:"Rayos de Luz en radio 3 m + fuerza/20; daño igual a la energía consumida.",
   trigger:"IMPACT",impactKind:"GROUND",requirements:[cond("GTE",1)],
   steps:[
     {kind:"CONSUME",accumulator:energy,output:"stored_energy",charges:"ALL"},
     {kind:"READ_STAT",actor:"USER",stat:"STR",output:"strength"},
     {kind:"CALCULATE",output:"radius",expression:sum(3,div(out("strength"),20))},
     {kind:"DAMAGE",channel:"MAGICAL",element:"LIGHT",amount:out("stored_energy"),radiusMeters:out("radius")},
   ],
 }},
];
