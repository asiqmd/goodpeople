import { eq, desc } from 'drizzle-orm';
import { Inject } from '@nestjs/common';
import { DB } from '../db/tokens.js';
import {
  runAsTenant,
  companyLegalProfiles,
  payrollRuns,
  payGroups,
  jobAssignments,
  type Database,
} from '@gp/db';
import { setBusinessZoneResolver, localParts } from '@gp/shared';
import type { ServicePrincipal } from '../modules/integrations/authority.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import type { AuthedRequest, AuthUser } from './auth-user.js';

interface RequestContext {
  businessZone?: string;
  /** The request's reference; absent in background jobs. */
  requestId?: string;
  tenantId?: string;
  user?: AuthUser;
  service?: ServicePrincipal;
}

/** A request the request-ID middleware has seen. */
export interface IdentifiedRequest extends Request {
  requestId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();
setBusinessZoneResolver(() => {
  const zone = storage.getStore()?.businessZone;
  if (zone === 'explicit_required') throw new Error('explicit_time_zone_required');
  return zone ?? 'Asia/Dhaka';
});
export const currentPrincipal = () => storage.getStore()?.service ?? storage.getStore()?.user;
export const currentAuthUser = () => storage.getStore()?.user;

/** The tenant of the current request. Throws outside a tenant-authenticated request. */
export function currentTenantId(): string {
  const tenantId = storage.getStore()?.tenantId;
  if (!tenantId) throw new Error('No tenant in the request context');
  return tenantId;
}

/** The reference of the request being handled, for log lines; undefined outside a request. */
export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/** The request's reference, as the request-ID middleware set it. */
export function requestIdOf(req: Request): string | undefined {
  return (req as IdentifiedRequest).requestId;
}

/** Runs work outside a request (background jobs) as one tenant. */
export function runInTenantContext<T>(tenantId: string, fn: () => T, businessZone?: string): T {
  return storage.run({ tenantId, businessZone }, fn);
}

/** Runs the rest of a request's middleware with its reference in the context. */
export function runInRequestContext<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

/**
 * Runs each tenant request inside an async context that carries its tenant id: a workspace
 * user's, or an Edge Agent's or a kiosk's (whose tokens name the workspace). The request's
 * reference stays in it.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(@Inject(DB) private db: Database) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const service = (req as AuthedRequest & { service?: ServicePrincipal }).service;
    const tenantId =
      service?.tenantId ??
      (req.user?.kind === 'tenant'
        ? req.user.tenantId
        : (req.edgeAgent?.tenantId ?? req.kiosk?.tenantId));
    if (!tenantId) return next.handle();
    return new Observable((subscriber) => {
      let cancelled = false;
      let subscription: { unsubscribe(): void } | undefined;
      void runAsTenant(this.db, tenantId, async (tx) => {
        const profiles = await tx.select().from(companyLegalProfiles);
        const id = /^\/tenant\/employees\/([a-f0-9-]{36})(?:\/|$)/i.exec(req.path)?.[1];
        const jobs = id
          ? await tx
              .select()
              .from(jobAssignments)
              .where(eq(jobAssignments.employeeId, id))
              .orderBy(desc(jobAssignments.effectiveFrom))
          : [];
        const employeeCompany = jobs.find((j) => {
          const profile = profiles.find((p) => p.legalEntityId === j.legalEntityId);
          return (
            profile && j.effectiveFrom <= localParts(new Date(), profile.businessTimeZone).date
          );
        })?.legalEntityId;
        const runId = /\/payroll\/runs\/([a-f0-9-]{36})(?:\/|$)/i.exec(req.path)?.[1];
        const [run] = runId
          ? await tx.select().from(payrollRuns).where(eq(payrollRuns.id, runId))
          : [];
        const groupId = run?.payGroupId ?? req.body?.payGroupId ?? req.query.payGroupId;
        const [group] =
          typeof groupId === 'string' && /^[a-f0-9-]{36}$/i.test(groupId)
            ? await tx.select().from(payGroups).where(eq(payGroups.id, groupId))
            : [];
        const company = group?.legalEntityId ?? employeeCompany;
        return { profiles, company };
      })
        .then(({ profiles, company }) => {
          if (cancelled) return;
          const requested =
            (req.body as { legalEntityId?: string; job?: { legalEntityId?: string } } | undefined)
              ?.legalEntityId ??
            (req.body as { job?: { legalEntityId?: string } } | undefined)?.job?.legalEntityId ??
            req.query.legalEntityId ??
            company;
          const relevant =
            typeof requested === 'string'
              ? profiles.filter((p) => p.legalEntityId === requested)
              : profiles;
          const zones = [
            ...new Set(
              relevant
                .filter((p) => {
                  const date = localParts(new Date(), p.businessTimeZone).date;
                  return p.effectiveFrom <= date && (!p.effectiveTo || p.effectiveTo >= date);
                })
                .map((p) => p.businessTimeZone),
            ),
          ];
          subscription = storage.run(
            {
              requestId: requestIdOf(req),
              tenantId,
              user: req.user,
              service,
              businessZone: zones.length > 1 ? 'explicit_required' : (zones[0] ?? 'Asia/Dhaka'),
            },
            () => next.handle().subscribe(subscriber),
          );
        })
        .catch((error) => subscriber.error(error));
      return () => {
        cancelled = true;
        subscription?.unsubscribe();
      };
    });
  }
}
