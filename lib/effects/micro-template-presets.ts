import type {EffectContainer,NumericExpr,MicroCondition} from "./micro-modules.ts";

const energy="DIVINE_GRACE";
const count:NumericExpr={source:"CHARGES",key:energy};
const total:NumericExpr={source:"OUTPUT",key:"stored_energy"};
const stat=(key:string):NumericExpr=>({source:"STAT",key});
const add=(...args:NumericExpr[]):NumericExpr=>({operator:"ADD",args});
const mul=(...args:NumericExpr[]):NumericExpr=>({operator:"MULTIPLY",args});
const div=(a:NumericExpr,b:NumericExpr):NumericExpr=>({operator:"DIVIDE",args:[a,b]});
const cond=(compare:MicroCondition["compare"],right:NumericExpr):MicroCondition=>({left:count,compare,right});
export const GLORIA_MICRO_PRESETS:readonly {label:string;effect:EffectContainer}[]=[
  {label:"Gracia divina · Acumulador",effect:{
    id:"GRACIA_DIVINA",name:"Gracia divina",type:"PASSIVE",description:"Almacena el daño mitigado como bono de curación.",
    trigger:"DAMAGE_RESOLVED",
    steps:[{kind:"STORE",accumulator:energy,capacity:5,value:{source:"EVENT",key:"MITIGATED_DAMAGE"}}],
  }},
  {label:"Santuario Interior · Defensa",effect:{
    id:"SANTUARIO_DEFENSA",name:"Santuario Interior · Defensa",type:"PASSIVE",
    description:"30% a las resistencias si no existen cargas de bono de curación.",trigger:"PASSIVE",
    requirements:[cond("EQ",0)],
    steps:[{kind:"MODIFIER",stat:"RESISTANCE",multiplier:1.3}],
  }},
  {label:"Santuario Interior · Regeneración",effect:{
    id:"SANTUARIO_REGENERACION",name:"Santuario Interior · Regeneración",type:"PASSIVE",
    description:"Regenera un 10% del HP máximo al iniciar turno mientras haya cargas.",trigger:"TURN_START",
    requirements:[cond("GTE",1)],
    steps:[{kind:"HEAL",amount:mul(stat("MAX_HP"),0.1)}],
  }},
  {label:"Retribución divina · Impacto directo",effect:{
    id:"RETRIBUCION_DIRECTA",name:"Retribución divina · Impacto directo",type:"ATTACK",
    description:"Golpe físico 100 + fuerza; inyecta toda la reserva como daño mágico de Luz.",trigger:"IMPACT",
    impactKind:"CHARACTER",requirements:[cond("GTE",1)],
    steps:[{kind:"CONSUME",accumulator:energy,output:"stored_energy",charges:"ALL"},
      {kind:"DAMAGE",channel:"PHYSICAL",amount:add(100,stat("STR"))},
      {kind:"DAMAGE",channel:"MAGICAL",element:"LIGHT",amount:total}],
  }},
  {label:"Retribución divina · Impacto contra suelo",effect:{
    id:"RETRIBUCION_SUELO",name:"Retribución divina · Terremoto",type:"ATTACK",
    description:"Rayos de Luz en radio 3 m + fuerza/20; daño igual a la energía consumida.",trigger:"IMPACT",
    impactKind:"GROUND",requirements:[cond("GTE",1)],
    steps:[{kind:"CONSUME",accumulator:energy,output:"stored_energy",charges:"ALL"},
      {kind:"DAMAGE",channel:"MAGICAL",element:"LIGHT",amount:total,radiusMeters:add(3,div(stat("STR"),20))}],
  }},
];
