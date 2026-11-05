"use client";

import {useState} from "react";

type GuideForm={
  name:string;description:string;category:string;effect:readonly unknown[];
  cost:number;duration:string;cooldown:string;
};

const STEPS=[
  {
    title:"Imagina tu habilidad",
    instruction:"Empieza por el nombre y explica qué sucede en el juego. No necesitas saber fórmulas.",
    example:"Ejemplo: «Bola de fuego». Descripción: «Lanzas una esfera de fuego que quema a un enemigo».",
    action:"Completa «Nombre» y «Descripción», arriba del apartado de efectos.",
  },
  {
    title:"Elige qué hace realmente",
    instruction:"La descripción cuenta la historia; el efecto indica lo que el juego puede calcular. Elige una categoría y pulsa «+ Buscar efecto».",
    example:"Para «Bola de fuego»: categoría «Ofensiva», efecto «Daño» y potencia a tu elección. También puedes buscar una mejora, una curación o un efecto narrativo.",
    action:"Añade al menos un efecto. No necesitas tocar los micromódulos para empezar.",
  },
  {
    title:"Decide cómo se utiliza",
    instruction:"Configura el maná por uso, duración, alcance y tiempo de espera. Puedes conservar los valores predeterminados si no los necesitas cambiar.",
    example:"Una técnica sencilla puede gastar 5 de maná y ser instantánea. Si requiere varios turnos de espera, su coste en PCH puede disminuir.",
    action:"Revisa los campos debajo de «Efectos». Pulsa «?» cuando alguno no quede claro.",
  },
  {
    title:"Revisa y termina",
    instruction:"Consulta el botón flotante de PCH para saber cuánto cuesta crearla y qué ajustes influyen. PCH significa Puntos de Creación de Habilidad.",
    example:"Si el personaje no tiene PCH suficientes, simplifica el efecto o cambia los costes de uso. Las habilidades personalizadas pasan por la aprobación correspondiente.",
    action:"Comprueba el nombre, los efectos y el coste; después usa el botón de guardar o solicitar que aparece al final.",
  },
] as const;

export function SkillCreationGuide({form}:{form:GuideForm}){
  const [expanded,setExpanded]=useState(!form.name.trim() && form.effect.length===0);
  const [step,setStep]=useState(0);
  const checks=[
    Boolean(form.name.trim()&&form.description.trim()),
    form.effect.length>0,
    true, // Configuración opcional: no se exige alterar valores predeterminados.
  ];
  return <section aria-label="Tutorial para crear habilidades" className="rounded-xl border border-cyan-700/50 bg-cyan-950/10">
    <button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}
      className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm font-semibold text-cyan-100">
      <span>✦ ¿Primera habilidad? Aprende a crearla paso a paso</span>
      <span aria-hidden="true">{expanded?"−":"+"}</span>
    </button>
    {expanded&&<div className="space-y-3 border-t border-cyan-800/40 p-3 sm:p-4">
      <p className="text-sm text-zinc-300">No hace falta conocer inglés ni fórmulas. Sigue estos cuatro pasos y usa los efectos prediseñados; el constructor avanzado es opcional.</p>
      <div role="group" aria-label="Pasos del tutorial" className="flex flex-wrap gap-2">
        {STEPS.map((item,i)=><button type="button" key={item.title} onClick={()=>setStep(i)}
          aria-current={step===i?"step":undefined}
          className={"rounded-full border px-3 py-1.5 text-xs "+(step===i?"border-cyan-400 bg-cyan-900/40 text-white":"border-zinc-700 text-zinc-300")}>
          {i+1}. {item.title}
        </button>)}
      </div>
      <div className="space-y-2 rounded-lg border border-zinc-700/70 bg-zinc-950/60 p-3" aria-live="polite">
        <h3 className="font-semibold text-cyan-200">Paso {step+1} de {STEPS.length}: {STEPS[step].title}</h3>
        <p className="text-sm text-zinc-200">{STEPS[step].instruction}</p>
        <p className="text-sm text-zinc-400">{STEPS[step].example}</p>
        <p className="text-xs font-medium text-amber-200">Ahora: {STEPS[step].action}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-400">
          {checks[0]?"✓":"○"} Nombre y descripción · {checks[1]?"✓":"○"} Al menos un efecto
        </p>
        <div className="flex gap-2">
          <button type="button" disabled={step===0} onClick={()=>setStep(s=>Math.max(0,s-1))}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-xs disabled:opacity-40">Anterior</button>
          <button type="button" onClick={()=>step===STEPS.length-1?setExpanded(false):setStep(s=>s+1)}
            className="rounded-lg bg-cyan-700 px-3 py-2 text-xs font-semibold text-white">
            {step===STEPS.length-1?"Cerrar tutorial":"Siguiente paso"}
          </button>
        </div>
      </div>
      <p className="text-xs text-zinc-500">Consejo: una habilidad puede tener varios efectos, pero para aprender conviene comenzar con uno solo. Cada efecto influye en el precio.</p>
    </div>}
  </section>;
}
