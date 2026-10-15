export interface LatestJsonInput {
  version: string;
  notes: string;
  pubDate: Date;
  /** The text of the installer's .sig file. */
  signature: string;
  /** "dono/repo" the release is published on. */
  repo: string;
}

export interface LatestJson {
  version: string;
  notes: string;
  pub_date: string;
  platforms: { "windows-x86_64": { signature: string; url: string } };
}

/** The git tag the release must be published under: the installer url in latest.json depends on it. */
export function releaseTag(version: string): string {
  return `v${version.trim().replace(/^v/, "")}`;
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** The manifest `tauri-plugin-updater` reads from `releases/latest/download/latest.json`. */
export function buildLatestJson({ version, notes, pubDate, signature, repo }: LatestJsonInput): LatestJson {
  const clean = version.trim().replace(/^v/, "");
  if (!SEMVER.test(clean)) throw new Error(`version "${version}" is not a x.y.z version`);
  const sig = signature.trim();
  if (!sig) throw new Error("signature is empty: sign the build with TAURI_SIGNING_PRIVATE_KEY_PATH first");
  return {
    version: clean,
    notes,
    pub_date: pubDate.toISOString(),
    platforms: {
      "windows-x86_64": {
        signature: sig,
        url: `https://github.com/${repo}/releases/download/${releaseTag(clean)}/Cairn_${clean}_x64-setup.exe`,
      },
    },
  };
}
