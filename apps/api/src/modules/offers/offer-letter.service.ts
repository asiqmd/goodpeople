import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { grades, legalEntities, locations, orgUnits, type FieldCipher, type Tx } from '@gp/db';
import { formatAddress, todayIn, type OfferLanguage } from '@gp/shared';
import { eq } from 'drizzle-orm';
import { FIELD_CIPHER } from '../../db/db.module.js';
import type { FileStore } from '../../storage/file-store.js';
import { FILE_STORE } from '../../storage/storage.module.js';
import { PdfService } from '../letters/pdf.service.js';
import { offerLetterHtml, type OfferLetterData } from './offer-letter.js';
import { offerRef, positionOf, type OfferContext } from './offer-records.js';

/** Each accepted letter is encrypted for its own purpose, so files cannot be swapped. */
const letterPurpose = (storageKey: string) => `offer-letter:${storageKey.split('/').pop()}`;

/** The offer letter: rendered for a preview, and kept encrypted once the candidate accepts. */
@Injectable()
export class OfferLetterService {
  constructor(
    private readonly pdf: PdfService,
    @Inject(FILE_STORE) private readonly store: FileStore,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  /** What the letter says, read inside the workspace's transaction. */
  async data(tx: Tx, ctx: OfferContext, language: OfferLanguage): Promise<OfferLetterData> {
    const { offer } = ctx;
    const [entity] = await tx
      .select()
      .from(legalEntities)
      .where(eq(legalEntities.id, offer.legalEntityId));
    const [unit] = offer.orgUnitId
      ? await tx.select().from(orgUnits).where(eq(orgUnits.id, offer.orgUnitId))
      : [];
    const [location] = offer.locationId
      ? await tx.select().from(locations).where(eq(locations.id, offer.locationId))
      : [];
    const [grade] = offer.gradeId
      ? await tx.select().from(grades).where(eq(grades.id, offer.gradeId))
      : [];
    const position = await positionOf(tx, ctx);
    return {
      language,
      refNo: offerRef(offer.id),
      date: offer.sentAt ? todayIn('Asia/Dhaka', offer.sentAt) : todayIn(),
      company: {
        name: entity?.legalName ?? entity?.name ?? '',
        address: entity?.address ? formatAddress(entity.address, language) : '',
      },
      candidate: ctx.candidate.fullName,
      position: position[language],
      unit: unit ? ((language === 'bn' ? unit.nameBn : null) ?? unit.name) : null,
      location: location?.name ?? null,
      grade: grade?.name ?? null,
      employmentType: offer.employmentType,
      joiningOn: offer.joiningOn,
      monthlyGross: offer.monthlyGross,
      probationMonths: offer.probationMonths,
      expiresOn: offer.expiresOn,
      terms: offer.terms,
    };
  }

  render(data: OfferLetterData): Promise<Buffer> {
    return this.pdf.render(offerLetterHtml(data));
  }

  /** Encrypts and stores the letter as accepted; returns its key and the SHA-256 of its bytes. */
  async keep(tenantId: string, offerId: string, bytes: Buffer) {
    const storageKey = `tenants/${tenantId}/offers/${offerId}/${randomUUID()}`;
    await this.store.put(
      storageKey,
      this.cipher.encryptBytes(bytes, { tenantId, purpose: letterPurpose(storageKey) }),
    );
    return { storageKey, sha256: createHash('sha256').update(bytes).digest('hex') };
  }

  async kept(tenantId: string, storageKey: string): Promise<Buffer> {
    const stored = await this.store.get(storageKey);
    return this.cipher.decryptBytes(stored, { tenantId, purpose: letterPurpose(storageKey) });
  }

  fileName(offerId: string, language: OfferLanguage) {
    return `${offerRef(offerId).toLowerCase()}-${language}.pdf`;
  }
}
