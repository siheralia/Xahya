"use client";

import { ReactNode, useEffect } from "react";

type ManagementModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
};

export default function ManagementModal({
  open,
  title,
  onClose,
  children,
  maxWidth = "max-w-3xl",
}: ManagementModalProps) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="xahya-modal-overlay flex items-start justify-center bg-black/70 p-4 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="management-modal-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={"my-auto w-full " + maxWidth}>
        <div className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl sm:max-h-[calc(100vh-4rem)]">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-950/95 px-5 py-4 backdrop-blur">
            <h2 id="management-modal-title" className="text-xl font-semibold text-white">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
          <div className="p-5">{children}</div>
        </div>
      </div>
    </div>
  );
}
