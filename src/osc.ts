// Protocolo de marcadores do cairn (OSC privado 9278):
//   ESC ] 9278 ; pre  ; <base64 do comando>            BEL|ST
//   ESC ] 9278 ; post ; <exit code> ; <base64 do cwd>  BEL|ST

export type Marker =
  | { kind: "pre"; command: string }
  | { kind: "post"; exitCode: number; cwd: string };

export type StreamEvent =
  | { type: "data"; bytes: Uint8Array }
  | { type: "marker"; marker: Marker };

const PREFIX = Uint8Array.from([0x1b, 0x5d, 0x39, 0x32, 0x37, 0x38, 0x3b]); // ESC ] 9278 ;
const ESC = 0x1b;
const BEL = 0x07;
const BACKSLASH = 0x5c;
const MAX_MARKER_BYTES = 64 * 1024;

function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function parseMarker(payload: string): Marker | null {
  const [kind, a, b] = payload.split(";");
  try {
    if (kind === "pre") return { kind: "pre", command: decodeBase64Utf8(a ?? "") };
    if (kind === "post") {
      const exitCode = Number.parseInt(a ?? "", 10);
      return { kind: "post", exitCode: Number.isNaN(exitCode) ? -1 : exitCode, cwd: decodeBase64Utf8(b ?? "") };
    }
  } catch {
    return null;
  }
  return null;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function indexOfPrefix(buf: Uint8Array, from: number): number {
  outer: for (let i = from; i <= buf.length - PREFIX.length; i++) {
    for (let j = 0; j < PREFIX.length; j++) if (buf[i + j] !== PREFIX[j]) continue outer;
    return i;
  }
  return -1;
}

/** Quantos bytes do fim de `buf` podem ser o começo de um PREFIX ainda incompleto. */
function partialPrefixLength(buf: Uint8Array, from: number): number {
  const max = Math.min(PREFIX.length - 1, buf.length - from);
  for (let len = max; len >= 1; len--) {
    let match = true;
    for (let j = 0; j < len; j++) {
      if (buf[buf.length - len + j] !== PREFIX[j]) {
        match = false;
        break;
      }
    }
    if (match) return len;
  }
  return 0;
}

function findTerminator(buf: Uint8Array, from: number): { index: number; length: number } | null {
  for (let i = from; i < buf.length; i++) {
    if (buf[i] === BEL) return { index: i, length: 1 };
    if (buf[i] === ESC) {
      if (i + 1 >= buf.length) return null; // ESC no fim do chunk: pode virar ST no próximo
      if (buf[i + 1] === BACKSLASH) return { index: i, length: 2 };
    }
  }
  return null;
}

/** Separa o fluxo de bytes do PTY em dados normais e marcadores, tolerando cortes entre chunks. */
export class OscSplitter {
  private pending: Uint8Array = new Uint8Array(0);

  push(chunk: Uint8Array): StreamEvent[] {
    const buf = concat(this.pending, chunk);
    this.pending = new Uint8Array(0);
    const events: StreamEvent[] = [];
    const data = (bytes: Uint8Array) => {
      if (bytes.length > 0) events.push({ type: "data", bytes });
    };

    let pos = 0;
    while (pos < buf.length) {
      const start = indexOfPrefix(buf, pos);
      if (start === -1) {
        const keep = partialPrefixLength(buf, pos);
        data(buf.subarray(pos, buf.length - keep));
        this.pending = buf.slice(buf.length - keep);
        break;
      }
      data(buf.subarray(pos, start));
      const end = findTerminator(buf, start + PREFIX.length);
      if (end === null) {
        if (buf.length - start > MAX_MARKER_BYTES) data(buf.subarray(start));
        else this.pending = buf.slice(start);
        break;
      }
      const payload = new TextDecoder().decode(buf.subarray(start + PREFIX.length, end.index));
      const marker = parseMarker(payload);
      if (marker) events.push({ type: "marker", marker });
      pos = end.index + end.length;
    }
    return events;
  }
}
