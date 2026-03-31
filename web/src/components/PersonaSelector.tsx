"use client";

import { useCallback, useState } from "react";

type Persona = {
  id: string;
  name: string;
  tagline: string;
};

export const PERSONAS: Persona[] = [
  { id: "default", name: "Zeebs", tagline: "Strategist & Closer" },
  { id: "sales", name: "Sales Pro", tagline: "Deals & Objections" },
  { id: "ops", name: "Ops Architect", tagline: "Systems & Automation" },
  { id: "creative", name: "Creative Director", tagline: "Brand & Content" },
  { id: "empathic", name: "Companion", tagline: "Listen & Reflect" },
];

type PersonaSelectorProps = {
  onSelect: (personaId: string) => void;
};

export function PersonaSelector({ onSelect }: PersonaSelectorProps) {
  const [active, setActive] = useState("default");

  const handleSelect = useCallback(
    (persona: Persona) => {
      setActive(persona.id);
      onSelect(persona.id);
    },
    [onSelect],
  );

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {PERSONAS.map((p) => (
        <button
          key={p.id}
          onClick={() => handleSelect(p)}
          title={p.tagline}
          className="rounded-full px-3.5 py-1.5 text-[11px] font-medium tracking-wide transition-all duration-300"
          style={
            active === p.id
              ? {
                  color: "#E2C69D",
                  background: "rgba(200, 169, 126, 0.12)",
                  border: "1px solid rgba(200, 169, 126, 0.3)",
                  boxShadow: "0 0 12px rgba(200, 169, 126, 0.1)",
                }
              : {
                  color: "rgba(244, 240, 234, 0.35)",
                  background: "transparent",
                  border: "1px solid rgba(200, 169, 126, 0.08)",
                }
          }
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}
