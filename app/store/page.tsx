"use client";

import { useEffect, useState } from "react";

type Item = { id: number; name: string; description: string | null; itemType: string; acquisitionType: string; price: number; effects: { type: string; value: number; description?: string }[] };
type OwnedItem = { id: number; itemId: number; quantity: number; equipped: boolean; equippedSlot: string | null; flair: string | null; item: Item | null };
type Character = { id: number; name: string; money?: number };

const typeLabels: Record<string, string> = { WEAPON: "Arma", ARMOR: "Armadura", ACCESSORY: "Accesorio", CONSUMABLE: "Consumible", MATERIAL: "Material", OTHER: "Otro" };
const effectLabels: Record<string, string> = { attack_multiplier_all: "Ataque total", damage_reduction_all: "Reducción de daño recibido" };

export default function StorePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState("");
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<number | null>(null);
  const [selling, setSelling] = useState<number | null>(null);
  const [ownedItems, setOwnedItems] = useState<OwnedItem[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadOwnedItems(characterId: number) {
    if (!characterId) { setOwnedItems([]); return; }
    const response = await fetch("/api/characters/" + characterId, { cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ?? "No se pudo cargar el inventario.");
    setOwnedItems(Array.isArray(data?.equipment) ? data.equipment : []);
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [itemsResponse, charactersResponse] = await Promise.all([
        fetch("/api/store", { cache: "no-store" }),
        fetch("/api/characters", { cache: "no-store" }),
      ]);
      const itemsData = await itemsResponse.json().catch(() => null);
      const charactersData = await charactersResponse.json().catch(() => null);
      if (!itemsResponse.ok) throw new Error(itemsData?.error ?? "No se pudo cargar la tienda.");
      if (!charactersResponse.ok) throw new Error(charactersData?.error ?? "No se pudieron cargar tus personajes.");
      const next = Array.isArray(charactersData) ? charactersData : [];
      setItems(Array.isArray(itemsData?.items) ? itemsData.items : []);
      setCharacters(next);
      const nextCharacterId = selectedCharacter || (next.length ? String(next[0].id) : "");
      if (!selectedCharacter && next.length) setSelectedCharacter(nextCharacterId);
      await loadOwnedItems(Number(nextCharacterId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la tienda.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!selectedCharacter) { setOwnedItems([]); return; }
    loadOwnedItems(Number(selectedCharacter)).catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar el inventario."));
  }, [selectedCharacter]);

  const character = characters.find((entry) => String(entry.id) === selectedCharacter);
  const money = Number(character?.money ?? 0);

  async function buy(item: Item) {
    const characterId = Number(selectedCharacter);
    const quantity = Math.max(1, Math.min(99, Number(quantities[item.id] ?? 1)));
    if (!characterId) { setError("Selecciona un personaje."); return; }
    setBuying(item.id); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/store/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, itemId: item.id, quantity }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo completar la compra.");
      setSuccess("Compraste " + quantity + " × " + item.name + " para " + (character?.name ?? "tu personaje") + ".");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la compra.");
    } finally { setBuying(null); }
  }

  async function sell(entry: OwnedItem) {
    const quantity = entry.quantity;
    setSelling(entry.id); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/store/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterItemId: entry.id, quantity }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo vender el objeto.");
      setSuccess("Vendiste " + quantity + " × " + (entry.item?.name ?? "objeto") + " por ◈ " + Number(data.total ?? 0).toLocaleString("es-MX") + ".");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo vender el objeto.");
    } finally { setSelling(null); }
  }

  if (loading) return <main className="min-h-screen bg-zinc-950 p-12 text-white"><p className="text-zinc-500">Cargando tienda...</p></main>;

  return <main className="min-h-screen bg-zinc-950 text-white"><div className="mx-auto max-w-6xl px-6 py-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-4xl font-bold">Tienda</h1><p className="mt-2 text-zinc-500">Compra y vende objetos con el dinero de tu personaje.</p></div>
      <div className="min-w-[260px]"><label className="text-sm text-zinc-500">Personaje</label><select value={selectedCharacter} onChange={(event) => setSelectedCharacter(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white">{characters.length === 0 ? <option value="">Sin personajes</option> : characters.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></div>
    </div>
    <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm">Dinero disponible: <span className="font-semibold text-amber-300">◈ {money.toLocaleString("es-MX")}</span></div>
    {error && <div className="mt-5 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}
    {success && <div className="mt-5 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-emerald-300">{success}</div>}

    <section className="mt-8">
      <h2 className="text-2xl font-bold">Comprar</h2>
      {items.length === 0 ? <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 text-center"><p className="text-zinc-500">No hay objetos disponibles para comprar.</p></div> :
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => {
          const quantity = Math.max(1, Math.min(99, Number(quantities[item.id] ?? 1))), total = item.price * quantity;
          return <article key={item.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <div className="flex items-start justify-between gap-3"><div><p className="text-lg font-semibold">{item.name}</p><p className="mt-1 text-xs text-zinc-500">{typeLabels[item.itemType] ?? item.itemType}</p></div><span className="text-sm font-semibold text-amber-300">◈ {item.price.toLocaleString("es-MX")}</span></div>
            {item.description && <p className="mt-4 text-sm text-zinc-400">{item.description}</p>}
            {item.effects.length > 0 && <div className="mt-4 space-y-1">{item.effects.map((effect, index) => <p key={index} className="text-xs text-zinc-500">{effect.description || effectLabels[effect.type] || effect.type}: {effect.type.includes("multiplier") ? "×" + effect.value / 100 : effect.value}</p>)}</div>}
            <div className="mt-5 flex gap-2"><input type="number" min={1} max={99} value={quantity} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: Math.max(1, Math.min(99, Number(event.target.value) || 1)) }))} className="w-20 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-center" />
              <button type="button" onClick={() => buy(item)} disabled={buying !== null || selling !== null || !selectedCharacter || total > money} className="flex-1 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40">{buying === item.id ? "Comprando..." : "Comprar · ◈ " + total.toLocaleString("es-MX")}</button>
            </div>
          </article>;
        })}</div>}
    </section>

    <section className="mt-10">
      <h2 className="text-2xl font-bold">Vender</h2>
      <p className="mt-1 text-sm text-zinc-500">Los objetos comprables se venden por la mitad de su precio. Los objetos que no se venden tienen valor de ◈1.</p>
      {ownedItems.length === 0 ? <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 text-center"><p className="text-zinc-500">Este personaje no tiene objetos para vender.</p></div> :
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{ownedItems.map((entry) => {
          const item = entry.item;
          const saleValue = item && item.acquisitionType === "PURCHASABLE" && item.price > 0 ? Math.max(1, Math.floor(item.price / 2)) : 1;
          const total = saleValue * entry.quantity;
          return <article key={entry.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <div className="flex items-start justify-between gap-3"><div><p className="text-lg font-semibold">{item?.name ?? "Objeto"}</p><p className="mt-1 text-xs text-zinc-500">{entry.equipped ? "Equipado" : "En inventario"}{entry.flair ? " · " + entry.flair : ""}</p></div><span className="text-sm font-semibold text-emerald-300">◈ {saleValue.toLocaleString("es-MX")} c/u</span></div>
            <p className="mt-3 text-xs text-zinc-500">Cantidad: {entry.quantity} · Total: ◈ {total.toLocaleString("es-MX")}</p>
            <button type="button" onClick={() => sell(entry)} disabled={selling !== null || buying !== null} className="mt-4 w-full rounded-lg border border-emerald-900/70 px-3 py-2 text-sm text-emerald-300 disabled:opacity-40">{selling === entry.id ? "Vendiendo..." : "Vender todo · ◈ " + total.toLocaleString("es-MX")}</button>
          </article>;
        })}</div>}
    </section>
  </div></main>;
}
