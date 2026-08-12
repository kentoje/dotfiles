/**
 * Reads an agent role definition from ~/.agents/roles/<name>.md and turns it into
 * pi command line arguments.
 *
 * A role is a persona plus the machinery that makes the persona real: a model tier, a
 * skill set, and a tool set it cannot exceed. This module is the single parser, so the
 * launcher and any other consumer agree on what a role file means.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const AGENT_ROLES_DIR = join(homedir(), ".agents", "roles");
export const AGENT_SKILLS_DIR = join(homedir(), ".agents", "skills");

export interface AgentRole {
	name: string;
	description: string;
	/** Full "provider/model-id" as written in the role file; pi wants the halves separately. */
	model?: string;
	thinking?: string;
	/** Skill directory names under ~/.agents/skills. Empty array means "no skills at all". */
	skills: string[];
	/** Tool allowlist. Mutually exclusive with excludeTools in practice. */
	tools: string[];
	/** Tool denylist. This is what makes a read-only role actually read-only. */
	excludeTools: string[];
	/** Needs a browser and a dev server, so it cannot run sandboxed or headless. */
	hostOnly: boolean;
	/** The role prompt, appended to pi's own system prompt rather than replacing it. */
	prompt: string;
	filePath: string;
}

/** Lists the role names that have a definition file, for `pi-role list` and error messages. */
export function listAgentRoleNames(): string[] {
	if (!existsSync(AGENT_ROLES_DIR)) return [];
	return readdirSync(AGENT_ROLES_DIR)
		.filter((file) => file.endsWith(".md") && file !== "README.md")
		.map((file) => file.slice(0, -3))
		.sort();
}

function splitFrontmatter(source: string, filePath: string): { frontmatter: string; body: string } {
	if (!source.startsWith("---\n")) {
		throw new Error(`Role file is missing its frontmatter block: ${filePath}`);
	}
	const end = source.indexOf("\n---", 3);
	if (end === -1) {
		throw new Error(`Role file frontmatter is never closed: ${filePath}`);
	}
	return {
		frontmatter: source.slice(4, end + 1),
		body: source.slice(source.indexOf("\n", end + 1) + 1).trim(),
	};
}

function unquote(value: string): string {
	const trimmed = value.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

/**
 * Parses the small YAML subset role files use: scalars, inline arrays, and block lists.
 * Anything outside that subset is an error rather than a silent misread, because a
 * silently dropped excludeTools entry would hand write access to a reviewer.
 */
function parseRoleFrontmatter(frontmatter: string, filePath: string): Record<string, string | string[]> {
	const fields: Record<string, string | string[]> = {};
	const lines = frontmatter.split("\n");
	let currentListKey: string | null = null;

	for (const line of lines) {
		if (line.trim() === "" || line.trim().startsWith("#")) continue;

		const listItem = /^\s+-\s+(.*)$/.exec(line);
		if (listItem) {
			if (!currentListKey) {
				throw new Error(`Role frontmatter has a list item with no key above it in ${filePath}: ${line}`);
			}
			(fields[currentListKey] as string[]).push(unquote(listItem[1] as string));
			continue;
		}

		const pair = /^([A-Za-z][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
		if (!pair) {
			throw new Error(`Role frontmatter line is not a key or a list item in ${filePath}: ${line}`);
		}
		const key = pair[1] as string;
		const rawValue = (pair[2] as string).trim();

		if (rawValue === "") {
			currentListKey = key;
			fields[key] = [];
			continue;
		}
		currentListKey = null;
		if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
			const inner = rawValue.slice(1, -1).trim();
			fields[key] = inner === "" ? [] : inner.split(",").map(unquote);
			continue;
		}
		fields[key] = unquote(rawValue);
	}
	return fields;
}

function asList(value: string | string[] | undefined): string[] {
	if (value === undefined) return [];
	return Array.isArray(value) ? value : [value];
}

/** Reads and validates one role by name, e.g. "architect". */
export function loadAgentRole(roleName: string): AgentRole {
	const filePath = join(AGENT_ROLES_DIR, `${roleName}.md`);
	if (!existsSync(filePath)) {
		const known = listAgentRoleNames();
		throw new Error(`Unknown agent role "${roleName}". Known roles: ${known.join(", ") || "none"}`);
	}
	const { frontmatter, body } = splitFrontmatter(readFileSync(filePath, "utf-8"), filePath);
	const fields = parseRoleFrontmatter(frontmatter, filePath);

	const skills = asList(fields.skills);
	for (const skill of skills) {
		if (!existsSync(join(AGENT_SKILLS_DIR, skill))) {
			throw new Error(`Role "${roleName}" lists a skill that is not installed: ${skill}`);
		}
	}

	return {
		name: typeof fields.name === "string" ? fields.name : roleName,
		description: typeof fields.description === "string" ? fields.description : "",
		model: typeof fields.model === "string" ? fields.model : undefined,
		thinking: typeof fields.thinking === "string" ? fields.thinking : undefined,
		skills,
		tools: asList(fields.tools),
		excludeTools: asList(fields.excludeTools),
		hostOnly: fields.hostOnly === "true",
		prompt: body,
		filePath,
	};
}

/**
 * Builds the pi arguments for a role.
 *
 * `--no-skills` drops only *discovered* skills; explicit `--skill` paths still load
 * (resource-loader.js merges cliEnabledSkills even when noSkills is set), which is what
 * makes an exact per-role skill set possible.
 */
export function buildPiArgsForRole(role: AgentRole): string[] {
	const args: string[] = [];

	if (role.model) {
		const slash = role.model.indexOf("/");
		if (slash > 0) {
			args.push("--provider", role.model.slice(0, slash), "--model", role.model.slice(slash + 1));
		} else {
			args.push("--model", role.model);
		}
	}
	if (role.thinking) args.push("--thinking", role.thinking);

	args.push("--no-skills");
	for (const skill of role.skills) {
		args.push("--skill", join(AGENT_SKILLS_DIR, skill));
	}

	if (role.tools.length > 0) args.push("--tools", role.tools.join(","));
	if (role.excludeTools.length > 0) args.push("--exclude-tools", role.excludeTools.join(","));

	args.push("--append-system-prompt", role.prompt);
	args.push("--name", role.name);
	return args;
}
