export function signBundle(dir: string, key: string | Buffer): Promise<void>;
export function qualificationChecksFor(version: string): readonly string[];
export function verifyBundle(dir: string, key: string | Buffer): Promise<Record<string, unknown>>;
export function preflight(
  dir: string,
  key: string | Buffer,
  options?: { acceptCandidate?: boolean; checkDocker?: boolean },
): Promise<Record<string, unknown>>;
export function qualify(
  dir: string,
  publicKey: string | Buffer,
  privateKey: string | Buffer,
  evidenceDir: string,
): Promise<Record<string, unknown>>;

export function sourceProvenance(
  root: string,
): Promise<{ commit: string; treeSha256: string; dirty: boolean }>;
