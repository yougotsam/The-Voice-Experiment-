import { VoiceAgent } from "@/components/VoiceAgent";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 relative">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-twilight/30 blur-[120px] pointer-events-none" />
      <VoiceAgent />
    </main>
  );
}
