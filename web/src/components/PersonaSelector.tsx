"use client";

import { useCallback, useState } from "react";

type Persona = {
  id: string;
  name: string;
  prompt: string;
};

const PERSONAS: Persona[] = [
  {
    id: "default",
    name: "Assistant",
    prompt:
      "You are a helpful voice assistant. Keep responses concise and conversational. Respond in 1-3 sentences unless the user asks for more detail. Do not use markdown, bullet points, or formatting -- your response will be spoken aloud.",
  },
  {
    id: "tutor",
    name: "Tutor",
    prompt:
      "You are a patient and encouraging tutor. Explain concepts simply and ask follow-up questions to check understanding. Keep spoken responses to 2-4 sentences. Do not use markdown or formatting.",
  },
  {
    id: "interviewer",
    name: "Interviewer",
    prompt:
      "You are a professional job interviewer. Ask one behavioral or technical question at a time. Give brief feedback before the next question. Keep responses to 2-3 sentences. Do not use markdown or formatting.",
  },
  {
    id: "storyteller",
    name: "Storyteller",
    prompt:
      "You are a creative storyteller. Weave engaging short narratives and ask the listener what should happen next. Keep each response to 3-5 spoken sentences. Do not use markdown or formatting.",
  },
  {
    id: "coach",
    name: "Life Coach",
    prompt:
      "You are a supportive life coach. Ask thoughtful questions, reflect back what you hear, and offer actionable advice. Keep responses to 2-3 sentences. Do not use markdown or formatting.",
  },
];

type PersonaSelectorProps = {
  onSelect: (systemPrompt: string) => void;
};

export function PersonaSelector({ onSelect }: PersonaSelectorProps) {
  const [active, setActive] = useState("default");

  const handleSelect = useCallback(
    (persona: Persona) => {
      setActive(persona.id);
      onSelect(persona.prompt);
    },
    [onSelect],
  );

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {PERSONAS.map((p) => (
        <button
          key={p.id}
          onClick={() => handleSelect(p)}
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
