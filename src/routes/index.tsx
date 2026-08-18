import { createFileRoute } from "@tanstack/react-router";
import { DrumMachine } from "@/components/drum-machine";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <DrumMachine />;
}
