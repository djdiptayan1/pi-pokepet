import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const sessionsDir = mkdtempSync(join(tmpdir(), "pi-pokepet-sessions-"));
process.env.PI_POKEPET_SESSIONS_DIR = sessionsDir;

function entry(ageMs: number, tokens: number, cost: number): string {
	const ts = new Date(Date.now() - ageMs).toISOString();
	return JSON.stringify({ timestamp: ts, message: { usage: { totalTokens: tokens, cost: { total: cost } } } });
}

test.after(() => {
	rmSync(sessionsDir, { recursive: true, force: true });
});

test("parseCap understands k/m/b suffixes and rejects junk", async () => {
	const { parseCap } = await import("../extensions/usage.ts");
	assert.equal(parseCap("10m"), 10_000_000);
	assert.equal(parseCap("1.5b"), 1_500_000_000);
	assert.equal(parseCap("50000"), 50_000);
	assert.equal(parseCap("250k"), 250_000);
	assert.equal(parseCap("0"), null);
	assert.equal(parseCap("abc"), null);
	assert.equal(parseCap(""), null);
});

test("fmtTokens renders compact units", async () => {
	const { fmtTokens } = await import("../extensions/usage.ts");
	assert.equal(fmtTokens(9_600_000), "9.6M");
	assert.equal(fmtTokens(2_500_000_000), "2.5B");
	assert.equal(fmtTokens(250_000), "250k");
	assert.equal(fmtTokens(42), "42");
});

test("getUsageWindows buckets tokens/cost into 5h and 7d windows", async () => {
	const { getUsageWindows, invalidateUsageCache } = await import("../extensions/usage.ts");

	const lines = [
		entry(60_000, 1000, 0.1), // 1 min ago  -> in 5h and week
		entry(2 * 3600_000, 2000, 0.2), // 2 h ago    -> in 5h and week
		entry(6 * 3600_000, 4000, 0.4), // 6 h ago    -> week only (outside 5h)
		entry(3 * 86_400_000, 8000, 0.8), // 3 d ago    -> week only
		entry(10 * 86_400_000, 9999, 9.9), // 10 d ago   -> excluded entirely
	].join("\n");
	writeFileSync(join(sessionsDir, "s1.jsonl"), `${lines}\n`);

	invalidateUsageCache();
	const u = getUsageWindows(true);

	assert.equal(u.h5.tokens, 3000); // 1000 + 2000
	assert.ok(Math.abs(u.h5.cost - 0.3) < 1e-9);
	assert.equal(u.week.tokens, 15000); // 1000 + 2000 + 4000 + 8000
	assert.ok(Math.abs(u.week.cost - 1.5) < 1e-9);
});
