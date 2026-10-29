"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type Layer = { id: string; imageUrl: string; position: string; width: number; opacity: number; animation: string; mirror?: boolean };
const positions: Record<string, React.CSSProperties> = {
  "top-left": { top: 0, left: 0 },
  "top-right": { top: 0, right: 0 },
  "bottom-left": { bottom: 0, left: 0 },
  "bottom-right": { bottom: 0, right: 0 },
};
export default function SeasonalAmbientation() {
  const [layers, setLayers] = useState<Layer[]>([]);
  const pathname = usePathname();
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/ambientations", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (active) setLayers(Array.isArray(data.layers) ? data.layers : []);
      } catch {
        // Keep the last known decoration if the network is temporarily unavailable.
      }
    };
    void refresh();
    const onUpdated = () => { void refresh(); };
    window.addEventListener("ambientations-updated", onUpdated);
    return () => {
      active = false;
      window.removeEventListener("ambientations-updated", onUpdated);
    };
  }, [pathname]);
  return <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[1100] overflow-hidden">
    {layers.filter(l => /^(https:\/\/|\/ambientations\/)/.test(l.imageUrl) && positions[l.position]).map(layer =>
      <img key={layer.id} src={layer.imageUrl} alt="" draggable={false}
        className={"absolute select-none seasonal-" + (["float","swing","pulse","fall"].includes(layer.animation) ? layer.animation : "none")}
        style={{ ...positions[layer.position], transform: layer.mirror ? "scaleX(-1)" : undefined, width: Math.min(360, Math.max(30, Number(layer.width) || 120)), maxWidth: "35vw", opacity: Math.min(1, Math.max(0, Number(layer.opacity) / 100)) }} />
    )}
    <style jsx>{`
      @keyframes seasonal-float { 50% { translate: 0 -12px; } }
      @keyframes seasonal-swing { 50% { rotate: 7deg; } }
      @keyframes seasonal-pulse { 50% { opacity: .45; } }
      @keyframes seasonal-fall { 50% { translate: 0 24px; } }
      .seasonal-float { animation: seasonal-float 5s ease-in-out infinite; }
      .seasonal-swing { transform-origin: top center; animation: seasonal-swing 4s ease-in-out infinite; }
      .seasonal-pulse { animation: seasonal-pulse 3s ease-in-out infinite; }
      .seasonal-fall { animation: seasonal-fall 7s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) { img { animation: none !important; } }
    `}</style>
  </div>;
}
