#!/usr/bin/env bun
/**
 * Send a Slack ping to Kento: the workflow Slack app's bot (`kento_ai_workflow`) posts in its DM with him,
 * so the message notifies him (a post in his DM with himself would not).
 *
 * Usage: bun send-slack-ping.ts "<status line>" [--thread-ts <ts>]
 * Needs SLACK_BOT_TOKEN (the app's Bot User OAuth Token, xoxb-), the same token dev-workflows uses.
 * Prints the posted message as JSON: { "channel": "D...", "ts": "..." }.
 */
import { parseArgs } from "node:util";

/** Kento's Slack user id in the Aircall workspace; the bot opens its DM with this user. */
const KENTO_SLACK_USER_ID = "U02HMJT84M7";

/** Call one Slack Web API method with the bot token; throws "Slack ping failed" with Slack's error code. */
async function callSlackBotMethod(token: string, method: string, body: Record<string, unknown>): Promise<Record<string, any>> {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Slack ping failed (${method}): HTTP ${response.status}`);
  const result = (await response.json()) as Record<string, any>;
  if (!result.ok) throw new Error(`Slack ping failed (${method}): ${result.error}${result.needed ? ` (needs scope ${result.needed})` : ""}`);
  return result;
}

/** Post one status line in the bot's DM with Kento, optionally as a thread reply; returns where it landed. */
async function sendSlackPingToKento(input: { token: string; text: string; threadTs?: string }): Promise<{ channel: string; ts: string }> {
  const opened = await callSlackBotMethod(input.token, "conversations.open", { users: KENTO_SLACK_USER_ID });
  const posted = await callSlackBotMethod(input.token, "chat.postMessage", {
    channel: opened.channel.id,
    text: input.text,
    ...(input.threadTs ? { thread_ts: input.threadTs } : {}),
  });
  return { channel: posted.channel, ts: posted.ts };
}

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: { "thread-ts": { type: "string" } },
  allowPositionals: true,
});

const text = positionals.join(" ").trim();
if (!text) {
  console.error('Slack ping needs a message: bun send-slack-ping.ts "<status line>" [--thread-ts <ts>]');
  process.exit(2);
}
const token = process.env.SLACK_BOT_TOKEN?.trim();
if (!token?.startsWith("xoxb-")) {
  console.error(
    "Slack ping needs SLACK_BOT_TOKEN (xoxb-), the Bot User OAuth Token of the kento_ai_workflow Slack app. " +
      "Export it in ~/dotfiles/.config/fish/includes/private-vars.fish (same value as SLACK_BOT_TOKEN in dev-workflows/.env).",
  );
  process.exit(2);
}

console.log(JSON.stringify(await sendSlackPingToKento({ token, text, threadTs: values["thread-ts"] })));
