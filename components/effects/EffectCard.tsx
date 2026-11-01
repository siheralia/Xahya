"use client";
import {useEffect,useState,type ReactNode} from "react";
import {EFFECT_CATALOG,resolveEffectTargets} from "@/lib/effects/catalog";
import type {ManagedElement} from "@/lib/elements/defaults";

/** Shared presentation for effect cards in skills, items and perks. */
export function useEffectElementColors(){
 const [colors,setColors]=useState<Record<string,string>>({});
 useEffect(()=>{fetch("/api/management/elements").then(r=>r.ok?r.json():null).then(d=>{
  if(Array.isArray(d?.elements))setColors(Object.fromEntries((d.elements as ManagedElement[]).map(e=>[e.key,e.color])));
 }).catch(()=>{});},[]);
 return colors;
}
export function EffectCard({element,colors,children,className=""}:{element?:string;colors:Record<string,string>;children:ReactNode;className?:string}){
 const color=element&&element!=="NEUTRAL"?colors[element]:undefined;
 return <div className={`rounded-xl border border-zinc-800 p-3 ${className}`} style={color&&/^#[0-9a-fA-F]{6}$/.test(color)?{borderColor:color}:undefined}>{children}</div>;
}

/** Shared catalog adapter; each domain retains its persisted effect schema. */
export const sharedEffectTypes=EFFECT_CATALOG.map(effect=>({type:effect.type,label:effect.label}));
export function sharedEffectTargets(type:string,statistics:{key:string;name:string;kind:"basic"|"derived";active?:boolean}[]=[]){
 return resolveEffectTargets(type,statistics);
}
