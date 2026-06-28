import Anthropic from "@anthropic-ai/sdk";
import { cached } from "./cache";
import type { Feed } from "./types";

export type Briefing = {
  available: boolean;
  text: string;
  generatedAt: string;
  model?: string;
  error?: string;
};

const SYSTEM = `You are the intelligence analyst for "EarthPulse", a live dashboard tracking natural events on Earth and in the heavens.
You are given a snapshot of current real-world signals: earthquakes, wildfires/volcanoes/storms and other natural events, space-weather gauges (geomagnetic Kp index, solar X-ray flare class, solar wind), the Schumann resonance, and top world news headlines.

Write a concise situational briefing for someone who wants to understand the state of the world right now.

Rules:
- Output ONLY the briefing in GitHub-flavored Markdown. No preamble, no "Here is", no meta-commentary about your process.
- Start with a one-sentence **bold** headline of the single most notable thing.
- Then 3-5 short bullet sections grouped sensibly (e.g. Earth, Sky/Space weather, World news). Lead each with what matters.
- Be factual and grounded ONLY in the data provided. Do not invent events, magnitudes, or causal claims. If something is quiet, say so plainly.
- Do not imply scientific links that aren't established (e.g. between Schumann resonance or solar activity and human events).
- Keep it under ~250 words.`;

function buildInput(feed: Feed): string {
  const topEvents = feed.events
    .slice(0, 18)
    .map(
      (e) =>
        `- [${e.severity}] ${e.category}${e.scale ? ` ${e.scale}` : ""}: ${e.title} (${e.source})`,
    )
    .join("\n");

  const gauges = feed.gauges
    .map((g) => `- ${g.label}: ${g.display ?? g.value} [${g.severity}]`)
    .join("\n");

  const news = feed.news
    .slice(0, 14)
    .map((n) => `- ${n.title} (${n.domain})`)
    .join("\n");

  const sc = feed.schumann;
  const schumann = `${sc.frequency ?? "?"} Hz (${sc.status})`;

  return `SNAPSHOT @ ${feed.updatedAt}

## Space-weather gauges
${gauges || "- (none)"}

## Schumann resonance
- ${schumann}

## Active natural events & solar flares (most recent first)
${topEvents || "- (none)"}

## Top world news headlines
${news || "- (none)"}`;
}

export async function getBriefing(feed: Feed): Promise<Briefing> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      available: false,
      text: "Set `ANTHROPIC_API_KEY` in the environment to generate an AI daily briefing from the live data.",
      generatedAt: new Date().toISOString(),
    };
  }

  // Regenerate at most once per hour (keyed bucket keeps the cache fresh-ish).
  const hourBucket = new Date().toISOString().slice(0, 13);
  return cached(`briefing:v1:${hourBucket}`, 3600, async () => {
    const client = new Anthropic();
    try {
      const response = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 1500,
        output_config: { effort: "low" },
        system: SYSTEM,
        messages: [{ role: "user", content: buildInput(feed) }],
      });

      if (response.stop_reason === "refusal") {
        return {
          available: false,
          text: "The briefing could not be generated for this snapshot.",
          generatedAt: new Date().toISOString(),
        };
      }

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      return {
        available: true,
        text,
        generatedAt: new Date().toISOString(),
        model: response.model,
      };
    } catch (e) {
      const err = e as { status?: number; message?: string };
      return {
        available: false,
        text:
          err.status === 400 || err.status === 403
            ? "AI briefing unavailable — check the Anthropic API key and that the account has credit."
            : `AI briefing failed: ${err.message ?? "unknown error"}`,
        generatedAt: new Date().toISOString(),
        error: err.message,
      };
    }
  });
}
