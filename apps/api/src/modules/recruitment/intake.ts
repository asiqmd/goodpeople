import { randomUUID } from 'node:crypto';
import { applicationEvents, applications, candidates, type FieldCipher, type Tx } from '@gp/db';
import { normalizeBdMobile, type CandidateSource, type CV_TYPES } from '@gp/shared';
import { and, eq, isNull, or } from 'drizzle-orm';
import { conflict } from '../../common/errors.js';
import type { FileStore } from '../../storage/file-store.js';
import { cleanFileName } from '../documents/documents.service.js';

// How a candidate's application comes in, from the careers page or added by HR: the person
// found again by email or mobile, their CV stored encrypted, and the application opened. One
// place for both, so a person who applies twice is one candidate.

export type CvType = (typeof CV_TYPES)[number];

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const startsWith = (bytes: Buffer, text: string) =>
  bytes.length >= text.length && bytes.subarray(0, text.length).toString('latin1') === text;

/** A CV's type from its bytes: PDF, or a Word document (an Office package with word/). */
export function cvFileType(bytes: Buffer): CvType | null {
  if (startsWith(bytes, '%PDF-')) return 'application/pdf';
  if (startsWith(bytes, 'PK\x03\x04')) {
    const names = bytes.toString('latin1');
    return names.includes('[Content_Types].xml') && names.includes('word/document.xml')
      ? DOCX
      : null;
  }
  return null;
}

/** A safe name ending in the extension of what the file really is. */
export function cvFileName(fileName: string, type: CvType): string {
  const ext = type === 'application/pdf' ? '.pdf' : '.docx';
  const name = cleanFileName(fileName).slice(0, 150);
  return name.toLowerCase().endsWith(ext) ? name : `${name}${ext}`;
}

export interface CvUpload {
  bytes: Buffer;
  fileName: string;
}

export interface FileDeps {
  store: FileStore;
  cipher: FieldCipher;
}

const cvKey = (tenantId: string, candidateId: string, fileId: string) =>
  `tenants/${tenantId}/candidates/${candidateId}/${fileId}`;

/** Each CV file is encrypted for its own purpose, so files cannot be swapped between people. */
export const cvPurpose = (storageKey: string) => `candidate-cv:${storageKey.split('/').pop()}`;

/** Encrypts and stores a CV (already checked with cvFileType) and returns its columns. */
export async function storeCv(
  deps: FileDeps,
  tenantId: string,
  candidateId: string,
  cv: CvUpload,
  type: CvType,
) {
  const storageKey = cvKey(tenantId, candidateId, randomUUID());
  await deps.store.put(
    storageKey,
    deps.cipher.encryptBytes(cv.bytes, { tenantId, purpose: cvPurpose(storageKey) }),
  );
  return {
    cvStorageKey: storageKey,
    cvFileName: cvFileName(cv.fileName, type),
    cvContentType: type,
    cvSizeBytes: cv.bytes.length,
  };
}

export async function readCv(deps: FileDeps, tenantId: string, storageKey: string) {
  const stored = await deps.store.get(storageKey);
  return deps.cipher.decryptBytes(stored, { tenantId, purpose: cvPurpose(storageKey) });
}

export interface IntakeInput {
  tenantId: string;
  openingId: string;
  fullName: string;
  email?: string | null;
  /** Any Bangladeshi mobile form; stored as +8801XXXXXXXXX. */
  phone?: string | null;
  source: CandidateSource;
  referredByEmployeeId?: string | null;
  coverNote?: string | null;
  /**
   * The language emails to them use. A candidate's own application sets it; HR adding a known
   * person keeps theirs (HR changes it on the candidate's page).
   */
  language?: 'en' | 'bn';
  /** The candidate's consent to process the application (required on the careers page). */
  consent: boolean;
  talentPool?: boolean;
  cv?: { upload: CvUpload; type: CvType } | null;
  /** Null when the candidate applied themselves. */
  actorUserId: string | null;
}

export interface IntakeResult {
  candidateId: string;
  applicationId: string;
  /** False when the person was already a candidate (found by email or mobile). */
  newCandidate: boolean;
  /**
   * The CV file a new one replaced. Delete it (`deps.store.delete`) only after the transaction
   * commits: deleting it inside, then rolling back, would leave the candidate pointing at
   * nothing.
   */
  replacedCvKey: string | null;
}

/**
 * Finds or creates the candidate and opens their application to the opening. Refuses a second
 * application to the same opening (409 `already_applied`). Runs in the caller's transaction,
 * inside the workspace (row-level security).
 */
export async function intake(tx: Tx, deps: FileDeps, input: IntakeInput): Promise<IntakeResult> {
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() ? normalizeBdMobile(input.phone) : null;
  const match = [
    ...(email ? [eq(candidates.email, email)] : []),
    ...(phone ? [eq(candidates.phone, phone)] : []),
  ];
  const [existing] = match.length
    ? await tx
        .select()
        .from(candidates)
        .where(and(isNull(candidates.erasedAt), or(...match)))
        .limit(1)
        .for('update')
    : [];

  const alreadyApplied = async (candidateId: string) => {
    const [row] = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(eq(applications.openingId, input.openingId), eq(applications.candidateId, candidateId)),
      );
    if (row) throw conflict('already_applied', 'This person has already applied for this job');
  };

  let candidateId: string;
  let replacedCvKey: string | null = null;
  if (existing) {
    candidateId = existing.id;
    // Before anything is stored: a refusal must not leave a new file or lose the old one.
    await alreadyApplied(candidateId);
    const cvColumns = input.cv
      ? await storeCv(deps, input.tenantId, candidateId, input.cv.upload, input.cv.type)
      : {};
    await tx
      .update(candidates)
      .set({
        // Keep what HR may have corrected; fill only what is missing.
        email: existing.email ?? email,
        phone: existing.phone ?? phone,
        language:
          input.actorUserId === null ? (input.language ?? existing.language) : existing.language,
        ...cvColumns,
        consentAt: input.consent ? new Date() : existing.consentAt,
        talentPool: existing.talentPool || !!input.talentPool,
        updatedAt: new Date(),
      })
      .where(eq(candidates.id, candidateId));
    if (input.cv) replacedCvKey = existing.cvStorageKey;
  } else {
    candidateId = randomUUID();
    const cvColumns = input.cv
      ? await storeCv(deps, input.tenantId, candidateId, input.cv.upload, input.cv.type)
      : {};
    await tx.insert(candidates).values({
      id: candidateId,
      tenantId: input.tenantId,
      fullName: input.fullName.trim(),
      email,
      phone,
      source: input.source,
      language: input.language ?? 'en',
      referredByEmployeeId: input.referredByEmployeeId ?? null,
      consentAt: input.consent ? new Date() : null,
      talentPool: !!input.talentPool,
      ...cvColumns,
    });
  }

  const [application] = await tx
    .insert(applications)
    .values({
      tenantId: input.tenantId,
      openingId: input.openingId,
      candidateId,
      source: input.source,
      coverNote: input.coverNote?.trim() || null,
    })
    .returning({ id: applications.id });
  await tx.insert(applicationEvents).values({
    tenantId: input.tenantId,
    applicationId: application!.id,
    kind: 'stage',
    toStage: 'applied',
    note: input.source,
    actorUserId: input.actorUserId,
  });
  return {
    candidateId,
    applicationId: application!.id,
    newCandidate: !existing,
    replacedCvKey,
  };
}
