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
