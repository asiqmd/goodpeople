import { Body, Controller, Get, Inject, Post, UseGuards, ConflictException } from '@nestjs/common';
import { commercialPrices, type Database } from '@gp/db';
import { commercialPriceInputSchema, INTERNATIONAL_CHECKOUT_ENABLED } from '@gp/shared';
import { desc } from 'drizzle-orm';
import type { z } from 'zod';
import { CurrentUser, type PlatformUser } from '../../common/auth-user.js';
import { zod } from '../../common/zod.js';
import { DB } from '../../db/db.module.js';
import { PlatformGuard, PlatformRolesOnly } from '../platform-admin/platform.guard.js';
import { AuditService } from '../audit/audit.service.js';
@Controller('platform/international/prices')
@UseGuards(PlatformGuard)
@PlatformRolesOnly('finance')
export class CommercialController {
  constructor(
    @Inject(DB) private db: Database,
    private audit: AuditService,
  ) {}
  @Get() async list() {
    return {
      prices: await this.db
        .select()
        .from(commercialPrices)
        .orderBy(desc(commercialPrices.effectiveFrom)),
      checkoutEnabled: INTERNATIONAL_CHECKOUT_ENABLED,
      merchantStatus: 'selection_and_acceptance_pending',
    };
  }
  @Post() async append(
    @CurrentUser() actor: PlatformUser,
    @Body(zod(commercialPriceInputSchema)) input: z.infer<typeof commercialPriceInputSchema>,
  ) {
    if (BigInt(input.seatPrice.replace('.', '')) === 0n)
      throw new ConflictException('A positive explicit price is required');
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(commercialPrices).values(input).returning();
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'international.price.append',
        tenantId: null,
        reason: input.reason,
        after: { ...input, id: row!.id },
      });
      return row;
    });
  }
}
