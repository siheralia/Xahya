"use client";
import {useEffect,useState} from "react";
import {ElementRelationsChart} from "./ElementRelationsChart";
import type {ManagedElement} from "@/lib/elements/defaults";
export function ElementRelationsDisplay(){const [elements,setElements]=useState<ManagedElement[]>([]);const [error,setError]=useState("");useEffect(()=>{fetch("/api/elements",{cache:"no-store"}).then(async r=>{if(!r.ok)throw Error("No se pudieron cargar los elementos");return r.json()}).then(d=>setElements(Array.isArray(d.elements)?d.elements:[])).catch(e=>setError(e.message));},[]);return <div>{error?<p role="alert" className="text-red-300">{error}</p>:<ElementRelationsChart elements={elements} onSelect={()=>{}}/>}</div>}
