"use client";

type Persona = {
  id: string;
  name: string;
  tagline: string;
  icon: string;
};

export const PERSONAS: Persona[] = [
  { id: "default", name: "Zeebs", tagline: "Strategist & Closer", icon: "Z" },
  { id: "sales", name: "Sales Pro", tagline: "Deals & Objections", icon: "S" },
  { id: "ops", name: "Ops Architect", tagline: "Systems & Automation", icon: "O" },
  { id: "creative", name: "Creative Director", tagline: "Brand & Content", icon: "C" },
  { id: "empathic", name: "Companion", tagline: "Listen & Reflect", icon: "E" },
];

type PersonaSelectorProps = {
  activePersona: string;
  onSelect: (personaId: string) => void;
};

export function PersonaSelector({ activePersona, onSelect }: PersonaSelectorProps) {
  return (
    <div className="flex items-center gap-1.5">
      {PERSONAS.map((p) => {
        const isActive = activePersona === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            title={`${p.name} — ${p.tagline}`}
            aria-label={`Switch to ${p.name} persona`}
            aria-pressed={isActive}
            className={`
              relative rounded-full px-3 py-1 text-[10px] font-medium tracking-wider
              uppercase transition-all duration-300 whitespace-nowrap
              ${isActive
                ? "text-gold-light bg-gold/10 border border-gold/30 shadow-[0_0_12px_rgba(200,169,126,0.1)]"
                : "text-ivory/35 border border-gold/8 hover:text-ivory/55 hover:border-gold/15 hover:bg-gold/5"
              }
            `}
          >
            <span className="hidden sm:inline">{p.name}</span>
            <span className="sm:hidden">{p.icon}</span>
          </button>
        );
      })}
    </div>
  );
}
