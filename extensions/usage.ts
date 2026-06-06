/**
 * Rolling-window token/cost usage, read from pi's own session logs.
 *
 * IMPORTANT: the real Anthropic/OpenAI weekly + 5-hour *subscription* limits are
 * NOT exposed to extensions (and aren't stored locally), so this cannot show
 * "remaining vs the provider's limit". Instead it measures actual *consumption*
 * (tokens + cost) over the last 5 hours and last 7 days from the session logs
 * under ~/.pi/agent/sessions/ and renders it against user-configurable caps.
 *
 * Each log line looks like:
 *   {"timestamp":"2026-05-27T10:39:43.631Z","message":{"usage":{
 *      "input":6,"output":6,"cacheRead":0,"cacheWrite":2559,
 *      "totalTokens":2571,"cost":{"total":0.0161}}}}
 *
 * Results are cached for a short TTL because render() runs several times/sec.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SESSIONS_DIR = process.env.PI_POKEPET_SESSIONS_DIR || join(homedir(), ".pi", "agent", "sessions");
const FIVE_HOURS_MS = 5 * 3600 * 1000;
const WEEK_MS = 7 * 86_400 * 1000;
const CACHE_TTL_MS = 60_000;

export interface UsageWindow {
	tokens: number;
	cost: number;
}
export interface UsageWindows {
	h5: UsageWindow;
	week: UsageWindow;
}

interface UsageObj {
	totalTokens?: number;
	input?: number;
	output?: number;
	cacheRead?: number;
	cacheWrite?: number;
	cost?: { total?: number };
}
interface LogEntry {
	timestamp?: string;
	usage?: UsageObj;
	message?: { timestamp?: string; usage?: UsageObj };
}

let cache: { at: number; data: UsageWindows } | null = null;

function listSessionFiles(): string[] {
	const out: string[] = [];
	const walk = (dir: string): void => {
		let entries: ReturnType<typeof readdirSync>;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.isFile() && entry.name.endsWith(".jsonl")) out.push(full);
		}
	};
	walk(SESSIONS_DIR);
	return out;
}

function tokensOf(u: UsageObj): number {
	if (typeof u.totalTokens === "number") return u.totalTokens;
	return (u.input ?? 0) + (u.output ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0);
}

function computeUsage(now: number): UsageWindows {
	const h5: UsageWindow = { tokens: 0, cost: 0 };
	const week: UsageWindow = { tokens: 0, cost: 0 };

	for (const file of listSessionFiles()) {
		// Skip files untouched for over a week — every entry in them is too old.
		try {
			if (now - statSync(file).mtimeMs > WEEK_MS) continue;
		} catch {
			continue;
		}
		let text: string;
		try {
			text = readFileSync(file, "utf8");
		} catch {
			continue;
		}
		for (const line of text.split("\n")) {
			if (!line.includes('"usage"')) continue;
			let entry: LogEntry;
			try {
				entry = JSON.parse(line) as LogEntry;
			} catch {
				continue;
			}
			const msg = entry.message ?? entry;
			const u = msg.usage ?? entry.usage;
			if (!u) continue;
			const ts = entry.timestamp ?? entry.message?.timestamp;
			const t = ts ? Date.parse(ts) : Number.NaN;
			if (Number.isNaN(t)) continue;
			const age = now - t;
			if (age < 0 || age > WEEK_MS) continue;
			const tokens = tokensOf(u);
			const cost = typeof u.cost?.total === "number" ? u.cost.total : 0;
			week.tokens += tokens;
			week.cost += cost;
			if (age <= FIVE_HOURS_MS) {
				h5.tokens += tokens;
				h5.cost += cost;
			}
		}
	}
	return { h5, week };
}

/** Tokens + cost consumed in the last 5 hours and last 7 days (cached briefly). */
export function getUsageWindows(force = false): UsageWindows {
	const now = Date.now();
	if (!force && cache && now - cache.at < CACHE_TTL_MS) return cache.data;
	let data: UsageWindows;
	try {
		data = computeUsage(now);
	} catch {
		data = cache?.data ?? { h5: { tokens: 0, cost: 0 }, week: { tokens: 0, cost: 0 } };
	}
	cache = { at: now, data };
	return data;
}

export function invalidateUsageCache(): void {
	cache = null;
}

/** Compact token count: 9_600_000 -> "9.6M". */
export function fmtTokens(n: number): string {
	if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
	if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
	if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
	return String(Math.round(n));
}

/** Parse a cap like "10m", "10M", "1.5b", "10000000" into a token count. */
export function parseCap(input: string): number | null {
	const m = input
		.trim()
		.toLowerCase()
		.match(/^(\d+(?:\.\d+)?)\s*([kmb])?$/);
	if (!m) return null;
	const mult = m[2] === "b" ? 1e9 : m[2] === "m" ? 1e6 : m[2] === "k" ? 1e3 : 1;
	const out = Math.round(Number.parseFloat(m[1]!) * mult);
	return out > 0 ? out : null;
}
