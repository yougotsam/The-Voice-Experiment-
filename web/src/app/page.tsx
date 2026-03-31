import { VoiceAgent } from "@/components/VoiceAgent";

export default function Home() {
  return (
    <main className="h-screen overflow-hidden relative">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-twilight/30 blur-[120px] pointer-events-none" />
      <VoiceAgent />
    </main>
  );
}
