import '../l10n/app_localizations.dart';

/// Feature keys from `access.features`, in display order.
const moduleKeys = [
  'core_hr',
  'leave',
  'attendance',
  'payroll',
  'bd_tax',
  'recruitment',
  'performance',
  'lms',
  'multi_entity',
  'api_access',
  'sso',
];

/// Localized module name for a feature key; unknown keys are shown as-is.
String moduleLabel(AppLocalizations l10n, String key) => switch (key) {
  'core_hr' => l10n.moduleCoreHr,
  'leave' => l10n.moduleLeave,
  'attendance' => l10n.moduleAttendance,
  'payroll' => l10n.modulePayroll,
  'bd_tax' => l10n.moduleBdTax,
  'recruitment' => l10n.moduleRecruitment,
  'performance' => l10n.modulePerformance,
  'lms' => l10n.moduleLms,
  'multi_entity' => l10n.moduleMultiEntity,
  'api_access' => l10n.moduleApiAccess,
  'sso' => l10n.moduleSso,
  _ => key,
};
