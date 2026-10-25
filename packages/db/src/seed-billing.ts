import type { PlanCode } from '@gp/shared';
import type { Database } from './client.js';
import { billingSettings, planPrices } from './schema/index.js';

/**
 * Development billing: a sample supplier (not a real BIN or bank account) and placeholder
 * prices, so plans can be chosen and invoiced locally. Production sets both in the console.
 */
export const SEED_PRICES: Record<
  PlanCode,
  { staffSeat: string; workerSeat: string; minimum: string }
> = {
  starter: { staffSeat: '120.00', workerSeat: '40.00', minimum: '1500.00' },
  growth: { staffSeat: '180.00', workerSeat: '60.00', minimum: '3000.00' },
  business: { staffSeat: '250.00', workerSeat: '80.00', minimum: '5000.00' },
  enterprise: { staffSeat: '300.00', workerSeat: '100.00', minimum: '25000.00' },
};
export const SEED_PRICES_FROM = '2026-07-01';

export async function seedBilling(db: Database, superAdminId: string) {
  await db
    .insert(billingSettings)
    .values({
      id: 1,
      supplierName: 'Good People Technologies Ltd (sample)',
      supplierAddress: 'House 10, Road 2, Gulshan 1, Dhaka 1212',
      bin: '000000000-0101',
      tin: null,
      serviceCode: 'S099.10',
      startupExempt: false,
      dueDays: 10,
      graceDays: 7,
      bankDetails:
        'Sample Bank PLC, Gulshan branch\nAccount name: Good People Technologies Ltd\nAccount number: 0000 0000 0000 0\nRouting number: 000000000\nWrite the invoice number in the payment reference.',
      updatedBy: superAdminId,
    })
    .onConflictDoNothing();
  await db
    .insert(planPrices)
    .values(
      Object.entries(SEED_PRICES).map(([planCode, price]) => ({
        planCode: planCode as PlanCode,
        ...price,
        effectiveFrom: SEED_PRICES_FROM,
        createdBy: superAdminId,
      })),
    )
    .onConflictDoNothing();
}
