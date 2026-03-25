import { VoiceAgent } from "@/components/VoiceAgent";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">Voice Agent</h1>
      <VoiceAgent />
    </main>
  );
}
