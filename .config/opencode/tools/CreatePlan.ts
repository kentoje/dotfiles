import { tool } from "@opencode-ai/plugin";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const animalNames = [
  "aardvark",
  "alpaca",
  "anaconda",
  "axolotl",
  "badger",
  "capybara",
  "caracal",
  "chameleon",
  "cheetah",
  "coyote",
  "dingo",
  "dolphin",
  "echidna",
  "elephant",
  "falcon",
  "ferret",
  "flamingo",
  "giraffe",
  "hedgehog",
  "hippo",
  "iguana",
  "jaguar",
  "kangaroo",
  "koala",
  "lemur",
  "lynx",
  "meerkat",
  "narwhal",
  "octopus",
  "ocelot",
] as const;

const funnyWords = [
  "bamboozle",
  "bodacious",
  "brouhaha",
  "bumble",
  "cattywampus",
  "dingus",
  "doohickey",
  "flibbertigibbet",
  "flummox",
  "fuzzywuzzy",
  "gobbledygook",
  "hobnob",
  "hootenanny",
  "hullabaloo",
  "kerfuffle",
  "lollygag",
  "malarkey",
  "mumbojumbo",
  "nincompoop",
  "poppycock",
  "razzledazzle",
  "rigmarole",
  "shenanigans",
  "skedaddle",
  "snickerdoodle",
  "spaghettify",
  "squeegee",
  "tomfoolery",
  "whippersnapper",
  "zigzaggle",
] as const;

const fancyColors = [
  "alizarincrimson",
  "amaranth",
  "antiquegold",
  "aubergine",
  "bistre",
  "burgundy",
  "caputmortuum",
  "celadon",
  "cerulean",
  "champagne",
  "cinnabar",
  "coquelicot",
  "delftblue",
  "ecru",
  "feldgrau",
  "fuchsia",
  "gamboge",
  "glaucous",
  "heliotrope",
  "isabelline",
  "jonquil",
  "malachite",
  "mauve",
  "paynesgrey",
  "periwinkle",
  "prussianblue",
  "saffron",
  "smaragdine",
  "tyrianpurple",
  "verdigris",
] as const;

function randomElement<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateFilename(): string {
  const animal = randomElement(animalNames);
  const funny = randomElement(funnyWords);
  const color = randomElement(fancyColors);

  return `${animal}-${funny}-${color}.md`;
}

export default tool({
  description:
    "Create a plan file in ~/.config/opencode/plans/ with a randomly generated filename. Returns the full path of the created file.",
  args: {
    content: tool.schema
      .string()
      .describe("The markdown content to write to the plan file"),
  },
  async execute(args) {
    const plansDir = join(homedir(), ".config", "opencode", "plans");

    // Ensure plans directory exists
    if (!existsSync(plansDir)) {
      mkdirSync(plansDir, { recursive: true });
    }

    // Generate unique filename (with collision handling, max 100 attempts)
    let filename: string;
    let filePath: string;
    let attempts = 0;
    const maxAttempts = 100;

    do {
      filename = generateFilename();
      filePath = join(plansDir, filename);
      attempts++;
    } while (existsSync(filePath) && attempts < maxAttempts);

    if (attempts >= maxAttempts && existsSync(filePath)) {
      return `Error: Could not generate unique filename after ${maxAttempts} attempts`;
    }

    // Write content to file
    writeFileSync(filePath, args.content, "utf-8");

    return filePath;
  },
});
