import type { ReactNode } from "react";
import { EFFECTS, FILTERS } from "./filters";
import type { Look } from "./compositor";

export function RailButton({ icon, label, onClick, active = false, disabled = false }: { icon: ReactNode; label: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={`flex w-14 flex-col items-center gap-0.5 text-[11px] font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)] disabled:opacity-40 ${active ? "text-brand-cyan" : "text-white"}`}
    >
      <span className="flex h-9 w-9 items-center justify-center">{icon}</span>
      {label}
    </button>
  );
}

export function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01, format }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; format?: (v: number) => string }) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-20 shrink-0 text-white/80">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1 flex-1 accent-brand" />
      <span className="w-10 text-right tabular-nums text-white/70">{format ? format(value) : `${Math.round(value * 100)}`}</span>
    </label>
  );
}

/** Bottom sheet used for every studio panel. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-40 animate-slideUp rounded-t-2xl bg-black/85 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-md">
      <div className="relative flex h-11 items-center justify-center text-sm font-semibold">
        {title}
        <button type="button" onClick={onClose} className="absolute right-3 rounded-full px-3 py-1 text-sm font-semibold text-brand-cyan">
          Done
        </button>
      </div>
      <div className="px-3">{children}</div>
    </div>
  );
}

export function FilterStrip({ look, onChange }: { look: Look; onChange: (l: Look) => void }) {
  return (
    <div className="space-y-3">
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" onClick={() => onChange({ ...look, filter: f.id })} className="flex w-14 shrink-0 flex-col items-center gap-1 text-[11px]">
            <span className={`h-14 w-14 rounded-xl ring-2 ${look.filter === f.id ? "ring-white" : "ring-transparent"}`} style={{ background: f.swatch }} />
            <span className={look.filter === f.id ? "font-semibold text-white" : "text-white/70"}>{f.name}</span>
          </button>
        ))}
      </div>
      {look.filter !== "none" && <Slider label="Intensity" value={look.intensity} onChange={(v) => onChange({ ...look, intensity: v })} />}
    </div>
  );
}

export function EffectStrip({ look, onChange }: { look: Look; onChange: (l: Look) => void }) {
  return (
    <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
      {EFFECTS.map((e) => (
        <button key={e.id} type="button" onClick={() => onChange({ ...look, effect: e.id })} className="flex w-14 shrink-0 flex-col items-center gap-1 text-[11px]">
          <span className={`flex h-14 w-14 items-center justify-center rounded-xl bg-white/10 text-2xl ring-2 ${look.effect === e.id ? "ring-white" : "ring-transparent"}`}>{e.icon}</span>
          <span className={look.effect === e.id ? "font-semibold text-white" : "text-white/70"}>{e.name}</span>
        </button>
      ))}
    </div>
  );
}
