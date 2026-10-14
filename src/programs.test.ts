import { describe, expect, it } from "vitest";
import { programOf } from "./programs";

describe("programOf", () => {
  it("reconhece o programa pelo primeiro termo", () => {
    expect(programOf("claude")).toBe("claude");
    expect(programOf("claude --resume abc")).toBe("claude");
    expect(programOf("git status")).toBe("git");
    expect(programOf("bun run tauri dev")).toBe("node");
    expect(programOf("cargo test --lib")).toBe("rust");
    expect(programOf("python3 script.py")).toBe("python");
    expect(programOf("vim README.md")).toBe("editor");
  });

  it("ignora caminho, extensão e maiúsculas", () => {
    expect(programOf(String.raw`C:\Tools\Claude.EXE --help`)).toBe("claude");
    expect(programOf("/usr/bin/git log")).toBe("git");
    expect(programOf("./node.cmd x")).toBe("node");
  });

  it("pula variáveis de ambiente e wrappers antes do comando", () => {
    expect(programOf("FOO=1 BAR=2 claude")).toBe("claude");
    expect(programOf("sudo docker ps")).toBe("docker");
    expect(programOf("time cargo build")).toBe("rust");
  });

  it("devolve null quando não conhece o programa", () => {
    expect(programOf("echo oi")).toBeNull();
    expect(programOf("")).toBeNull();
    expect(programOf("   ")).toBeNull();
    expect(programOf("sudo")).toBeNull();
  });
});
