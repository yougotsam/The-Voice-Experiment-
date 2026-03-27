"use client";

type AgentState = "idle" | "listening" | "processing" | "speaking";

type VoiceOrbProps = {
  state: AgentState;
  label: string;
  connected: boolean;
  inputMode: "push" | "vad";
  onPushStart: () => void;
  onPushEnd: () => void;
};

const ORB_STYLES: Record<AgentState, {
  outerGlow: string;
  irisGradient: string;
  pupilColor: string;
  pupilShadow: string;
}> = {
  idle: {
    outerGlow: "0 0 30px rgba(200, 169, 126, 0.08)",
    irisGradient: "radial-gradient(circle, rgba(200,169,126,0.12) 0%, rgba(18,34,54,0.8) 70%)",
    pupilColor: "rgba(200, 169, 126, 0.3)",
    pupilShadow: "0 0 8px rgba(200, 169, 126, 0.15)",
  },
  listening: {
    outerGlow: "0 0 60px rgba(200, 169, 126, 0.25), inset 0 0 40px rgba(200, 169, 126, 0.1)",
    irisGradient: "radial-gradient(circle, rgba(226,198,157,0.3) 0%, rgba(200,169,126,0.15) 50%, rgba(18,34,54,0.6) 70%)",
    pupilColor: "rgba(226, 198, 157, 0.7)",
    pupilShadow: "0 0 16px rgba(226, 198, 157, 0.4), 0 0 32px rgba(200, 169, 126, 0.2)",
  },
  processing: {
    outerGlow: "0 0 40px rgba(200, 169, 126, 0.12), inset 0 0 20px rgba(200, 169, 126, 0.06)",
    irisGradient: "radial-gradient(circle, rgba(158,130,90,0.25) 0%, rgba(18,34,54,0.7) 70%)",
    pupilColor: "rgba(221, 193, 151, 0.5)",
    pupilShadow: "0 0 12px rgba(221, 193, 151, 0.3)",
  },
  speaking: {
    outerGlow: "0 0 50px rgba(200, 169, 126, 0.2), inset 0 0 30px rgba(200, 169, 126, 0.08)",
    irisGradient: "radial-gradient(circle, rgba(226,198,157,0.2) 0%, rgba(200,169,126,0.1) 40%, rgba(18,34,54,0.7) 70%)",
    pupilColor: "rgba(226, 198, 157, 0.6)",
    pupilShadow: "0 0 20px rgba(226, 198, 157, 0.35), 0 0 40px rgba(200, 169, 126, 0.15)",
  },
};

export function VoiceOrb({ state, label, connected, inputMode, onPushStart, onPushEnd }: VoiceOrbProps) {
  const styles = ORB_STYLES[state];

  const orbAnimClass =
    state === "listening" || state === "speaking"
      ? "animate-glow-pulse"
      : "animate-breathe";

  const irisAnimClass =
    state === "processing"
      ? "animate-iris-rotate"
      : state === "speaking"
        ? "animate-iris-pulse"
        : "";

  const pupilAnimClass =
    state === "processing"
      ? "animate-pupil-throb"
      : state === "speaking"
        ? "animate-pupil-speak"
        : state === "listening"
          ? "animate-pupil-listen"
          : "";

  const orbContent = (
    <>
      {state === "listening" && (
        <>
          <div className="absolute inset-0 rounded-full animate-ripple-1" style={{
            border: "1px solid rgba(200, 169, 126, 0.15)",
          }} />
          <div className="absolute inset-0 rounded-full animate-ripple-2" style={{
            border: "1px solid rgba(200, 169, 126, 0.1)",
          }} />
        </>
      )}

      <div className="absolute rounded-full border-2 transition-all duration-700"
        style={{
          inset: "-6px",
          borderColor: state === "listening"
            ? "rgba(200, 169, 126, 0.4)"
            : state === "speaking"
              ? "rgba(200, 169, 126, 0.35)"
              : "rgba(200, 169, 126, 0.12)",
        }}
      />

      <div className={`absolute rounded-full transition-all duration-500 ${irisAnimClass}`}
        style={{
          inset: "16px",
          background: styles.irisGradient,
          border: "1px solid rgba(200, 169, 126, 0.08)",
        }}
      />

      <div className={`absolute rounded-full transition-all duration-500 ${pupilAnimClass}`}
        style={{
          width: "24px",
          height: "24px",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: styles.pupilColor,
          boxShadow: styles.pupilShadow,
        }}
      />

      <span className="absolute bottom-5 text-[11px] font-medium tracking-wider uppercase select-none"
        style={{ color: "rgba(244, 240, 234, 0.6)" }}
      >
        {label}
      </span>
    </>
  );

  if (inputMode === "push") {
    return (
      <button
        onMouseDown={onPushStart}
        onMouseUp={onPushEnd}
        onMouseLeave={onPushEnd}
        onTouchStart={onPushStart}
        onTouchEnd={onPushEnd}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") { e.preventDefault(); onPushStart(); }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") { e.preventDefault(); onPushEnd(); }
        }}
        disabled={!connected}
        className={`relative h-40 w-40 rounded-full flex items-center justify-center transition-all duration-500 cursor-pointer select-none ${orbAnimClass} disabled:opacity-30 disabled:cursor-not-allowed`}
        style={{
          background: "radial-gradient(circle at 50% 40%, rgba(18,34,54,0.9) 0%, rgba(8,18,28,0.95) 100%)",
          border: "1px solid rgba(200, 169, 126, 0.15)",
          boxShadow: styles.outerGlow,
        }}
      >
        {orbContent}
      </button>
    );
  }

  return (
    <div
      className={`relative h-40 w-40 rounded-full flex items-center justify-center transition-all duration-500 ${orbAnimClass}`}
      style={{
        background: "radial-gradient(circle at 50% 40%, rgba(18,34,54,0.9) 0%, rgba(8,18,28,0.95) 100%)",
        border: "1px solid rgba(200, 169, 126, 0.15)",
        boxShadow: styles.outerGlow,
      }}
    >
      {orbContent}
    </div>
  );
}
