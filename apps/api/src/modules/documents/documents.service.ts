import { createHash, randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { documents, employees, tenantUsers, type FieldCipher, type Tx } from '@gp/db';
import {
  addDays,
  sniffContentType,
  todayIn,
  type DocumentCategory,
  type DocumentSource,
  type DocumentUpdateInput,
  type DocumentUploadInput,
  type DocumentView,
} from '@gp/shared';
import { and, asc, desc, eq, inArray, isNull, lte, ne, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { currentTenantId } from '../../common/request-context.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import type { FileStore } from '../../storage/file-store.js';
import { FILE_STORE } from '../../storage/storage.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { employeeOfUser, isHr } from '../employees/employee.queries.js';

export type DocumentRow = typeof documents.$inferSelect;

export interface NewDocument {
  employeeId: string;
  category: DocumentCategory;
  title: string;
  fileName: string;
  bytes: Buffer;
  source: DocumentSource;
  refNo?: string | null;
  letterTemplateId?: string | null;
  issuedOn?: string | null;
  expiresOn?: string | null;
  visibleToEmployee: boolean;
  uploadedBy: string | null;
}

/** A file name safe to keep and to send back in a header. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  // oxlint-disable-next-line no-control-regex -- stripping control characters is the point
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, '').trim();
  return (cleaned || 'file').slice(0, 200);
}

const select = {
  d: documents,
  employee: {
    id: employees.id,
    employeeCode: employees.employeeCode,
    fullName: employees.fullName,
    fullNameBn: employees.fullNameBn,
  },
  uploadedBy: tenantUsers.name,
};

/**
 * The documents vault. Files are checked by their content (not their name), encrypted for
 * the workspace and the document before they reach the file store, and deleted from it when
 * a document is removed; the row stays as a record of what was there.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    @Inject(FILE_STORE) private readonly store: FileStore,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  /** Saves a file inside the caller's transaction. Refuses anything but PDF, JPEG, PNG and WebP. */
  async save(tx: Tx, input: NewDocument): Promise<DocumentRow> {
    const contentType = sniffContentType(input.bytes);
    if (!contentType) {
      throw new UnsupportedMediaTypeException({
        statusCode: 415,
        error: 'Unsupported Media Type',
        message: 'Upload a PDF, JPEG, PNG or WebP file',
        code: 'unsupported_file',
      });
    }
    const tenantId = currentTenantId();
    const id = randomUUID();
    const storageKey = `tenants/${tenantId}/documents/${id}`;
    await this.store.put(
      storageKey,
      this.cipher.encryptBytes(input.bytes, { tenantId, purpose: `document:${id}` }),
    );
    try {
      const [row] = await tx
        .insert(documents)
        .values({
          id,
          tenantId,
          employeeId: input.employeeId,
          category: input.category,
          title: input.title,
          fileName: cleanFileName(input.fileName),
          contentType,
          sizeBytes: input.bytes.length,
          sha256: createHash('sha256').update(input.bytes).digest('hex'),
          storageKey,
          source: input.source,
          refNo: input.refNo ?? null,
          letterTemplateId: input.letterTemplateId ?? null,
          issuedOn: input.issuedOn ?? null,
          expiresOn: input.expiresOn ?? null,
          visibleToEmployee: input.visibleToEmployee,
          uploadedBy: input.uploadedBy,
        })
        .returning();
      return row!;
    } catch (error) {
      await this.store.delete(storageKey);
      throw error;
    }
  }

  upload(
    actor: AuthUser,
    employeeId: string,
    file: { originalname: string; buffer: Buffer } | undefined,
    input: DocumentUploadInput,
  ): Promise<DocumentView> {
    return this.tenantDb.run(async (tx) => {
      if (!file) throw new NotFoundException('Attach a file');
      const [employee] = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.id, employeeId));
      if (!employee) throw new NotFoundException('Employee not found');
      const row = await this.save(tx, {
        ...input,
        category: input.category as DocumentCategory,
        employeeId,
        fileName: file.originalname,
        bytes: file.buffer,
        source: 'upload',
        uploadedBy: actor.id,
      });
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'document.upload',
        entityType: 'document',
        entityId: row.id,
        after: { employeeId, category: row.category, title: row.title, sizeBytes: row.sizeBytes },
      });
      return (await this.load(tx, eq(documents.id, row.id)))[0]!;
    });
  }

  async load(tx: Tx, where: SQL | undefined): Promise<DocumentView[]> {
    const rows = await tx
      .select(select)
      .from(documents)
      .innerJoin(employees, eq(employees.id, documents.employeeId))
      .leftJoin(tenantUsers, eq(tenantUsers.id, documents.uploadedBy))
      .where(and(isNull(documents.deletedAt), where))
      .orderBy(desc(documents.createdAt));
    return rows.map(({ d, employee, uploadedBy }) => ({
      id: d.id,
      employee,
      category: d.category,
      title: d.title,
      fileName: d.fileName,
      contentType: d.contentType,
      sizeBytes: d.sizeBytes,
      source: d.source,
      refNo: d.refNo,
      issuedOn: d.issuedOn,
      expiresOn: d.expiresOn,
      visibleToEmployee: d.visibleToEmployee,
      uploadedBy,
      createdAt: d.createdAt.toISOString(),
    }));
  }

  /** An employee's documents for HR, without the punch selfies (those show with punches). */
  forEmployee(employeeId: string): Promise<DocumentView[]> {
    return this.tenantDb.run((tx) =>
      this.load(
        tx,
        and(eq(documents.employeeId, employeeId), ne(documents.category, 'punch_selfie')),
      ),
    );
  }

  /** What HR has shared with the signed-in employee. */
  mine(user: AuthUser): Promise<DocumentView[]> {
    return this.tenantDb.run(async (tx) => {
      const me = await employeeOfUser(tx, user.id);
      if (!me) throw new NotFoundException('No employee record is linked to your login');
      return this.load(
        tx,
        and(
          eq(documents.employeeId, me.id),
          eq(documents.visibleToEmployee, true),
          ne(documents.category, 'punch_selfie'),
        ),
      );
    });
  }

  /** Expired and soon-to-expire documents, soonest first. */
  expiring(days: number): Promise<DocumentView[]> {
    return this.tenantDb.run(async (tx) =>
      (await this.load(tx, lte(documents.expiresOn, addDays(todayIn(), days)))).toSorted((a, b) =>
        (a.expiresOn ?? '').localeCompare(b.expiresOn ?? ''),
      ),
    );
  }

  /**
   * The file, decrypted. HR may read any; an employee only their own documents that are
   * shared with them.
   */
  async read(user: AuthUser, id: string): Promise<{ document: DocumentRow; bytes: Buffer }> {
    const document = await this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .select()
        .from(documents)
        .where(and(eq(documents.id, id), isNull(documents.deletedAt)));
      if (!row) throw new NotFoundException('Document not found');
      if (!isHr(user)) {
        const me = await employeeOfUser(tx, user.id);
        if (me?.id !== row.employeeId || !row.visibleToEmployee) {
          throw new ForbiddenException('This document is not shared with you');
        }
      }
      return row;
    });
    const stored = await this.store.get(document.storageKey);
    return {
      document,
      bytes: this.cipher.decryptBytes(stored, {
        tenantId: document.tenantId,
        purpose: `document:${document.id}`,
      }),
    };
  }

  update(actor: AuthUser, id: string, input: DocumentUpdateInput): Promise<DocumentView> {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .update(documents)
        .set({ ...input, category: input.category as DocumentCategory | undefined })
        .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
        .returning();
      if (!row) throw new NotFoundException('Document not found');
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'document.update',
        entityType: 'document',
        entityId: id,
        after: input,
      });
      return (await this.load(tx, eq(documents.id, id)))[0]!;
    });
  }

  /** Removes the file for good and keeps the row as a record that it existed. */
  async remove(actor: AuthUser, id: string): Promise<void> {
    const key = await this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .update(documents)
        .set({ deletedAt: new Date(), deletedBy: actor.id })
        .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
        .returning();
      if (!row) throw new NotFoundException('Document not found');
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'document.delete',
        entityType: 'document',
        entityId: id,
        before: { employeeId: row.employeeId, category: row.category, title: row.title },
      });
      return row.storageKey;
    });
    await this.store.delete(key);
  }

  /** The newest photo of each employee, for ID cards. */
  async photos(
    tx: Tx,
    employeeIds: string[],
  ): Promise<Map<string, { bytes: Buffer; contentType: string }>> {
    const out = new Map<string, { bytes: Buffer; contentType: string }>();
    if (employeeIds.length === 0) return out;
    const rows = await tx
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.category, 'photo'),
          isNull(documents.deletedAt),
          inArray(documents.employeeId, employeeIds),
        ),
      )
      .orderBy(asc(documents.createdAt));
    for (const row of rows) {
      const stored = await this.store.get(row.storageKey);
      out.set(row.employeeId, {
        contentType: row.contentType,
        bytes: this.cipher.decryptBytes(stored, {
          tenantId: row.tenantId,
          purpose: `document:${row.id}`,
        }),
      });
    }
    return out;
  }
}
