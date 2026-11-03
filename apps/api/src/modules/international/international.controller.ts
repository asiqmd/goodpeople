import { PdfService } from '../letters/pdf.service.js';
import { page, escapeHtml } from '../letters/render.js';
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  ConflictException,
  StreamableFile,
} from '@nestjs/common';
import { z } from 'zod';
import {
  internationalBankInputSchema,
  legalProfileInputSchema,
  statutoryProfileInputSchema,
  identifierInputSchema,
  type TenantWithAccess,
} from '@gp/shared';
import { CurrentUser, CurrentTenant, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { zod } from '../../common/zod.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { InternationalService } from './international.service.js';
import { OrgService } from '../org/org.service.js';
@Controller('tenant/international')
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('core_hr')
export class InternationalController {
  constructor(
    private service: InternationalService,
    private org: OrgService,
    private pdf: PdfService,
  ) {}
  @Get() @Permits('org.manage') overview(@CurrentUser() actor: AuthUser) {
    return this.service.overview(actor);
  }
  @Post('companies') @Permits('org.manage') async create(
    @CurrentUser() actor: AuthUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Body(
      zod(
        z
          .object({
            name: z.string().min(2).max(160),
            code: z.string().min(2).max(20),
            countryCode: z.enum(['BD', 'AE', 'SA']),
          })
          .strict(),
      ),
    )
    input: { name: string; code: string; countryCode: 'BD' | 'AE' | 'SA' },
  ) {
    await this.service.assertUnrestricted(actor);
    return this.org.createLegalEntity(actor, tenant, input);
  }
  @Post('profiles') @Permits('org.manage') profile(
    @CurrentUser() actor: AuthUser,
    @Body(zod(legalProfileInputSchema)) input: z.infer<typeof legalProfileInputSchema>,
  ) {
    return this.service.addProfile(actor, input);
  }
  @Get('employees/:id') @Permits('employees.identity') employee(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.employeeProfiles(actor, id);
  }
  @Post('employment-profiles') @Permits('employees.identity') employment(
    @CurrentUser() actor: AuthUser,
    @Body(zod(statutoryProfileInputSchema)) input: z.infer<typeof statutoryProfileInputSchema>,
  ) {
    return this.service.addEmployment(actor, input);
  }
  @Post('banks') @Permits('employees.write') bank(
    @CurrentUser() actor: AuthUser,
    @Body(zod(internationalBankInputSchema)) input: z.infer<typeof internationalBankInputSchema>,
  ) {
    return this.service.addBank(actor, input);
  }
  @Post('identifiers') @Permits('employees.identity') identifier(
    @CurrentUser() actor: AuthUser,
    @Body(zod(identifierInputSchema)) input: z.infer<typeof identifierInputSchema>,
  ) {
    return this.service.addIdentifier(actor, input);
  }
  @Get('clock/:id') @Permits('org.manage') clock(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(z.object({ instant: z.iso.datetime() }))) q: { instant: string },
  ) {
    return this.service.clock(actor, id, q.instant);
  }
  @Get('profile.pdf') @Permits('org.manage') async preview(
    @CurrentUser() actor: AuthUser,
    @Query(zod(z.object({ language: z.enum(['en', 'bn', 'ar']).default('en') })))
    q: { language: 'en' | 'bn' | 'ar' },
  ) {
    const data = await this.service.overview(actor),
      labels = {
        ar: {
          title: 'ملف تعريف الشركة - للمعلومات فقط',
          notice: 'هذا الملف للمعلومات فقط ولا يشكل اعتمادا قانونيا أو موافقة على الرواتب.',
          zone: 'المنطقة الزمنية',
          dates: 'فترة السريان',
          gregorian: 'ميلادي',
          hijri: 'هجري مطلوب - التحويل غير معتمد',
          open: 'غير محدد',
          existing: 'محرك بنغلاديش الحالي؛ حالة المصادر محفوظة',
          blocked: 'المعالجة النظامية محظورة حتى التأهيل',
        },
        bn: {
          title: 'কোম্পানির প্রেক্ষিত - শুধু তথ্যের জন্য',
          notice: 'এটি তথ্যের জন্য; আইনগত অনুমোদন বা বেতন চালুর অনুমতি নয়।',
          zone: 'সময় অঞ্চল',
          dates: 'কার্যকর সময়',
          gregorian: 'গ্রেগরীয়',
          hijri: 'হিজরি প্রয়োজন - রূপান্তর অনুমোদিত নয়',
          open: 'নির্দিষ্ট নয়',
          existing: 'বিদ্যমান বাংলাদেশ অ্যাডাপ্টার; উৎসের অবস্থা সংরক্ষিত',
          blocked: 'যোগ্যতা পর্যালোচনা পর্যন্ত আইনগত প্রক্রিয়া বন্ধ',
        },
        en: {
          title: 'Company context - informational preview',
          notice:
            'Informational only. This is not legal approval or permission to run statutory payroll.',
          zone: 'Time zone',
          dates: 'Effective period',
          gregorian: 'Gregorian',
          hijri: 'Hijri required - conversion unqualified',
          open: 'Open',
          existing: 'Existing BD adapter; source review status retained',
          blocked: 'Statutory processing blocked pending qualification',
        },
      };
    const label = labels[q.language];
    const body =
      '<h1>' +
      escapeHtml(label.title) +
      '</h1><p class="notice">' +
      escapeHtml(label.notice) +
      '</p>' +
      data.profiles
        .map(
          (profile) =>
            '<section><h2 dir="auto">' +
            escapeHtml(profile.companyName ?? profile.legalEntityId) +
            '</h2><p><bdi>' +
            escapeHtml([profile.countryCode, profile.currency, profile.regime].join(' / ')) +
            '</bdi></p><p>' +
            escapeHtml(label.zone) +
            ': <bdi>' +
            escapeHtml(profile.businessTimeZone) +
            '</bdi> / ' +
            escapeHtml(profile.calendar === 'gregorian' ? label.gregorian : label.hijri) +
            '</p><p>' +
            escapeHtml(label.dates) +
            ': <bdi>' +
            escapeHtml(profile.effectiveFrom + ' - ' + (profile.effectiveTo ?? label.open)) +
            '</bdi></p><p class="status">' +
            escapeHtml(
              profile.countryCode === 'BD' && profile.calendar === 'gregorian'
                ? label.existing
                : label.blocked,
            ) +
            '</p></section>',
        )
        .join('');
    const css =
      '@page{size:A4;margin:18mm}body{width:auto;margin:0;padding:0;font-size:11pt}h1{font-size:18pt;line-height:1.5;margin:0 0 6mm}h2{font-size:13pt;line-height:1.5;margin:0 0 3mm}p{margin:2mm 0;overflow-wrap:anywhere}section{break-inside:avoid;border:1px solid #d1d5db;padding:4mm;margin:5mm 0}.notice,.status{color:#4b5563}bdi{unicode-bidi:isolate;direction:ltr}';
    return new StreamableFile(await this.pdf.render(page(q.language, css, body)), {
      type: 'application/pdf',
      disposition: 'attachment; filename="company-context.pdf"',
    });
  }

  @Post('checkout') @Permits('org.manage') checkout() {
    throw new ConflictException({
      code: 'merchant_review_pending',
      message:
        'USD/AED checkout remains disabled until merchant sandbox and finance/tax acceptance',
    });
  }
}
