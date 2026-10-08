"use client";

import { useEffect, useState, type CSSProperties } from "react";

type Promotion = { id: number; name: string; adjustmentType: "PERCENT" | "FIXED"; adjustmentValue: number };
type Item = {
  id: number;
  name: string;
  description: string | null;
  itemType: string;
  itemSubtype: string | null;
  acquisitionType: string;
  basePrice: number;
  price: number;
  appliedPromotions: Promotion[];
  effects: { type: string; stat?: string; value: number; description?: string }[];
  allowedSlots?: string[];
};
type OwnedItem = { id: number; itemId: number; quantity: number; equipped: boolean; equippedSlot: string | null; flair: string | null; item: Item | null };
type Character = { id: number; name: string; money?: number };
type ActiveStaff = {
  businessId: number;
  businessName: string;
  businessDescription: string | null;
  positionId: number;
  positionTitle: string;
  positionDescription: string | null;
  startTime: string;
  endTime: string;
  character: {
    id: number;
    name: string;
    flair: string | null;
    avatarUrl: string | null;
    themePalette: { primary: string; secondary: string; accent: string; overlayPrimary: string; background: string; surface: string; border: string; foreground: string; muted: string } | null;
  };
};

const typeLabels: Record<string, string> = { WEAPON: "Arma", ARMOR: "Armadura", ACCESSORY: "Accesorio", CONSUMABLE: "Consumible", MATERIAL: "Material", OTHER: "Otro" };
const effectLabels: Record<string, string> = { attack_multiplier_all: "Ataque total", damage_reduction_all: "Reducción de daño recibido", damage_reduction_physical: "Reducción de daño físico recibido", damage_reduction_magical: "Reducción de daño mágico recibido", damage_increase_all: "Aumento de daño recibido", damage_increase_physical: "Aumento de daño físico recibido", damage_increase_magical: "Aumento de daño mágico recibido" };
const subtypeLabels: Record<string, string> = {
  SABRE: "Sable", SWORD: "Espada", BOW: "Arco", DAGGER: "Daga", SPEAR: "Lanza",
  STAFF: "Bastón", AXE: "Hacha", HAMMER: "Martillo", SHIELD: "Escudo",
  GREAT_SWORD: "Mandoble", GREAT_AXE: "Gran hacha", CROSSBOW: "Ballesta",
};
const statLabels: Record<string, string> = { STR:"Fuerza", AGI:"Agilidad", CON:"Constitución", INT:"Inteligencia", WIS:"Sabiduría", CHA:"Carisma", SPI:"Espíritu", LCK:"Suerte", PHYS_ATK:"Ataque físico", MAGIC_ATK:"Ataque mágico", DEF:"Defensa física", MAG_DEF:"Defensa mágica", ATTACK_TOTAL:"Ataque total", DAMAGE_REDUCTION_ALL:"Reducción de daño" };
function getReadableTextColor(background: string | undefined) {
  const hex = String(background ?? "#09090b").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return "#ffffff";
  const channels = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((value) => value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return luminance > 0.45 ? "#18181b" : "#ffffff";
}


export default function StorePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState("");
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<number | null>(null);
  const [selling, setSelling] = useState<number | null>(null);
  const [sellQuantities, setSellQuantities] = useState<Record<number, number>>({});
  const [ownedItems, setOwnedItems] = useState<OwnedItem[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selectedSubtype, setSelectedSubtype] = useState("ALL");
  const [selectedSlot, setSelectedSlot] = useState("ALL");
  const [selectedStat, setSelectedStat] = useState("ALL");
  const [minStatValue, setMinStatValue] = useState("");
  const [sortPrice, setSortPrice] = useState<"NONE" | "ASC" | "DESC">("NONE");
  const [onlyAffordable, setOnlyAffordable] = useState(false);
  const [activeStaff, setActiveStaff] = useState<ActiveStaff[]>([]);

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
      const [itemsResponse, charactersResponse, staffResponse] = await Promise.all([
        fetch("/api/store", { cache: "no-store" }),
        fetch("/api/characters?mine=true", { cache: "no-store" }),
        fetch("/api/store/active-staff", { cache: "no-store" }),
      ]);
      const itemsData = await itemsResponse.json().catch(() => null);
      const charactersData = await charactersResponse.json().catch(() => null);
      const staffData = await staffResponse.json().catch(() => null);
      if (!itemsResponse.ok) throw new Error(itemsData?.error ?? "No se pudo cargar la tienda.");
      if (!charactersResponse.ok) throw new Error(charactersData?.error ?? "No se pudieron cargar tus personajes.");

      const next = Array.isArray(charactersData) ? charactersData : [];
      setItems(Array.isArray(itemsData?.items) ? itemsData.items : []);
      setCharacters(next);

      if (!staffResponse.ok) throw new Error(staffData?.error ?? "No se pudo cargar el personal de la tienda.");
      setActiveStaff(Array.isArray(staffData?.activeStaff) ? staffData.activeStaff : []);

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
  const subtypeOptions = Array.from(new Set(items.map(item => String(item.itemSubtype ?? "").trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"es"));

  const filteredItems = items.filter((item) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || item.name.toLowerCase().includes(q) || String(item.description ?? "").toLowerCase().includes(q);
    const matchesCategory = selectedCategory === "ALL" || item.itemType === selectedCategory;
    const matchesSubtype = selectedSubtype === "ALL" || String(item.itemSubtype ?? "") === selectedSubtype;
    const matchesSlot = selectedSlot === "ALL" || (item.allowedSlots ?? []).includes(selectedSlot);
    const matchesStat = selectedStat === "ALL" || item.effects.some(effect => String(effect.stat ?? "") === selectedStat);
    const min = minStatValue === "" ? null : Number(minStatValue);
    const matchesMin = min === null || selectedStat === "ALL" || item.effects.some(effect => String(effect.stat ?? "") === selectedStat && Number(effect.value) >= min);
    const quantity = Math.max(1, Math.min(99, Number(quantities[item.id] ?? 1)));
    const total = item.price * quantity;
    const matchesAffordable = !onlyAffordable || total <= money;
    return matchesSearch && matchesCategory && matchesSubtype && matchesSlot && matchesStat && matchesMin && matchesAffordable;
  }).sort((a, b) => {
    if (sortPrice === "ASC") return a.price - b.price;
    if (sortPrice === "DESC") return b.price - a.price;
    return 0;
  });

  async function buy(item: Item) {
    const characterId = Number(selectedCharacter);
    const quantity = Math.max(1, Math.min(99, Number(quantities[item.id] ?? 1)));
    if (!characterId) { setError("Selecciona un personaje."); return; }

    setBuying(item.id);
    setError("");
    setSuccess("");

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
    } finally {
      setBuying(null);
    }
  }

  async function sell(entry: OwnedItem) {
    const quantity = Math.max(1, Math.min(entry.quantity, Number(sellQuantities[entry.id] ?? 1)));
    setSelling(entry.id);
    setError("");
    setSuccess("");

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
    } finally {
      setSelling(null);
    }
  }

  if (loading) return <main className="min-h-screen bg-zinc-950 p-12 text-white"><p className="text-[color:var(--store-muted)]">Cargando tienda...</p></main>;

  const currentStaff = activeStaff.find((entry) => entry.positionTitle.toLowerCase() === "encargado de tienda") ?? activeStaff[0] ?? null;
  const theme = currentStaff?.character.themePalette ?? null;
  const readableText = getReadableTextColor(theme?.background);
  const readableMuted = `color-mix(in srgb, ${readableText} 72%, transparent)`;
  const readableSubtle = `color-mix(in srgb, ${readableText} 58%, transparent)`;

  return (
    <main className="min-h-screen text-white transition-colors" style={theme ? { backgroundColor: theme.background, color: readableText, "--store-muted": readableMuted } as CSSProperties : { backgroundColor: "#09090b", "--store-muted": "rgba(255,255,255,.68)" } as CSSProperties}>
      <div className="mx-auto max-w-6xl px-6 py-6">
        {currentStaff && (
          <section className="relative mb-8 overflow-hidden rounded-3xl border shadow-2xl" style={{ borderColor: theme?.border ?? "#3f3f46", backgroundColor: theme?.surface ?? "#18181b" }}>
            {currentStaff.character.avatarUrl && <div className="absolute inset-0"><img src={currentStaff.character.avatarUrl} alt="" className="h-full w-full object-cover opacity-35" /><div className="absolute inset-0" style={{ backgroundColor: theme?.overlayPrimary ?? theme?.primary ?? "#22d3ee", opacity: 0.28 }} /><div className="absolute inset-0 bg-black/35" /></div>}
            <div className="relative flex min-h-[220px] items-end gap-5 p-6">
              {currentStaff.character.avatarUrl && <img src={currentStaff.character.avatarUrl} alt={currentStaff.character.name} className="h-36 w-28 rounded-2xl border-2 object-cover shadow-xl" style={{ borderColor: theme?.primary ?? "#22d3ee" }} />}
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: theme?.accent ?? "#f59e0b" }}>En servicio ahora</p>
                <h2 className="mt-2 text-3xl font-bold">{currentStaff.character.name} {currentStaff.character.flair ?? ""}</h2>
                <p className="mt-2 text-sm opacity-70">Turno {currentStaff.startTime}–{currentStaff.endTime}</p>
                {currentStaff.positionDescription && <div className="relative z-10 -ml-6 mt-4 max-w-xl rounded-3xl border px-4 py-3 text-sm shadow-lg" style={{ borderColor: theme?.primary ?? "#22d3ee", backgroundColor: theme?.background ?? "#09090b", color: readableText }}><span style={{ color: readableText }}>{currentStaff.positionDescription}</span></div>}
              </div>
            </div>
          </section>
        )}

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-4xl font-bold">Tienda</h1><p className="mt-2 text-[color:var(--store-muted)]">Compra y vende objetos con el dinero de tu personaje.</p></div>
          <div className="min-w-[260px]"><label className="text-sm text-[color:var(--store-muted)]">Personaje</label><select value={selectedCharacter} onChange={(event) => setSelectedCharacter(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white">{characters.length === 0 ? <option value="">Sin personajes</option> : characters.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></div>
        </div>

        <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm">Dinero disponible: <span className="font-semibold text-amber-300">◈ {money.toLocaleString("es-MX")}</span></div>
        {error && <div className="mt-5 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}
        {success && <div className="mt-5 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-emerald-300">{success}</div>}

        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-bold">Comprar</h2>
            <div className="flex flex-wrap gap-2">
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar objeto..." className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white" />
              <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white"><option value="ALL">Todas las categorías</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <select value={selectedSubtype} onChange={e=>setSelectedSubtype(e.target.value)} className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white"><option value="ALL">Todos los tipos</option>{subtypeOptions.map(v=><option key={v} value={v}>{subtypeLabels[v] ?? v}</option>)}</select>
              <select value={sortPrice} onChange={e=>setSortPrice(e.target.value as "NONE" | "ASC" | "DESC")} className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white"><option value="NONE">Precio: sin ordenar</option><option value="ASC">Precio: menor a mayor</option><option value="DESC">Precio: mayor a menor</option></select>
              <label className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2.5 text-sm text-white"><input type="checkbox" checked={onlyAffordable} onChange={e=>setOnlyAffordable(e.target.checked)} /> Solo puedo comprar</label>
              <select value={selectedSlot} onChange={e=>setSelectedSlot(e.target.value)} className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white"><option value="ALL">Todos los slots</option>{["MAIN_HAND","OFF_HAND","HEAD","BODY","ARMS","FEET","BACK","ACCESSORY_1","ACCESSORY_2"].map(v=><option key={v} value={v}>{v}</option>)}</select>
              <select value={selectedStat} onChange={e=>setSelectedStat(e.target.value)} className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white"><option value="ALL">Todas las stats</option>{Object.entries(statLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select>
              <input type="number" value={minStatValue} onChange={e=>setMinStatValue(e.target.value)} placeholder="Mínimo" className="w-24 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white" />
              <button type="button" onClick={()=>{setSearch("");setSelectedCategory("ALL");setSelectedSubtype("ALL");setSelectedSlot("ALL");setSelectedStat("ALL");setMinStatValue("");setSortPrice("NONE");setOnlyAffordable(false);}} className="rounded-xl border border-zinc-700 px-3 py-2.5 text-sm text-[color:var(--store-muted)]">Limpiar</button>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="mt-4 rounded-2xl border p-8 text-center" style={{ borderColor: theme?.border ?? "#3f3f46", backgroundColor: theme?.surface ?? "#18181b" }}><p className="text-[color:var(--store-muted)]">No hay objetos disponibles para comprar.</p></div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredItems.map((item) => {
                const quantity = Math.max(1, Math.min(99, Number(quantities[item.id] ?? 1)));
                const total = item.price * quantity;
                const discounted = item.price !== item.basePrice;
                return (
                  <article key={item.id} className="rounded-2xl border p-5" style={{ borderColor: theme?.border ?? "#3f3f46", backgroundColor: theme?.surface ?? "#18181b" }}>
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="text-lg font-semibold" style={{ color: theme?.foreground ?? "#ffffff" }}>{item.name}</p><p className="mt-1 text-xs text-[color:var(--store-muted)]">{typeLabels[item.itemType] ?? item.itemType}{item.itemSubtype ? " · " + (subtypeLabels[item.itemSubtype] ?? item.itemSubtype) : ""}</p></div>
                      <div className="text-right">
                        {discounted && <p className="text-xs text-[color:var(--store-muted)] line-through">◈ {item.basePrice.toLocaleString("es-MX")}</p>}
                        <span className={"text-sm font-semibold " + (discounted ? "text-emerald-300" : "text-amber-300")}>◈ {item.price.toLocaleString("es-MX")}</span>
                      </div>
                    </div>
                    {item.appliedPromotions.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{item.appliedPromotions.map((promotion) => <span key={promotion.id} className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300">{promotion.name}</span>)}</div>}
                    {item.description && <p className="mt-4 text-sm" style={{ color: readableSubtle }}>{item.description}</p>}
                    {item.effects.length > 0 && <div className="mt-4 space-y-1" style={{ color: readableSubtle }}>{item.effects.map((effect, index) => <p key={index} className="text-xs" style={{ color: readableSubtle }}>{effect.description || effectLabels[effect.type] || effect.type}: {effect.type.includes("multiplier") ? "×" + effect.value / 100 : effect.value}</p>)}</div>}
                    <div className="mt-5 flex gap-2">
                      <input type="number" min={1} max={99} value={quantity} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: Math.max(1, Math.min(99, Number(event.target.value) || 1)) }))} className="w-20 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-center" />
                      <button type="button" onClick={() => buy(item)} disabled={buying !== null || selling !== null || !selectedCharacter || total > money} className="flex-1 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40">{buying === item.id ? "Comprando..." : "Comprar · ◈ " + total.toLocaleString("es-MX")}</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold">Vender</h2>
          <p className="mt-1 text-sm text-[color:var(--store-muted)]">Los objetos comprables se venden por la mitad de su precio base. Las promociones de compra no modifican el valor de reventa.</p>
          {ownedItems.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 text-center"><p className="text-[color:var(--store-muted)]">Este personaje no tiene objetos para vender.</p></div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ownedItems.map((entry) => {
                const item = entry.item;
                const saleValue = item && String(item.acquisitionType) === "PURCHASABLE" && Number(item.price) > 0
                  ? Math.max(1, Math.floor(Number(item.price) / 2))
                  : 1;
                const total = saleValue * entry.quantity;
                const sellQuantity = Math.max(1, Math.min(entry.quantity, Number(sellQuantities[entry.id] ?? 1)));
                return (
                  <article key={entry.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
                    <div className="flex items-start justify-between gap-3"><div><p className="text-lg font-semibold" style={{ color: theme?.foreground ?? "#ffffff" }}>{item?.name ?? "Objeto"}</p><p className="mt-1 text-xs text-[color:var(--store-muted)]">{entry.equipped ? "Equipado" : "En inventario"}{entry.flair ? " · " + entry.flair : ""}</p></div><span className="text-sm font-semibold text-emerald-300">◈ {saleValue.toLocaleString("es-MX")} c/u</span></div>
                    <p className="mt-3 text-xs" style={{ color: readableSubtle }}>Cantidad disponible: <span style={{ color: theme?.foreground ?? "#ffffff" }}>{entry.quantity}</span></p>
                    <div className="mt-3 flex gap-2">
                      <input type="number" min={1} max={entry.quantity} value={sellQuantity} onChange={(event) => setSellQuantities((current) => ({ ...current, [entry.id]: Math.max(1, Math.min(entry.quantity, Number(event.target.value) || 1)) }))} className="w-20 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-center" />
                      <button type="button" onClick={() => sell(entry)} disabled={selling !== null || buying !== null} className="flex-1 rounded-lg border border-emerald-900/70 px-3 py-2 text-sm text-emerald-300 disabled:opacity-40">{selling === entry.id ? "Vendiendo..." : "Vender · ◈ " + (saleValue * sellQuantity).toLocaleString("es-MX")}</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
