import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/farm/app-shell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KhetMitra — Smart Farming Companion" },
      {
        name: "description",
        content:
          "Your farm in one app: crop advice, fertilizer plan, leaf doctor, expense ledger, govt. schemes and disaster aid — saved to your account.",
      },
      { property: "og:title", content: "KhetMitra — Smart Farming Companion" },
      {
        property: "og:description",
        content:
          "Your farm in one app: crop advice, fertilizer plan, leaf doctor, expense ledger, govt. schemes and disaster aid — saved to your account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AppShell,
});
