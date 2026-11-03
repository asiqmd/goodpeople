export function assuranceDigest(value: unknown): string;
export const ASSURANCE_REQUIRED_CORE: string[];
export function validateAssuranceReadiness(
  envelope: unknown,
  manifest: Record<string, unknown>,
  at?: Date,
): Record<string, unknown>;
