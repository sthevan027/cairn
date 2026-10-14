import { describe, expect, it } from "vitest";
import { OscSplitter, parseMarker, type StreamEvent } from "./osc";

const enc = new TextEncoder();
const b64 = (s: string) => btoa(String.fromCharCode(...enc.encode(s)));
const osc = (payload: string, term = "\x07") => `\x1b]9278;${payload}${term}`;

/** Junta eventos consecutivos de dados para comparar sem depender de onde os chunks cortaram. */
function normalize(events: StreamEvent[]) {
  const out: Array<{ data: string } | { marker: unknown }> = [];
  for (const e of events) {
    if (e.type === "data") {
      const text = new TextDecoder().decode(e.bytes);
      const last = out[out.length - 1];
      if (last && "data" in last) last.data += text;
      else out.push({ data: text });
    } else out.push({ marker: e.marker });
  }
  return out;
}

function run(chunks: Uint8Array[]) {
  const splitter = new OscSplitter();
  return normalize(chunks.flatMap((c) => splitter.push(c)));
}

describe("parseMarker", () => {
  it("lê pre com comando UTF-8", () => {
    expect(parseMarker(`pre;${b64("echo olá ✓")}`)).toEqual({ kind: "pre", command: "echo olá ✓" });
  });
  it("lê post com exit code e cwd", () => {
    expect(parseMarker(`post;130;${b64("/c/Users/Sthev")}`)).toEqual({
      kind: "post",
      exitCode: 130,
      cwd: "/c/Users/Sthev",
    });
  });
  it("rejeita lixo", () => {
    expect(parseMarker("xyz;1;2")).toBeNull();
    expect(parseMarker("pre;@@@")).toBeNull();
  });
});

describe("OscSplitter", () => {
  const stream =
    "prompt $ echo hi\r\n" +
    osc(`pre;${b64("echo hi")}`) +
    "hi\r\n" +
    osc(`post;0;${b64("/home")}`) +
    "prompt2";
  const expected = [
    { data: "prompt $ echo hi\r\n" },
    { marker: { kind: "pre", command: "echo hi" } },
    { data: "hi\r\n" },
    { marker: { kind: "post", exitCode: 0, cwd: "/home" } },
    { data: "prompt2" },
  ];

  it("separa dados e marcadores num único chunk", () => {
    expect(run([enc.encode(stream)])).toEqual(expected);
  });

  it("dá o mesmo resultado cortando o fluxo em qualquer posição", () => {
    const bytes = enc.encode(stream);
    for (let cut = 1; cut < bytes.length; cut++) {
      expect(run([bytes.slice(0, cut), bytes.slice(cut)]), `corte em ${cut}`).toEqual(expected);
    }
  });

  it("dá o mesmo resultado byte a byte", () => {
    const bytes = enc.encode(stream);
    expect(run(Array.from(bytes, (b) => Uint8Array.of(b)))).toEqual(expected);
  });

  it("aceita ST (ESC \\) como terminador", () => {
    const bytes = enc.encode(osc(`pre;${b64("ls")}`, "\x1b\\") + "out");
    for (let cut = 0; cut <= bytes.length; cut++) {
      expect(run([bytes.slice(0, cut), bytes.slice(cut)])).toEqual([
        { marker: { kind: "pre", command: "ls" } },
        { data: "out" },
      ]);
    }
  });

  it("não engole outras sequências de escape", () => {
    const text = "\x1b[32mverde\x1b[m \x1b]0;titulo\x07fim";
    expect(run([enc.encode(text)])).toEqual([{ data: text }]);
  });

  it("não perde um ESC solto no fim do fluxo", () => {
    const splitter = new OscSplitter();
    const events = normalize([...splitter.push(enc.encode("abc\x1b")), ...splitter.push(enc.encode("[0m"))]);
    expect(events).toEqual([{ data: "abc\x1b[0m" }]);
  });
});
