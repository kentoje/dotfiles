import type { Plugin } from "@opencode-ai/plugin";

const SOUND_FILE = "/System/Library/Sounds/Glass.aiff";

const EVENTS = new Set(["permission.asked", "question.asked"]);

/**
 * Play a notification sound using afplay
 */
function playSound(): void {
  Bun.spawn(["afplay", SOUND_FILE], {
    stdout: "ignore",
    stderr: "ignore",
  });
}

export const plugin: Plugin = async () => {
  return {
    event: async ({ event }) => {
      if (!EVENTS.has(event.type)) {
        return;
      }

      playSound();
    },
  };
};
