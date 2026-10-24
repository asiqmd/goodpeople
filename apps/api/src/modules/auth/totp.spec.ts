import {
  base32Decode,
  base32Encode,
  hashCode,
  newRecoveryCodes,
  totpAt,
  verifyTotp,
} from './totp.js';

// RFC 6238 appendix B: the SHA-1 secret is the ASCII bytes "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('totp', () => {
  it('matches the RFC 6238 test vectors (last six digits)', () => {
    expect(totpAt(RFC_SECRET, new Date(59_000))).toBe('287082');
    expect(totpAt(RFC_SECRET, new Date(1_111_111_109_000))).toBe('081804');
    expect(totpAt(RFC_SECRET, new Date(1_234_567_890_000))).toBe('005924');
    expect(totpAt(RFC_SECRET, new Date(2_000_000_000_000))).toBe('279037');
  });

  it('accepts the neighbouring 30-second steps and nothing further', () => {
    const now = new Date(1_234_567_890_000);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, new Date(now.getTime() - 30_000)), now)).toBe(
      true,
    );
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, new Date(now.getTime() + 30_000)), now)).toBe(
      true,
    );
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, new Date(now.getTime() - 90_000)), now)).toBe(
      false,
    );
    expect(verifyTotp(RFC_SECRET, '12345', now)).toBe(false);
  });

  it('round-trips base32', () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
  });

  it('makes distinct recovery codes and hashes them case-blind', () => {
    const codes = newRecoveryCodes();
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) expect(code).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(hashCode(codes[0]!.toUpperCase())).toBe(hashCode(codes[0]!));
  });
});
