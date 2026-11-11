import type {ActiveCombatStatusView} from "@/lib/combat/active-status-summary";

/**
 * Purely presentational. Always uses the server-authored combat snapshot, never
 * the character sheet or an editor-supplied modular effect definition.
 */
export default function CombatActiveStatusPanel({
 own,opponent,ownName,opponentName,
}:{
 own:readonly ActiveCombatStatusView[];
 opponent:readonly ActiveCombatStatusView[];
 ownName:string;opponentName:string;
}){
 const total=own.length+opponent.length;
 const groups=[
  {id:"own",title:ownName,items:own},
  {id:"opponent",title:opponentName,items:opponent},
 ];
 return <section className="mt-4 min-w-0 space-y-3 rounded-xl border border-zinc-700 p-3"
  aria-label="Efectos temporales activos">
  <h3 className="text-sm font-semibold text-cyan-200">Efectos temporales activos · {total}</h3>
  <p className="text-xs text-zinc-400">
   Solo se muestran efectos vigentes de este encuentro. Caducan al comenzar la
   ronda indicada; no modifican las estadísticas permanentes.
  </p>
  <div className="grid min-w-0 gap-3 sm:grid-cols-2">
   {groups.map(group=><section key={group.id} className="min-w-0 space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/30 p-2"
    aria-label={"Estados de "+group.title}>
    <h4 className="break-words text-xs font-bold text-zinc-100">
     {group.title} · {group.items.length}
    </h4>
    {group.items.length===0?
     <p className="text-xs text-zinc-500">Sin modificadores temporales.</p>:
     <ul className="space-y-2">
      {group.items.map(status=><li key={status.id}
        className={"min-w-0 rounded-lg border p-2.5 text-xs "+
         (status.tone==="DEBUFF"
          ?"border-rose-700/50 bg-rose-950/20"
          :"border-emerald-700/50 bg-emerald-950/20")}>
       <p className={"font-bold "+(status.tone==="DEBUFF"?"text-rose-200":"text-emerald-200")}>
        {status.tone==="DEBUFF"?"Perjudicial":"Beneficioso"}
       </p>
       <p className="mt-1 break-words font-semibold text-zinc-100">{status.description}</p>
       <p className="mt-1 break-words text-zinc-300">Origen: {status.source}</p>
       <p className="mt-1 break-words text-zinc-400">
        Caduca al comenzar la ronda {status.expiresAtRound}
        {" "}({status.remainingRounds} {status.remainingRounds===1?"ronda":"rondas"} restante{status.remainingRounds===1?"":"s"}).
       </p>
      </li>)}
     </ul>}
   </section>)}
  </div>
 </section>;
}
