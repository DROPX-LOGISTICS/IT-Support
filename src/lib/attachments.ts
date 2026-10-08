export const MAX_FILES = 5;
export const MAX_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MIME = ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"] as const;

export type FileMeta = { name: string; type: string; size: number };

export function validateFiles(files: FileMeta[]): string | null {
  if (files.length > MAX_FILES) return `Attach up to ${MAX_FILES} files.`;
  for (const f of files) {
    if (f.size <= 0) return `${f.name} is empty.`;
    if (f.size > MAX_BYTES) return `${f.name} is larger than 5 MB.`;
    if (!(ALLOWED_MIME as readonly string[]).includes(f.type)) return `${f.name} must be an image or PDF.`;
  }
  return null;
}

/** Checks the real file signature, so a renamed file cannot pass as an image. */
export function sniffMime(bytes: Uint8Array): (typeof ALLOWED_MIME)[number] | null {
  const startsWith = (sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (startsWith([0x25, 0x50, 0x44, 0x46])) return "application/pdf";
  return null;
}

export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(-80);
  return cleaned || "file";
}

export function storagePath(ticketId: string, uniqueId: string, name: string): string {
  return `${ticketId}/${uniqueId}-${safeFileName(name)}`;
}
