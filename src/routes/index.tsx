import { createFileRoute } from "@tanstack/react-router";
import { SpiderGame } from "@/components/SpiderGame";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Spider Hero: Web Slinger" },
      {
        name: "description",
        content:
          "Endless physics-based web-swinging game. Sling from building to building, chain momentum, beat your high score.",
      },
      { property: "og:title", content: "Spider Hero: Web Slinger" },
      {
        property: "og:description",
        content:
          "Swing through a neon city. Time your releases, chain combos, survive as long as you can.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <SpiderGame />;
}
