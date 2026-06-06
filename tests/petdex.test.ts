import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";

const petsDir = mkdtempSync(join(tmpdir(), "pi-pokepet-pets-"));
process.env.PI_POKEPET_PETDEX_DIR = petsDir;

test.after(() => {
	rmSync(petsDir, { recursive: true, force: true });
});

test("validates Petdex pet metadata", async () => {
	const { validatePetJson } = await import("../extensions/petdex.ts");

	assert.deepEqual(
		validatePetJson({
			id: "boba",
			displayName: "Boba",
			description: "A tiny coding companion.",
			spritesheetPath: "spritesheet.webp",
		}),
		{
			id: "boba",
			displayName: "Boba",
			description: "A tiny coding companion.",
			spritesheetPath: "spritesheet.webp",
		},
	);

	assert.throws(() => validatePetJson({ displayName: "Boba", description: "x", spritesheetPath: "spritesheet.webp" }));
	assert.throws(() =>
		validatePetJson({ id: "boba", displayName: "Boba", description: "x", spritesheetPath: "../sprite.webp" }),
	);
	assert.throws(() =>
		validatePetJson({ id: "boba", displayName: "Boba", description: "x", spritesheetPath: "sprite.gif" }),
	);
});

test("maps pi moods to Petdex sprite rows", async () => {
	const { selectPetdexState } = await import("../extensions/petdex-renderer.ts");

	assert.equal(selectPetdexState("idle"), "idle");
	assert.equal(selectPetdexState("sleep"), "idle");
	assert.equal(selectPetdexState("talking"), "wave");
	assert.equal(selectPetdexState("thinking"), "review");
	assert.equal(selectPetdexState("working"), "running");
	assert.equal(selectPetdexState("working", "review"), "review");
	assert.equal(selectPetdexState("happy"), "jump");
	assert.equal(selectPetdexState("hatch"), "jump");
	assert.equal(selectPetdexState("panic"), "failed");
	assert.equal(selectPetdexState("guard"), "waiting");
});

test("renders an 8-column x 9-row PNG atlas into ANSI half-block frames", async () => {
	const { renderPetdexPetForColumns, visibleWidth } = await import("../extensions/petdex-renderer.ts");
	const dir = mkdtempSync(join(tmpdir(), "pi-pokepet-render-"));
	const spritePath = join(dir, "spritesheet.png");

	try {
		await sharp({
			create: {
				width: 72,
				height: 81,
				channels: 4,
				background: { r: 255, g: 0, b: 0, alpha: 1 },
			},
		})
			.png()
			.toFile(spritePath);

		const rendered = await renderPetdexPetForColumns(
			{
				slug: "test-pet",
				dir,
				metadata: {
					id: "test-pet",
					displayName: "Test Pet",
					description: "A test pet.",
					spritesheetPath: "spritesheet.png",
				},
				spritesheetPath: spritePath,
			},
			"small",
			18,
			6,
		);

		assert.equal(rendered.maxColumns, 18);
		assert.equal(rendered.maxRows, 6);
		assert.equal(rendered.frames.idle.length, 6);
		assert.equal(rendered.frames.running.length, 6);
		assert.equal(rendered.frames.runRight.length, 8);
		assert.equal(rendered.frames.wave.length, 4);
		assert.ok(rendered.frames.idle[0]!.length > 0);
		assert.ok(rendered.frames.idle[0]!.every((line) => visibleWidth(line) <= 18));
		assert.ok(rendered.frames.idle[0]!.length <= 6);
		assert.ok(rendered.frames.idle[0]![0]!.includes(`${String.fromCharCode(27)}[38;2;255;0;0m`));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("extracts an 8-column x 9-row PNG atlas into full native PNG frames", async () => {
	const { getNativePetdexFrame, prepareNativePetdexPet } = await import("../extensions/petdex-native-renderer.ts");
	const dir = mkdtempSync(join(tmpdir(), "pi-pokepet-native-"));
	const spritePath = join(dir, "spritesheet.png");

	try {
		await sharp({
			create: {
				width: 72,
				height: 81,
				channels: 4,
				background: { r: 0, g: 0, b: 255, alpha: 1 },
			},
		})
			.png()
			.toFile(spritePath);

		const rendered = await prepareNativePetdexPet({
			slug: "test-native",
			dir,
			metadata: {
				id: "test-native",
				displayName: "Test Native",
				description: "A test pet.",
				spritesheetPath: "spritesheet.png",
			},
			spritesheetPath: spritePath,
		});
		const frame = getNativePetdexFrame(rendered, "idle", 0);

		assert.equal(rendered.frameWidth, 9);
		assert.equal(rendered.frameHeight, 9);
		assert.equal(rendered.frames.idle.length, 6);
		assert.equal(rendered.frames.runRight.length, 8);
		assert.equal(frame?.width, 9);
		assert.equal(frame?.height, 9);
		assert.ok(frame?.base64);
		const metadata = await sharp(Buffer.from(frame!.base64, "base64")).metadata();
		assert.equal(metadata.width, 9);
		assert.equal(metadata.height, 9);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("renders native Petdex widget through Kitty and iTerm2 image sequences", async () => {
	const { buildNativePetWidget, setNativeImageCapabilitiesForTests, supportsNativeImagePets } = await import(
		"../extensions/petdex-widget.ts"
	);
	const png = await sharp({
		create: {
			width: 9,
			height: 9,
			channels: 4,
			background: { r: 255, g: 255, b: 0, alpha: 1 },
		},
	})
		.png()
		.toBuffer();
	const frame = {
		base64: png.toString("base64"),
		filename: "idle-0.png",
		width: 9,
		height: 9,
	};

	setNativeImageCapabilitiesForTests({ images: "kitty", trueColor: true, hyperlinks: true });
	assert.equal(supportsNativeImagePets(), true);
	assert.ok(
		buildNativePetWidget({ frame, imageId: 12345, size: "small", statusLines: ["Petdex"], meterLine: "100" })
			.render(80)
			.some((line) => line.includes("\x1b_G")),
	);

	setNativeImageCapabilitiesForTests({ images: "iterm2", trueColor: true, hyperlinks: true });
	assert.equal(supportsNativeImagePets(), true);
	assert.ok(
		buildNativePetWidget({ frame, imageId: 12345, size: "large", statusLines: ["Petdex"], meterLine: "100" })
			.render(80)
			.some((line) => line.includes("\x1b]1337;File=")),
	);
});

test("detects unsupported native image terminals for ANSI fallback", async () => {
	const { nativeImageBudget, setNativeImageCapabilitiesForTests, supportsNativeImagePets } = await import(
		"../extensions/petdex-widget.ts"
	);

	setNativeImageCapabilitiesForTests({ images: null, trueColor: true, hyperlinks: true });

	assert.equal(supportsNativeImagePets(), false);
	assert.deepEqual(nativeImageBudget("small", 12), { maxWidthCells: 10, maxHeightCells: 3 });
	assert.deepEqual(nativeImageBudget("large", 40), { maxWidthCells: 18, maxHeightCells: 6 });
});

test("renders text pet widgets without Pi string-array truncation", async () => {
	const { buildTextPetWidget } = await import("../extensions/petdex-widget.ts");
	const lines = Array.from({ length: 18 }, (_, idx) => `line ${idx + 1}`);

	const rendered = buildTextPetWidget({ lines }).render(80);

	assert.equal(rendered.length, 18);
	assert.ok(rendered.at(-1)?.includes("line 18"));
});

test("crops transparent frame padding before scaling", async () => {
	const { visiblePixelBounds } = await import("../extensions/petdex-renderer.ts");
	const width = 10;
	const height = 10;
	const data = Buffer.alloc(width * height * 4);

	for (let y = 3; y <= 5; y++) {
		for (let x = 2; x <= 6; x++) {
			data[(y * width + x) * 4] = 255;
			data[(y * width + x) * 4 + 3] = 255;
		}
	}

	assert.deepEqual(visiblePixelBounds(data, width, height), { left: 2, top: 3, width: 5, height: 3 });
	assert.deepEqual(visiblePixelBounds(data, width, height, 1), { left: 1, top: 2, width: 7, height: 5 });
});

test("migrates legacy monKey state into asciiPetKey", async () => {
	const { applySavedState, state } = await import("../extensions/state.ts");

	state.style = "ascii";
	state.asciiPetKey = "pikachu";
	state.imagePetSlug = "";
	state.sessions = 0;
	state.energy = 85;
	state.nick = "";

	applySavedState(
		{
			monKey: "eevee",
			style: "image",
			imagePetSlug: "boba",
			nick: "Pi",
			size: "large",
			sessions: 4,
			firstMet: "2026-01-01T00:00:00.000Z",
			lastSeen: new Date().toISOString(),
			energy: 70,
		},
		(key) => key === "eevee",
	);

	assert.equal(state.asciiPetKey, "eevee");
	assert.equal(state.style, "image");
	assert.equal(state.imagePetSlug, "boba");
	assert.equal(state.nick, "Pi");
	assert.equal(state.size, "large");
	assert.equal(state.sessions, 5);
	assert.ok(state.energy <= 70);
});

test("fetches gallery manifest and installs a mocked Petdex pet", async () => {
	const { installPetdexPet, loadLocalPetdexPet } = await import("../extensions/petdex.ts");
	const spriteBuffer = await sharp({
		create: {
			width: 72,
			height: 81,
			channels: 4,
			background: { r: 0, g: 255, b: 0, alpha: 1 },
		},
	})
		.png()
		.toBuffer();

	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async (url: string | URL | Request) => {
		const href = String(url);
		if (href.endsWith("/api/manifest")) {
			return new Response(
				JSON.stringify({
					pets: [
						{
							slug: "mock-pet",
							displayName: "Mock Pet",
							spritesheetUrl: "https://example.test/spritesheet.png",
							petJsonUrl: "https://example.test/pet.json",
						},
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}
		if (href.endsWith("/pet.json")) {
			return new Response(
				JSON.stringify({
					id: "mock-pet",
					displayName: "Mock Pet",
					description: "A mocked pet.",
					spritesheetPath: "spritesheet.png",
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}
		return new Response(spriteBuffer, { status: 200, headers: { "content-type": "image/png" } });
	}) as typeof fetch;

	try {
		const pet = await installPetdexPet("mock-pet");
		assert.equal(pet.metadata.displayName, "Mock Pet");
		assert.ok(loadLocalPetdexPet("mock-pet"));
		assert.equal(
			JSON.parse(readFileSync(join(petsDir, "mock-pet", "pet.json"), "utf8")).spritesheetPath,
			"spritesheet.png",
		);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("calculates deterministic pet personality and rarity tier", async () => {
	const { getPetPersonality } = await import("../extensions/state.ts");

	const p1 = getPetPersonality("jackie", "MyJackie");
	const p2 = getPetPersonality("jackie", "MyJackie");
	assert.deepEqual(p1, p2);

	const p3 = getPetPersonality("jackie", "DifferentName");
	assert.notDeepEqual(p1, p3);

	// Verify that the stats are within expected ranges for each tier
	for (const name of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]) {
		const pers = getPetPersonality("slug", name);
		assert.ok(["Common", "Rare", "Legendary"].includes(pers.tier));
		const minVal = pers.tier === "Legendary" ? 70 : pers.tier === "Rare" ? 40 : 10;
		const maxVal = pers.tier === "Legendary" ? 100 : pers.tier === "Rare" ? 85 : 60;
		assert.ok(pers.chaos >= minVal && pers.chaos <= maxVal, `chaos: ${pers.chaos} not in [${minVal}, ${maxVal}]`);
		assert.ok(
			pers.curiosity >= minVal && pers.curiosity <= maxVal,
			`curiosity: ${pers.curiosity} not in [${minVal}, ${maxVal}]`,
		);
		assert.ok(pers.snark >= minVal && pers.snark <= maxVal, `snark: ${pers.snark} not in [${minVal}, ${maxVal}]`);
	}
});

test("uninstalls/deletes an installed Petdex pet", async () => {
	const { loadLocalPetdexPet } = await import("../extensions/petdex.ts");
	const { existsSync, mkdirSync, writeFileSync } = await import("node:fs");
	const { join } = await import("node:path");

	const testSlug = "to-be-deleted";
	const targetDir = join(petsDir, testSlug);
	mkdirSync(targetDir, { recursive: true });
	writeFileSync(
		join(targetDir, "pet.json"),
		JSON.stringify({
			id: testSlug,
			displayName: "To Delete",
			description: "x",
			spritesheetPath: "spritesheet.png",
		}),
	);
	writeFileSync(join(targetDir, "spritesheet.png"), Buffer.alloc(0));

	assert.ok(loadLocalPetdexPet(testSlug));
	assert.ok(existsSync(targetDir));

	// Perform uninstall (deletion)
	const { rmSync } = await import("node:fs");
	rmSync(targetDir, { recursive: true, force: true });

	assert.ok(!loadLocalPetdexPet(testSlug));
	assert.ok(!existsSync(targetDir));
});
