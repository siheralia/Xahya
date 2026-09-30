"use client";

import { useMemo, useState } from "react";

type MapRoom = {
  id:number;
  roomNumber:number;
  roomType:string;
  status:string;
  contentName?:string|null;
  enemies?:any[];
};

type MapExit = {
  id:number;
  fromRoomId:number;
  toRoomId:number|null;
  direction:string;
};

type MazeMapProps = {
  rooms:MapRoom[];
  exits:MapExit[];
  currentRoomId:number|null;
  directionLabels?:Record<string,string>;
};

const ROOM_META:Record<string,{label:string; symbol:string}> = {
  ENEMY:{label:"Enemigo",symbol:"⚔"},
  TRAP:{label:"Trampa",symbol:"⌁"},
  BOSS:{label:"Jefe",symbol:"♛"},
  TREASURE:{label:"Tesoro",symbol:"◇"},
  SAFE:{label:"Segura",symbol:"+"},
  DEATH:{label:"Muerte",symbol:"☠"},
  MOBILE_ENEMY:{label:"Enemigo móvil",symbol:"⚔"},
  NPC:{label:"NPC",symbol:"●"},
};

const DELTA:Record<string,[number,number,number]> = {
  N:[0,-1,0], E:[1,0,0], S:[0,1,0], O:[-1,0,0],
  N_UP:[0,-1,1], E_UP:[1,0,1], S_UP:[0,1,1], O_UP:[-1,0,1],
  N_DOWN:[0,-1,-1], E_DOWN:[1,0,-1], S_DOWN:[0,1,-1], O_DOWN:[-1,0,-1],
  UP:[0,0,1], DOWN:[0,0,-1],
};

function roomStyle(type:string, current:boolean) {
  if (current) return { fill:"#e4e4e7", stroke:"#ffffff", text:"#09090b" };
  if (type==="BOSS") return { fill:"#3f172a", stroke:"#fb7185", text:"#fecdd3" };
  if (type==="TREASURE") return { fill:"#422006", stroke:"#fbbf24", text:"#fde68a" };
  if (type==="TRAP" || type==="DEATH") return { fill:"#3f1d1d", stroke:"#f87171", text:"#fecaca" };
  if (type==="SAFE") return { fill:"#052e2b", stroke:"#34d399", text:"#a7f3d0" };
  if (type==="NPC") return { fill:"#2e1065", stroke:"#c084fc", text:"#e9d5ff" };
  return { fill:"#18181b", stroke:"#71717a", text:"#e4e4e7" };
}

export default function MazeMap({rooms,exits,currentRoomId,directionLabels}:MazeMapProps) {
  const [selectedId,setSelectedId] = useState<number|null>(null);

  const layout = useMemo(() => {
    if (!rooms.length) return { nodes:[], links:[], stubs:[], width:720, height:420 };

    const roomById = new Map(rooms.map(room=>[Number(room.id),room]));
    const outgoing = new Map<number,MapExit[]>();
    exits.forEach(exit=>{
      const list=outgoing.get(Number(exit.fromRoomId))??[];
      list.push(exit);
      outgoing.set(Number(exit.fromRoomId),list);
    });

    const positions = new Map<number,{x:number;y:number;z:number}>();
    const root = rooms.find(room=>Number(room.roomNumber)===1) ?? rooms[0];
    positions.set(Number(root.id),{x:0,y:0,z:0});
    const queue=[Number(root.id)];

    while(queue.length){
      const id=queue.shift()!;
      const base=positions.get(id)!;
      for(const exit of outgoing.get(id)??[]){
        if(exit.toRoomId==null || positions.has(Number(exit.toRoomId))) continue;
        const delta=DELTA[exit.direction]??[0,0,0];
        positions.set(Number(exit.toRoomId),{
          x:base.x+delta[0],
          y:base.y+delta[1],
          z:base.z+delta[2],
        });
        queue.push(Number(exit.toRoomId));
      }
    }

    // Fallback for any disconnected discovered room.
    let fallback=0;
    for(const room of rooms){
      const id=Number(room.id);
      if(!positions.has(id)){
        positions.set(id,{x:fallback,y:Math.floor(fallback/5)+2,z:0});
        fallback++;
      }
    }

    const occupied = new Map<string,number>();
    for(const [id,pos] of positions){
      const key=`${pos.x}:${pos.y}:${pos.z}`;
      if(!occupied.has(key)) occupied.set(key,id);
    }

    const minX=Math.min(...[...positions.values()].map(p=>p.x),0);
    const maxX=Math.max(...[...positions.values()].map(p=>p.x),0);
    const minY=Math.min(...[...positions.values()].map(p=>p.y),0);
    const maxY=Math.max(...[...positions.values()].map(p=>p.y),0);
    const cell=92;
    const pad=80;
    const width=Math.max(560,(maxX-minX+1)*cell+pad*2);
    const height=Math.max(340,(maxY-minY+1)*cell+pad*2);

    const point=(id:number)=>{
      const p=positions.get(id)!;
      return {
        x:pad+(p.x-minX)*cell,
        y:pad+(p.y-minY)*cell,
        z:p.z,
      };
    };

    const links=exits
      .filter(e=>e.toRoomId!=null && roomById.has(Number(e.toRoomId)))
      .map(e=>{
        const a=point(Number(e.fromRoomId));
        const b=point(Number(e.toRoomId));
        return {...e,a,b};
      });

    const stubs=exits
      .filter(e=>e.toRoomId==null && roomById.has(Number(e.fromRoomId)))
      .map(e=>{
        const a=point(Number(e.fromRoomId));
        const d=DELTA[e.direction]??[0,0,0];
        const length=28;
        return {
          ...e,
          x1:a.x,y1:a.y,
          x2:a.x+d[0]*length,y2:a.y+d[1]*length,
          vertical:d[2]!==0 || e.direction==="UP" || e.direction==="DOWN",
        };
      });

    return {
      nodes:rooms.map(room=>({...room,point:point(Number(room.id))})),
      links,
      stubs,
      width,
      height,
    };
  },[rooms,exits]);

  if(!rooms.length) return null;

  const selected=selectedId!=null ? rooms.find(room=>Number(room.id)===selectedId) : null;

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
        <div>
          <h3 className="text-lg font-semibold">Mapa de exploración</h3>
          <p className="mt-1 text-xs text-zinc-500">Solo muestra las habitaciones que ya existen en el laberinto.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] text-zinc-500">
          <span>◉ Actual</span><span>◇ Tesoro</span><span>♛ Jefe</span><span>⚔ Enemigo</span><span>⌁ Trampa</span>
        </div>
      </div>

      <div className="relative overflow-auto bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.045),transparent_55%)] p-3">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="mx-auto block min-h-[340px] w-full min-w-[560px] max-w-none"
          role="img"
          aria-label="Mapa visual de las habitaciones descubiertas"
        >
          <defs>
            <filter id="mazeGlow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>

          {layout.links.map((link:any)=>(
            <g key={`link-${link.id}`}>
              <line x1={link.a.x} y1={link.a.y} x2={link.b.x} y2={link.b.y}
                stroke="#52525b" strokeWidth="5" strokeLinecap="round"/>
              {link.direction.includes("_UP") && <text x={(link.a.x+link.b.x)/2+6} y={(link.a.y+link.b.y)/2-5} fill="#a1a1aa" fontSize="11">↑</text>}
              {link.direction.includes("_DOWN") && <text x={(link.a.x+link.b.x)/2+6} y={(link.a.y+link.b.y)/2-5} fill="#a1a1aa" fontSize="11">↓</text>}
              {(link.direction==="UP" || link.direction==="DOWN") && <text x={(link.a.x+link.b.x)/2+6} y={(link.a.y+link.b.y)/2-5} fill="#a1a1aa" fontSize="11">{link.direction==="UP"?"↑":"↓"}</text>}
            </g>
          ))}

          {layout.stubs.map((stub:any)=>(
            <g key={`stub-${stub.id}`}>
              <line x1={stub.x1} y1={stub.y1} x2={stub.x2} y2={stub.y2}
                stroke="#52525b" strokeWidth="3" strokeDasharray="5 5" strokeLinecap="round"/>
              <circle cx={stub.x2} cy={stub.y2} r="4" fill="#71717a"/>
            </g>
          ))}

          {layout.nodes.map((node:any)=>{
            const current=Number(node.id)===Number(currentRoomId);
            const style=roomStyle(node.roomType,current);
            const meta=ROOM_META[node.roomType]??{label:node.roomType,symbol:"?"};
            return (
              <g key={node.id} onClick={()=>setSelectedId(Number(node.id))}
                className="cursor-pointer" tabIndex={0}
                onKeyDown={e=>{if(e.key==="Enter"||e.key===" ")setSelectedId(Number(node.id));}}>
                {current && <circle cx={node.point.x} cy={node.point.y} r="29" fill="none" stroke="#fafafa" strokeOpacity=".3" strokeWidth="2" filter="url(#mazeGlow)"/>}
                <circle cx={node.point.x} cy={node.point.y} r="23" fill={style.fill} stroke={style.stroke} strokeWidth={current?3:2}/>
                <text x={node.point.x} y={node.point.y-2} textAnchor="middle" fill={style.text} fontSize="14" fontWeight="700">{meta.symbol}</text>
                <text x={node.point.x} y={node.point.y+38} textAnchor="middle" fill="#a1a1aa" fontSize="11">#{node.roomNumber}</text>
                {current && <text x={node.point.x} y={node.point.y-38} textAnchor="middle" fill="#fafafa" fontSize="10" fontWeight="700">TÚ</text>}
              </g>
            );
          })}
        </svg>

        {selected && (
          <div className="absolute right-5 top-5 w-64 max-w-[calc(100%-2.5rem)] rounded-xl border border-zinc-700 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">Habitación #{selected.roomNumber}</p>
                <h4 className="mt-1 font-semibold">{ROOM_META[selected.roomType]?.label??selected.roomType}</h4>
              </div>
              <button onClick={()=>setSelectedId(null)} className="text-zinc-500 hover:text-white" aria-label="Cerrar">×</button>
            </div>
            {selected.contentName && <p className="mt-3 text-sm text-zinc-300">{selected.contentName}</p>}
            <p className="mt-2 text-xs text-zinc-500">{selected.status==="BLOCKED"?"Combate pendiente":"Transitable"}</p>
            {Number(selected.id)===Number(currentRoomId) && <p className="mt-2 text-xs font-semibold text-emerald-300">Estás aquí</p>}
            {selected.enemies?.length>0 && <p className="mt-2 text-xs text-red-300">{selected.enemies.length} encuentro(s)</p>}
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800 px-5 py-3 text-xs text-zinc-600">
        Las líneas discontinuas indican salidas todavía no exploradas. Toca una habitación para ver su resumen.
      </div>
    </section>
  );
}
