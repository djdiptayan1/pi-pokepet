/**
 * Runtime state, cross-session persistence, and bond tiers.
 *
 * `state` is a shared singleton mutated by index.ts. Persistence writes small
 * files under ~/.pi/agent/ (pokepet-state.json + pokepet-events.jsonl).
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Intent } from "./content.ts";
import type { Mon, Mood } from "./mons.ts";

const DIR = join(homedir(), ".pi", "agent");
const STATE_FILE = join(DIR, "pokepet-state.json");
const EVENT_FILE = join(DIR, "pokepet-events.jsonl");

export interface PokeState {
	style: "ascii" | "image" | "terminal";
	asciiPetKey: string;
	imagePetSlug: string;
	nick: string;
	mood: Mood;
	frameIdx: number;
	message: string;
	visible: boolean;
	size: "small" | "large";
	lastActivity: number;
	lastIntent?: Intent;
	sessions: number;
	firstMet: string;
	energy: number;
	failStreak: number;
	editTimes: number[];
	/** True while a tool is executing, so the pet doesn't go idle mid-run. */
	toolActive: boolean;
	/** User-configurable token caps for the rolling 5h / weekly usage bars. */
	cap5h: number;
	capWeek: number;
}

export const DEFAULT_CAP_5H = 10_000_000;
export const DEFAULT_CAP_WEEK = 50_000_000;

export const state: PokeState = {
	style: "ascii",
	asciiPetKey: "pikachu",
	imagePetSlug: "",
	nick: "",
	mood: "hatch",
	frameIdx: 0,
	message: "",
	visible: true,
	size: "small",
	lastActivity: Date.now(),
	sessions: 0,
	firstMet: new Date().toISOString(),
	energy: 85,
	failStreak: 0,
	editTimes: [],
	toolActive: false,
	cap5h: DEFAULT_CAP_5H,
	capWeek: DEFAULT_CAP_WEEK,
};

export interface SavedState {
	style: "ascii" | "image" | "terminal";
	asciiPetKey: string;
	imagePetSlug: string;
	/** Legacy key from versions that only supported the ASCII Pokemon roster. */
	monKey?: string;
	nick: string;
	size: "small" | "large";
	sessions: number;
	firstMet: string;
	lastSeen: string;
	energy: number;
	cap5h?: number;
	capWeek?: number;
}

export function loadSaved(): Partial<SavedState> {
	try {
		if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, "utf8"));
	} catch {
		/* ignore corrupt state */
	}
	return {};
}

export function applySavedState(saved: Partial<SavedState>, hasAsciiPet: (key: string) => boolean): void {
	const asciiKey = saved.asciiPetKey || saved.monKey;
	if (asciiKey && hasAsciiPet(asciiKey)) state.asciiPetKey = asciiKey;
	if (saved.style === "image" || saved.style === "ascii" || saved.style === "terminal") state.style = saved.style;
	if (typeof saved.imagePetSlug === "string") state.imagePetSlug = saved.imagePetSlug;
	if (typeof saved.nick === "string") state.nick = saved.nick;
	if (saved.size === "large" || saved.size === "small") state.size = saved.size;
	if (saved.firstMet) state.firstMet = saved.firstMet;
	if (typeof saved.energy === "number") {
		const mins = saved.lastSeen ? (Date.now() - Date.parse(saved.lastSeen)) / 60_000 : 0;
		state.energy = Math.max(0, Math.min(100, saved.energy - mins * 0.02));
	}
	if (typeof saved.cap5h === "number" && saved.cap5h > 0) state.cap5h = saved.cap5h;
	if (typeof saved.capWeek === "number" && saved.capWeek > 0) state.capWeek = saved.capWeek;
	state.sessions = (saved.sessions ?? 0) + 1;
}

export function saveState(): void {
	try {
		mkdirSync(DIR, { recursive: true });
		const data: SavedState = {
			style: state.style,
			asciiPetKey: state.asciiPetKey,
			imagePetSlug: state.imagePetSlug,
			nick: state.nick,
			size: state.size,
			sessions: state.sessions,
			firstMet: state.firstMet,
			lastSeen: new Date().toISOString(),
			energy: Math.round(state.energy),
			cap5h: state.cap5h,
			capWeek: state.capWeek,
		};
		writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
	} catch {
		/* best-effort */
	}
}

export function logEvent(type: string): void {
	try {
		mkdirSync(DIR, { recursive: true });
		appendFileSync(EVENT_FILE, `${JSON.stringify({ t: Date.now(), type })}\n`);
	} catch {
		/* best-effort */
	}
}

export function readEvents(): { t: number; type: string }[] {
	try {
		if (!existsSync(EVENT_FILE)) return [];
		return readFileSync(EVENT_FILE, "utf8")
			.trim()
			.split("\n")
			.slice(-2000)
			.map((l) => JSON.parse(l));
	} catch {
		return [];
	}
}

export type Tier = "stranger" | "buddy" | "partner" | "bestie";

export function tierOf(sessions: number): Tier {
	if (sessions >= 50) return "bestie";
	if (sessions >= 15) return "partner";
	if (sessions >= 3) return "buddy";
	return "stranger";
}

export function greeting(tier: Tier, sessions: number, mon: Mon): string {
	switch (tier) {
		case "bestie":
			return `BESTIE! you're back! #${sessions}`;
		case "partner":
			return "my favorite trainer is back!";
		case "buddy":
			return "hey, good to see you again!";
		default:
			return `a wild ${mon.name} appeared!`;
	}
}

export interface PetPersonality {
	tier: "Common" | "Rare" | "Legendary";
	chaos: number;
	curiosity: number;
	snark: number;
}

function hashString(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash |= 0; // Convert to 32bit integer
	}
	return Math.abs(hash);
}

export function getPetPersonality(slug: string, nick?: string): PetPersonality {
	const source = `${slug}:${nick ?? ""}`;
	const hash = hashString(source);

	const tierVal = hash % 100;
	let tier: "Common" | "Rare" | "Legendary" = "Common";
	if (tierVal >= 90) tier = "Legendary";
	else if (tierVal >= 60) tier = "Rare";

	const minVal = tier === "Legendary" ? 70 : tier === "Rare" ? 40 : 10;
	const maxVal = tier === "Legendary" ? 100 : tier === "Rare" ? 85 : 60;
	const range = maxVal - minVal;

	const chaos = minVal + ((hash >> 2) % range);
	const curiosity = minVal + ((hash >> 4) % range);
	const snark = minVal + ((hash >> 6) % range);

	return { tier, chaos, curiosity, snark };
}
