"use client";

import { useEffect, useState } from "react";

type Layer = { id: string; imageUrl: string; position: string; width: number; opacity: number; animation: string };
const positions: Record<string, React.CSSProperties> = {
  "top-left": { top: "var(--xahya-nav-height, 110px)", left: 0 },
  "top-right": { top: "var(--xahya-nav-height, 110px)", right: 0 },
  "bottom-left": { bottom: 0, left: 0 },
  "bottom-right": { bottom: 0, right: 0 },
};
export default function SeasonalAmbientation() {
  const [layers, setLayers] = useState<Layer[]>([]);
  useEffect(() => {
    let active = true;
    fetch("/api/ambientations", { cache: "no-store" }).then(r => r.json())
      .then(data => { if (active) setLayers(Array.isArray(data.layers) ? data.layers : []); })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  return <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
    {layers.filter(l => /^https:\/\//.test(l.imageUrl) && positions[l.position]).map(layer =>
      <img key={layer.id} src={layer.imageUrl} alt="" draggable={false}
        className={"absolute select-none seasonal-" + (["float","swing","pulse","fall"].includes(layer.animation) ? layer.animation : "none")}
        style={{ ...positions[layer.position], width: Math.min(360, Math.max(30, Number(layer.width) || 120)), maxWidth: "35vw", opacity: Math.min(1, Math.max(0, Number(layer.opacity) / 100 || 0.8)) }} />
    )}
    <style jsx>{`
      @keyframes seasonal-float { 50% { transform: translateY(-12px); } }
      @keyframes seasonal-swing { 50% { transform: rotate(7deg); } }
      @keyframes seasonal-pulse { 50% { opacity: .45; } }
      @keyframes seasonal-fall { 50% { transform: translateY(24px); } }
      .seasonal-float { animation: seasonal-float 5s ease-in-out infinite; }
      .seasonal-swing { transform-origin: top center; animation: seasonal-swing 4s ease-in-out infinite; }
      .seasonal-pulse { animation: seasonal-pulse 3s ease-in-out infinite; }
      .seasonal-fall { animation: seasonal-fall 7s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) { img { animation: none !important; } }
    `}</style>
  </div>;
}
