import { createFileRoute } from "@tanstack/react-router";
import { VoiceView } from "@/views/VoiceView";

export const Route = createFileRoute("/watching/voice/")({
  component: VoiceView,
});
