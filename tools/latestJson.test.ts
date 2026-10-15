import { describe, expect, it } from "vitest";
import { buildLatestJson, releaseTag } from "./latestJson";

const input = {
  version: "0.4.1",
  notes: "Auto-update pela aba Geral.",
  pubDate: new Date("2026-10-09T23:59:00Z"),
  signature: "dW50cnVzdGVk\n",
  repo: "sthevan027/cairn",
};

describe("buildLatestJson", () => {
  it("points the windows platform at the release's installer and carries its signature", () => {
    const json = buildLatestJson(input);
    expect(json.version).toBe("0.4.1");
    expect(json.notes).toBe("Auto-update pela aba Geral.");
    expect(json.pub_date).toBe("2026-10-09T23:59:00.000Z");
    expect(json.platforms["windows-x86_64"]).toEqual({
      signature: "dW50cnVzdGVk",
      url: "https://github.com/sthevan027/cairn/releases/download/v0.4.1/Cairn_0.4.1_x64-setup.exe",
    });
  });

  it("accepts a version typed with a leading v", () => {
    expect(buildLatestJson({ ...input, version: "v0.4.1" }).version).toBe("0.4.1");
  });

  it("refuses an empty signature, which the updater would reject on every machine", () => {
    expect(() => buildLatestJson({ ...input, signature: "  \n" })).toThrow(/signature/i);
  });

  it("refuses something that is not a semver version", () => {
    expect(() => buildLatestJson({ ...input, version: "latest" })).toThrow(/version/i);
  });
});

describe("releaseTag", () => {
  it("is the v-prefixed tag the installer url in latest.json points at", () => {
    expect(releaseTag("0.4.1")).toBe("v0.4.1");
    expect(releaseTag("v0.4.1")).toBe("v0.4.1");
    expect(buildLatestJson(input).platforms["windows-x86_64"].url).toContain(`/download/${releaseTag("0.4.1")}/`);
  });
});
