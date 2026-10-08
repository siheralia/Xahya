"use client";

import { useEffect, useState, type CSSProperties } from "react";

type Staff = {
  positionDescription: string | null;
  startTime: string;
  endTime: string;
  character: {
    name: string;
    flair: string | null;
    avatarUrl: string | null;
    themePalette: Record<string, string> | null;
  };
};

export default function CasinoStaffBanner() {
  const [staff, setStaff] = useState<Staff | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/casino/active-staff", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (mounted) setStaff(data?.activeStaff ?? null); })
      .catch(() => { if (mounted) setStaff(null); });
    return () => { mounted = false; };
  }, []);

  if (!staff) return null;
  const theme = staff.character.themePalette;
  const background = theme?.background ?? "#18181b";
  const foreground = theme?.foreground ?? "#ffffff";
  const primary = theme?.primary ?? "#f59e0b";
  const surface = theme?.surface ?? "#27272a";

  return (
    <section className="relative mb-8 overflow-hidden rounded-3xl border shadow-2xl" style={{ borderColor: theme?.border ?? "#3f3f46", backgroundColor: surface, color: foreground } as CSSProperties}>
      {staff.character.avatarUrl && (
        <div className="absolute inset-0">
          <img src={staff.character.avatarUrl} alt="" className="h-full w-full object-cover opacity-35" />
          <div className="absolute inset-0" style={{ backgroundColor: theme?.overlayPrimary ?? primary, opacity: 0.28 }} />
          <div className="absolute inset-0 bg-black/35" />
        </div>
      )}
      <div className="relative flex min-h-[200px] items-end gap-5 p-6">
        {staff.character.avatarUrl && <img src={staff.character.avatarUrl} alt={staff.character.name} className="h-32 w-24 rounded-2xl border-2 object-cover shadow-xl" style={{ borderColor: primary }} />}
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: theme?.accent ?? "#fbbf24" }}>En servicio ahora · Encargado del casino</p>
          <h2 className="mt-2 text-3xl font-bold">{staff.character.name} {staff.character.flair ?? ""}</h2>
          <p className="mt-2 text-sm opacity-70">Turno {staff.startTime}–{staff.endTime}</p>
          {staff.positionDescription && (
            <div className="relative z-10 mt-4 max-w-xl rounded-3xl border px-4 py-3 text-sm shadow-lg" style={{ borderColor: primary, backgroundColor: background, color: foreground }}>
              {staff.positionDescription}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
