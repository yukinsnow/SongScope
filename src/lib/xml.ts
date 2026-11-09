export function parseXml(text: string): Document {
  let src = text;
  if (!/xmlns:x\s*=/.test(src.slice(0, 4000))) {
    src = src.replace(/<([A-Za-z_][\w:.-]*)(\s|>)/, '<$1 xmlns:x="x"$2');
  }
  const doc = new DOMParser().parseFromString(src, "application/xml");
  const err = doc.getElementsByTagName("parsererror")[0];
  if (err) throw new Error("XML 解析失败: " + err.textContent?.slice(0, 300));
  return doc;
}

/** Attribute lookup that tolerates both "x:id" and plain "id". */
export function xid(el: Element): string | null {
  return el.getAttribute("x:id") ?? el.getAttribute("id");
}

export function attr(el: Element | null | undefined, ...names: string[]): string | null {
  if (!el) return null;
  for (const n of names) {
    const v = el.getAttribute(n);
    if (v !== null) return v;
  }
  return null;
}

export function kids(el: Element | null | undefined): Element[] {
  if (!el) return [];
  const out: Element[] = [];
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 1) out.push(n as Element);
  }
  return out;
}

export function child(el: Element | null | undefined, tag: string): Element | null {
  return kids(el).find((k) => k.tagName === tag) ?? null;
}

export function children(el: Element | null | undefined, tag: string): Element[] {
  return kids(el).filter((k) => k.tagName === tag);
}

/** Elements whose x:id (or id) equals value, optionally restricted by tag. */
export function byXid(root: ParentNode, value: string, tag?: string): Element[] {
  const all = root.querySelectorAll(tag ?? "*");
  const out: Element[] = [];
  for (const el of Array.from(all)) {
    if (xid(el) === value) out.push(el);
  }
  return out;
}

export function firstByXid(root: ParentNode, value: string, tag?: string): Element | null {
  return byXid(root, value, tag)[0] ?? null;
}

/** Direct child element with matching x:id. */
export function childByXid(el: Element, value: string, tag?: string): Element | null {
  return kids(el).reverse().find((k) => (!tag || k.tagName === tag) && xid(k) === value) ?? null;
}

export function descendants(el: Element, tag: string): Element[] {
  return Array.from(el.getElementsByTagName(tag));
}

export function s1Color(v: string | null | undefined): string | null {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const hex = (n >>> 0).toString(16).padStart(8, "0");
  // Studio One stores AABBGGRR
  const bb = hex.slice(2, 4), gg = hex.slice(4, 6), rr = hex.slice(6, 8);
  return "#" + rr + gg + bb;
}

export function isGuid(v: string | null | undefined): boolean {
  return !!v && /^\{[0-9A-Fa-f-]{36}\}$/.test(v.trim());
}

export function newGuid(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return "{" + [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join("-").toUpperCase() + "}";
}

export function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
