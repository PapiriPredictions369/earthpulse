import { markOnce } from "./cache";
import type { Feed } from "./types";

export type AlertResult = {
  configured: boolean;
  candidates: number;
  sent: number;
  messages: string[];
  note?: string;
};

const DEDUPE_TTL = 6 * 3600; // don't re-alert the same thing within 6h

const EMOJI: Record<string, string> = {
  earthquake: "🌐",
  wildfire: "🔥",
  volcano: "🌋",
  "severe-storm": "🌀",
  flood: "🌊",
  "solar-flare": "☀️",
  cme: "💥",
};

async function sendTelegram(token: string, chatId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`Telegram -> HTTP ${res.status}: ${await res.text()}`);
  }
}

/**
 * Find the highest-severity signals and push a Telegram alert for each one
 * that hasn't already been alerted. Safe to call on a schedule.
 */
export async function runAlerts(feed: Feed): Promise<AlertResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  // Build the candidate list: extreme events + extreme gauges.
  type Candidate = { key: string; text: string };
  const candidates: Candidate[] = [];

  for (const e of feed.events) {
    const alertable =
      e.severity === "extreme" ||
      (e.category === "earthquake" && (e.magnitude ?? 0) >= 6) ||
      (e.category === "solar-flare" && (e.scale ?? "").startsWith("X"));
    if (!alertable) continue;
    const icon = EMOJI[e.category] ?? "⚠️";
    const link = e.url ? `\n${e.url}` : "";
    candidates.push({
      key: `alert:${e.id}`,
      text: `${icon} <b>${e.severity.toUpperCase()}</b> ${e.category}${
        e.scale ? ` ${e.scale}` : ""
      }\n${e.title}${link}`,
    });
  }

  for (const g of feed.gauges) {
    if (g.severity !== "extreme") continue;
    candidates.push({
      key: `alert:gauge:${g.label}:${g.display ?? g.value}`,
      text: `🧲 <b>EXTREME</b> space weather\n${g.label}: ${g.display ?? g.value} (${g.source})`,
    });
  }

  if (!token || !chatId) {
    return {
      configured: false,
      candidates: candidates.length,
      sent: 0,
      messages: [],
      note: "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable alerts.",
    };
  }

  const sentMessages: string[] = [];
  for (const c of candidates) {
    const fresh = await markOnce(c.key, DEDUPE_TTL);
    if (!fresh) continue;
    try {
      await sendTelegram(token, chatId, c.text);
      sentMessages.push(c.text.split("\n")[0]);
    } catch {
      // swallow individual send failures; keep going
    }
  }

  return {
    configured: true,
    candidates: candidates.length,
    sent: sentMessages.length,
    messages: sentMessages,
  };
}
