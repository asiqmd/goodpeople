import {
  All,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Redirect,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  billingSettingsSchema,
  choosePlanSchema,
  couponSchema,
  creditNoteSchema,
  deductionReviewSchema,
  deductionSchema,
  invoiceListQuerySchema,
  issueInvoicesSchema,
  manualPaymentSchema,
  partnerAssignSchema,
  partnerSchema,
  payslipLanguageSchema,
  payStartSchema,
  planPriceSchema,
  type BillingOverview,
  type BillingSettingsInput,
  type BillingSettingsView,
  type BillingSummary,
  type ChoosePlanInput,
  type CouponInput,
  type CouponView,
  type CreditNoteInput,
  type DeductionInput,
  type InvoiceListQuery,
  type InvoiceView,
  type ManualPaymentInput,
  type OnlineMethod,
  type PartnerInput,
  type PartnerView,
  type PlanPriceInput,
  type PlanPriceView,
  type StatementMatchView,
  type TenantWithAccess,
} from '@gp/shared';
import {
  CurrentTenant,
  CurrentUser,
  type AuthUser,
  type PlatformUser,
} from '../../common/auth-user.js';
import { badRequest } from '../../common/errors.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { Public } from '../auth/jwt-auth.guard.js';
import { fileResponse } from '../documents/documents.controller.js';
import { AccessStateGuard, WritableWhenReadOnly } from '../entitlements/guards.js';
import { PlatformGuard, PlatformRolesOnly } from '../platform-admin/platform.guard.js';
import { BillingPaymentsService } from './billing-payments.service.js';
import { BillingService } from './billing.service.js';

type TenantUser = Extract<AuthUser, { kind: 'tenant' }>;
const pdf = (file: { bytes: Buffer; fileName: string }) =>
  fileResponse(file.bytes, {
    contentType: 'application/pdf',
    fileName: file.fileName,
    download: false,
  });

/**
 * A workspace's own billing, for its owners and finance officers. Choosing a plan, paying and
 * recording tax withheld stay open while the workspace is read-only: that is how it gets out.
 */
@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, TenantRolesGuard)
@Permits('billing.manage')
@Controller('tenant/billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly payments: BillingPaymentsService,
  ) {}

  @Get()
  overview(@CurrentTenant() tenant: TenantWithAccess): Promise<BillingOverview> {
    return this.billing.overview(tenant);
  }

  @Post('plan')
  @HttpCode(200)
  @WritableWhenReadOnly()
  @ApiBody(openApiBody(choosePlanSchema))
  async choosePlan(
    @CurrentUser() user: TenantUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Body(zod(choosePlanSchema)) body: ChoosePlanInput,
  ): Promise<{ ok: true }> {
    await this.billing.choosePlan(user, tenant, body);
    return { ok: true };
  }

  @Post('cancel')
  @HttpCode(200)
  async cancel(@CurrentTenant() tenant: TenantWithAccess): Promise<{ ok: true }> {
    await this.billing.cancel(tenant);
    return { ok: true };
  }

  @Get('invoices/:id')
  invoice(
    @CurrentTenant() tenant: TenantWithAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InvoiceView> {
    return this.billing.invoiceFor(id, tenant.id);
  }

  @Get('invoices/:id/pdf')
  async invoicePdf(
    @CurrentTenant() tenant: TenantWithAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(payslipLanguageSchema)) query: { language: 'en' | 'bn' },
  ): Promise<StreamableFile> {
    return pdf(await this.billing.invoicePdf(id, query.language, tenant.id));
  }

  /** Starts an online payment; the browser goes on to the gateway's page. */
  @Post('invoices/:id/pay')
  @HttpCode(200)
  @WritableWhenReadOnly()
  @ApiBody(openApiBody(payStartSchema))
  pay(
    @CurrentUser() user: TenantUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(payStartSchema)) body: { method: OnlineMethod },
  ): Promise<{ redirectUrl: string }> {
    return this.payments.startCheckout(user, tenant, id, body.method);
  }

  /** VAT or income tax withheld at source, with its certificate. */
  @Post('invoices/:id/deductions')
  @WritableWhenReadOnly()
  @ApiBody(openApiBody(deductionSchema))
  deduction(
    @CurrentUser() user: TenantUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(deductionSchema)) body: DeductionInput,
  ): Promise<InvoiceView> {
    return this.payments.recordDeduction(user, tenant, id, body);
  }
}

/** Billing in the platform console: anyone on the platform reads, finance writes. */
@ApiTags('platform')
@ApiBearerAuth()
@UseGuards(PlatformGuard)
@Controller('platform/billing')
export class PlatformBillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly payments: BillingPaymentsService,
  ) {}

  @Get('summary')
  summary(): Promise<BillingSummary> {
    return this.billing.summary();
  }

  @Get('settings')
  settings(): Promise<BillingSettingsView | null> {
    return this.billing.settings();
  }

  @Put('settings')
  @PlatformRolesOnly('finance')
  @ApiBody(openApiBody(billingSettingsSchema))
  saveSettings(
    @CurrentUser() actor: PlatformUser,
    @Body(zod(billingSettingsSchema)) body: BillingSettingsInput,
  ): Promise<BillingSettingsView> {
    return this.billing.saveSettings(actor, body);
  }

  @Get('prices')
  prices(): Promise<PlanPriceView[]> {
    return this.billing.prices();
  }

  @Post('prices')
  @PlatformRolesOnly('finance')
  @ApiBody(openApiBody(planPriceSchema))
  addPrice(
    @CurrentUser() actor: PlatformUser,
    @Body(zod(planPriceSchema)) body: PlanPriceInput,
  ): Promise<PlanPriceView> {
    return this.billing.addPrice(actor, body);
  }

  @Get('coupons')
  coupons(): Promise<CouponView[]> {
    return this.billing.coupons();
  }

  @Post('coupons')
  @PlatformRolesOnly('finance')
  @ApiBody(openApiBody(couponSchema))
  addCoupon(
    @CurrentUser() actor: PlatformUser,
    @Body(zod(couponSchema)) body: CouponInput,
  ): Promise<CouponView> {
    return this.billing.addCoupon(actor, body);
  }

  @Get('partners')
  partners(): Promise<PartnerView[]> {
    return this.billing.partners();
  }

  @Post('partners')
  @PlatformRolesOnly('finance', 'partner_manager')
  @ApiBody(openApiBody(partnerSchema))
  addPartner(
    @CurrentUser() actor: PlatformUser,
    @Body(zod(partnerSchema)) body: PartnerInput,
  ): Promise<PartnerView> {
    return this.billing.addPartner(actor, body);
  }

  /** Bills a workspace to a partner (partner mode), or takes it back. */
  @Patch('tenants/:id/partner')
  @PlatformRolesOnly('finance', 'partner_manager')
  @ApiBody(openApiBody(partnerAssignSchema))
  async assignPartner(
    @CurrentUser() actor: PlatformUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(partnerAssignSchema)) body: { partnerId: string | null; reason: string },
  ): Promise<{ ok: true }> {
    await this.billing.assignPartner(actor, id, body.partnerId, body.reason);
    return { ok: true };
  }

  @Get('invoices')
  invoices(@Query(zod(invoiceListQuerySchema)) query: InvoiceListQuery): Promise<InvoiceView[]> {
    return this.billing.list(query);
  }

  @Get('invoices/:id')
  invoice(@Param('id', ParseUUIDPipe) id: string): Promise<InvoiceView> {
    return this.billing.invoiceFor(id);
  }

  @Get('invoices/:id/pdf')
  async invoicePdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(payslipLanguageSchema)) query: { language: 'en' | 'bn' },
  ): Promise<StreamableFile> {
    return pdf(await this.billing.invoicePdf(id, query.language));
  }

  /** Issues every invoice for a month that has not been issued yet. */
  @Post('issue')
  @HttpCode(200)
  @PlatformRolesOnly('finance')
  @ApiBody(openApiBody(issueInvoicesSchema))
  issue(
    @CurrentUser() actor: PlatformUser,
    @Body(zod(issueInvoicesSchema)) body: { month: string },
  ): Promise<{ month: string; issued: number }> {
    return this.billing.issueMonth(body.month, actor);
  }

  @Post('invoices/:id/payments')
  @PlatformRolesOnly('finance')
  @ApiBody(openApiBody(manualPaymentSchema))
  recordPayment(
    @CurrentUser() actor: PlatformUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(manualPaymentSchema)) body: ManualPaymentInput,
  ): Promise<InvoiceView> {
    return this.payments.recordManual(actor, id, body);
  }

  @Post('invoices/:id/credit-notes')
  @PlatformRolesOnly('finance')
  @ApiBody(openApiBody(creditNoteSchema))
  creditNote(
    @CurrentUser() actor: PlatformUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(creditNoteSchema)) body: CreditNoteInput,
  ): Promise<InvoiceView> {
    return this.billing.creditNote(actor, id, body);
  }

  /** Accepts or rejects tax a customer withheld, once the certificate is checked. */
  @Post('settlements/:id/review')
  @HttpCode(200)
  @PlatformRolesOnly('finance')
  @ApiBody(openApiBody(deductionReviewSchema))
  review(
    @CurrentUser() actor: PlatformUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(deductionReviewSchema)) body: { accept: boolean; reason: string },
  ): Promise<InvoiceView> {
    return this.payments.reviewDeduction(actor, id, body.accept, body.reason);
  }

  /** A bank statement (xlsx or csv): credits naming an invoice are recorded as paid. */
  @Post('statements')
  @HttpCode(200)
  @PlatformRolesOnly('finance')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  statement(
    @CurrentUser() actor: PlatformUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<StatementMatchView> {
    if (!file) throw badRequest('file_required', 'Attach the bank statement');
    return this.payments.matchStatement(actor, file);
  }
}

/**
 * What the gateways call: the customer's browser coming back (SSLCommerz posts, bKash gets),
 * and SSLCommerz's server-to-server notification. Nothing here is trusted until the gateway
 * confirms it; the public price list for the pricing page lives here too.
 */
@ApiTags('billing')
@Controller('billing')
export class BillingCallbacksController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly billing: BillingService,
    private readonly payments: BillingPaymentsService,
  ) {}

  @Public()
  @Get('prices')
  prices(): Promise<PlanPriceView[]> {
    return this.billing.currentPrices();
  }

  @Public()
  @All('return/:method/:paymentId')
  @Redirect()
  async returned(
    @Param('method') method: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Query() query: Record<string, string>,
    @Body() body: Record<string, string> | undefined,
  ): Promise<{ url: string; statusCode: number }> {
    const { outcome, invoiceNumber } = await this.payments.handleReturn(method, paymentId, {
      ...query,
      ...(body && typeof body === 'object' ? body : {}),
    });
    const params = new URLSearchParams({ [outcome]: invoiceNumber ?? '' });
    // 303: a gateway that posted the customer back is answered with a plain page load.
    return { url: `${this.config.WEB_ORIGIN}/workspace/billing?${params}`, statusCode: 303 };
  }

  @Public()
  @Post('notify/:method')
  @HttpCode(200)
  async notify(
    @Param('method') method: string,
    @Body() body: Record<string, string>,
  ): Promise<string> {
    await this.payments.notified(method, body ?? {});
    return 'OK';
  }
}
