export type CasinoSegment = {
  label: string;
  weight: number;
  multiplier: number;
  color: string;
};

export type CasinoSet = {
  id: string;
  name: string;
  description: string;
  houseEdgeLabel: string;
  segments: readonly CasinoSegment[];
};

const classicColors = [
  "#111111", "#b91c1c", "#171717", "#991b1b",
  "#27272a", "#dc2626", "#111111", "#b91c1c",
  "#18181b", "#7f1d1d", "#050505", "#a16207",
];

const balancedColors = [
  "#18181b", "#be123c", "#7c2d12", "#18181b",
  "#9f1239", "#27272a", "#18181b", "#a16207",
  "#27272a", "#18181b", "#050505", "#166534",
];

export const CASINO_SETS: readonly CasinoSet[] = [
  {
    id: "classic",
    name: "Clásico",
    description: "Configuración actual, conservada para poder volver a ella.",
    houseEdgeLabel: "≈ -10.4% base / ≈ -30.2% con Suerte 0",
    segments: [
      { label: "0", weight: 100, multiplier: -1, color: classicColors[0] },
      { label: "+10%", weight: 80, multiplier: 0.1, color: classicColors[1] },
      { label: "0", weight: 100, multiplier: -1, color: classicColors[2] },
      { label: "+50%", weight: 60, multiplier: 0.5, color: classicColors[3] },
      { label: "0", weight: 100, multiplier: -1, color: classicColors[4] },
      { label: "+100%", weight: 40, multiplier: 1, color: classicColors[5] },
      { label: "0", weight: 20, multiplier: -1, color: classicColors[6] },
      { label: "+150%", weight: 30, multiplier: 1.5, color: classicColors[7] },
      { label: "+200%", weight: 20, multiplier: 2, color: classicColors[8] },
      { label: "+500%", weight: 10, multiplier: 5, color: classicColors[9] },
      { label: "-100%", weight: 1, multiplier: -2, color: classicColors[10] },
      { label: "+1000%", weight: 5, multiplier: 10, color: classicColors[11] },
    ],
  },
  {
    id: "balanced",
    name: "Estilizado · -4%",
    description: "Margen cercano a -4%, con los cuatro 0 distribuidos uniformemente.",
    houseEdgeLabel: "≈ -4.0% base",
    segments: [
      { label: "0", weight: 70, multiplier: -1, color: balancedColors[0] },
      { label: "+10%", weight: 65.43, multiplier: 0.1, color: balancedColors[1] },
      { label: "+50%", weight: 60, multiplier: 0.5, color: balancedColors[2] },
      { label: "0", weight: 70, multiplier: -1, color: balancedColors[3] },
      { label: "+100%", weight: 40, multiplier: 1, color: balancedColors[4] },
      { label: "+150%", weight: 30, multiplier: 1.5, color: balancedColors[5] },
      { label: "0", weight: 70, multiplier: -1, color: balancedColors[6] },
      { label: "+200%", weight: 20, multiplier: 2, color: balancedColors[7] },
      { label: "+500%", weight: 10, multiplier: 5, color: balancedColors[8] },
      { label: "0", weight: 70, multiplier: -1, color: balancedColors[9] },
      { label: "-100%", weight: 1, multiplier: -2, color: balancedColors[10] },
      { label: "+1000%", weight: 5, multiplier: 10, color: balancedColors[11] },
    ],
  },
];

export function getCasinoSet(id: string | null | undefined): CasinoSet {
  return CASINO_SETS.find((set) => set.id === id) ?? CASINO_SETS[0];
}

export function getCasinoExpectedReturn(set: CasinoSet, luck = 10) {
  const safeLuck = Number.isFinite(luck) ? Math.max(0, luck) : 0;
  const adjusted = set.segments.map((segment) => {
    let weight = segment.weight;
    if (safeLuck < 10) {
      const penalty = Math.min(0.2, (10 - safeLuck) * 0.02);
      if (segment.multiplier === -1) weight *= 1 + penalty;
      else if (segment.multiplier > 0) weight *= 1 - penalty;
    } else if (safeLuck > 20) {
      const bonus = Math.min(0.08, (safeLuck - 20) * 0.008);
      if (segment.multiplier > 0) weight *= 1 + bonus;
      else if (segment.multiplier === -1) weight *= 1 - bonus;
    }
    return { weight: Math.max(0, weight), multiplier: segment.multiplier };
  });
  const total = adjusted.reduce((sum, item) => sum + item.weight, 0);
  return total ? adjusted.reduce((sum, item) => sum + item.weight * item.multiplier, 0) / total : 0;
}
