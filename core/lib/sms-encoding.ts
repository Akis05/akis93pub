/**
 * Shared GSM-7 / UCS-2 encoding detection and segment counting.
 * Isomorphic (no server-only imports) so it can be used from client
 * components (live char counters) and server code (send pipeline) alike.
 */

const GSM_REGEX =
  /^[A-Za-z0-9@£$¥èéùìòÇ\nØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€\r]*$/;

export function requiresUnicode(text: string): boolean {
  return !GSM_REGEX.test(text);
}

export function computeSegments(text: string, unicode: boolean): number {
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  if (text.length <= single) return 1;
  return Math.ceil(text.length / multi);
}

export interface EncodingInfo {
  unicode: boolean;
  encoding: "GSM-7" | "UCS-2";
  length: number;
  segments: number;
  capacity: number;
  remaining: number;
}

/** Full breakdown used by UI char counters. */
export function computeEncodingInfo(text: string): EncodingInfo {
  const unicode = requiresUnicode(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const length = text.length;
  const segments = length === 0 ? 0 : length <= single ? 1 : Math.ceil(length / multi);
  const capacity = segments <= 1 ? single : multi * segments;
  return {
    unicode,
    encoding: unicode ? "UCS-2" : "GSM-7",
    length,
    segments,
    capacity,
    remaining: Math.max(0, capacity - length),
  };
}
