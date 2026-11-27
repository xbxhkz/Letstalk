import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { EFFECTS, FILTERS, FILTER_CATEGORIES, PARTICLES, filterById, type FilterCategory } from "./filters";
import { Compositor, DEFAULT_LOOK, drawCover, type Look } from "./compositor";

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

/**
 * Filter picker: category tabs plus live previews of the current frame through every filter (rendered a
 * few per animation frame so the sheet opens instantly). Falls back to colour swatches.
 */
export function FilterStrip({ look, onChange, source }: { look: Look; onChange: (l: Look) => void; source?: HTMLCanvasElement | HTMLVideoElement | null }) {
  const [cat, setCat] = useState<FilterCategory>(() => (look.filter === "none" ? "Trending" : filterById(look.filter).category));
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!source) return;
    const snap = document.createElement("canvas");
    snap.width = 180;
    snap.height = 320;
    const sctx = snap.getContext("2d")!;
    if (!drawCover(sctx, source, false)) return;
    const comp = new Compositor(undefined, [90, 160]);
    const done: Record<string, string> = {};
    let i = 0;
    let raf = 0;
    const step = () => {
      for (let k = 0; k < 4 && i < FILTERS.length; k++, i++) {
        const f = FILTERS[i];
        if (comp.render(snap, { ...DEFAULT_LOOK, filter: f.id }, [], 0)) done[f.id] = comp.out.toDataURL("image/jpeg", 0.75);
      }
      setThumbs({ ...done });
      if (i < FILTERS.length) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [source]);

  const list = FILTERS.filter((f) => f.id === "none" || f.category === cat);
  return (
    <div className="space-y-3">
      <div className="no-scrollbar flex gap-2 overflow-x-auto text-xs font-semibold">
        {FILTER_CATEGORIES.map((c) => (
          <button key={c} type="button" onClick={() => setCat(c)} className={`shrink-0 rounded-full px-3 py-1 ${cat === c ? "bg-white text-black" : "bg-white/10 text-white/80"}`}>{c}</button>
        ))}
      </div>
      <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-1">
        {list.map((f) => (
          <button key={f.id} type="button" onClick={() => onChange({ ...look, filter: f.id })} aria-pressed={look.filter === f.id} className="flex w-14 shrink-0 flex-col items-center gap-1 text-[11px]">
            {thumbs[f.id] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbs[f.id]} alt="" className={`h-20 w-14 rounded-lg object-cover ring-2 ${look.filter === f.id ? "ring-white" : "ring-transparent"}`} />
            ) : (
              <span className={`h-20 w-14 rounded-lg ring-2 ${look.filter === f.id ? "ring-white" : "ring-transparent"}`} style={{ background: f.swatch }} />
            )}
            <span className={`w-full truncate text-center ${look.filter === f.id ? "font-semibold text-white" : "text-white/70"}`}>{f.name}</span>
          </button>
        ))}
      </div>
      {look.filter !== "none" && <Slider label="Intensity" value={look.intensity} onChange={(v) => onChange({ ...look, intensity: v })} />}
    </div>
  );
}

type GridItem<T extends string> = { id: T; name: string; icon: string };

/** Scrollable 5-column grid of effect tiles (TikTok's effects tray). */
export function IconGrid<T extends string>({ items, selected, onPick, loading, label }: { items: GridItem<T>[]; selected: T; onPick: (id: T) => void; loading?: T | null; label?: string }) {
  return (
    <div>
      {label && <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/50">{label}</p>}
      <div className="grid max-h-[34vh] grid-cols-5 gap-x-2 gap-y-3 overflow-y-auto pb-2">
        {items.map((e) => (
          <button key={e.id} type="button" onClick={() => onPick(e.id)} aria-pressed={selected === e.id} className="flex flex-col items-center gap-1 text-[11px] leading-tight">
            <span className={`flex aspect-square w-full max-w-14 items-center justify-center rounded-xl bg-white/10 text-2xl ring-2 ${selected === e.id ? "ring-white" : "ring-transparent"}`}>
              {loading === e.id ? <Loader2 className="h-5 w-5 animate-spin" /> : e.icon}
            </span>
            <span className={`line-clamp-2 text-center ${selected === e.id ? "font-semibold text-white" : "text-white/70"}`}>{e.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function EffectStrip({ look, onChange }: { look: Look; onChange: (l: Look) => void }) {
  return <IconGrid items={EFFECTS} selected={look.effect} onPick={(id) => onChange({ ...look, effect: id })} />;
}

export function ParticleStrip({ look, onChange }: { look: Look; onChange: (l: Look) => void }) {
  return <IconGrid items={PARTICLES} selected={look.particles} onPick={(id) => onChange({ ...look, particles: id })} />;
}
