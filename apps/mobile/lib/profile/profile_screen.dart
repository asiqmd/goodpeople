import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../resignation/resignation_screen.dart';
import '../ui/format.dart';
import '../ui/language_menu.dart';
import '../ui/load_error_view.dart';
import 'my_employee_provider.dart';

/// The signed-in user's own employee record, read-only.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  static const headerKey = ValueKey('profile-header');
  static const paymentAccountsKey = ValueKey('profile-payment-accounts');
  static const emptyStateKey = ValueKey('profile-empty');
  static const resignationKey = ValueKey('profile-resignation');

  static ValueKey<String> paymentAccountKey(String id) =>
      ValueKey('payment-account-$id');

  static Route<void> route() =>
      MaterialPageRoute(builder: (context) => const ProfileScreen());

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final employee = ref.watch(myEmployeeProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.myProfile),
        actions: const [LanguageMenuButton()],
      ),
      body: SafeArea(
        child: switch (employee) {
          AsyncData(value: final EmployeeDetail detail) => _ProfileDetails(
            employee: detail,
          ),
          AsyncData() => const _NoEmployeeRecord(),
          AsyncError(:final error)
              when !employee.isLoading && error is! SessionExpiredException =>
            LoadErrorView(
              title: l10n.loadProfileFailed,
              error: error,
              onRetry: () => ref.invalidate(myEmployeeProvider),
            ),
          _ => const Center(child: CircularProgressIndicator()),
        },
      ),
    );
  }
}

class _ProfileDetails extends StatelessWidget {
  const _ProfileDetails({required this.employee});

  final EmployeeDetail employee;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final e = employee;
    final job = e.currentJob;
    // Only the documents on file.
    final identity = [
      for (final (label, number) in [
        (l10n.nidLabel, e.identity.nid),
        (l10n.birthRegistrationLabel, e.identity.birthRegistration),
        (l10n.passportLabel, e.identity.passport),
        (l10n.tinLabel, e.identity.tin),
      ])
        if (number case final number? when number.isNotEmpty) (label, number),
    ];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _Header(employee: e),
        _Section(
          title: l10n.profileJob,
          children: [
            if (job == null)
              Text(l10n.noCurrentJob)
            else ...[
              _Field(label: l10n.legalEntityLabel, value: job.legalEntity.name),
              if (job.location case final location?)
                _Field(label: l10n.locationLabel, value: location.name),
              if (job.orgUnit case final unit?)
                _Field(label: l10n.orgUnitLabel, value: unit.name),
              if (job.designation case final designation?)
                _Field(label: l10n.designationLabel, value: designation.name),
              if (job.grade case final grade?)
                _Field(label: l10n.gradeLabel, value: grade.name),
              if (job.manager case final manager?)
                _Field(
                  label: l10n.managerLabel,
                  value: l10n.managerValue(
                    manager.fullName,
                    manager.employeeCode,
                  ),
                ),
              _Field(
                label: l10n.employmentTypeLabel,
                value: l10n.employmentTypeName(job.employmentType.wire),
              ),
              _Field(
                label: l10n.workerCategoryLabel,
                value: l10n.workerCategoryName(job.workerCategory.wire),
              ),
            ],
            _Field(
              label: l10n.joinedOnLabel,
              value: formatDate(l10n, e.joinedOn),
            ),
            if (e.confirmedOn case final confirmed?)
              _Field(
                label: l10n.confirmedOnLabel,
                value: formatDate(l10n, confirmed),
              )
            else if (e.probationEndsOn case final probationEnds?)
              _Field(
                label: l10n.probationEndsOnLabel,
                value: formatDate(l10n, probationEnds),
              ),
          ],
        ),
        _Section(
          title: l10n.profilePersonal,
          children: [
            _Field(label: l10n.fatherNameLabel, value: e.fatherName),
            _Field(label: l10n.motherNameLabel, value: e.motherName),
            _Field(
              label: l10n.dateOfBirthLabel,
              value: formatDate(l10n, e.dateOfBirth),
            ),
            _Field(
              label: l10n.genderLabel,
              value: l10n.genderName(e.gender.wire),
            ),
            if (e.religion case final religion?)
              _Field(
                label: l10n.religionLabel,
                value: l10n.religionName(religion.wire),
              ),
            if (e.bloodGroup case final bloodGroup?)
              _Field(
                label: l10n.bloodGroupLabel,
                value: bloodGroup == BloodGroup.unknown
                    ? l10n.unknownValue
                    : bloodGroup.wire,
              ),
            _Field(label: l10n.mobilePhoneLabel, value: e.mobilePhone),
          ],
        ),
        _Section(
          title: l10n.profileIdentity,
          children: [
            for (final (label, number) in identity)
              _Field(label: label, value: number),
            if (identity.isEmpty) const _NoneRecorded(),
          ],
        ),
        _Section(
          title: l10n.profileAddresses,
          children: [
            _Field(
              label: l10n.presentAddressLabel,
              value: _addressText(l10n, e.presentAddress),
            ),
            _Field(
              label: l10n.permanentAddressLabel,
              value: _addressText(l10n, e.permanentAddress),
            ),
          ],
        ),
        _Section(
          title: l10n.profileNominees,
          children: [
            for (final nominee in e.nominees)
              _Item(
                title: nominee.name,
                subtitle: l10n.nomineeDetails(
                  nominee.relation,
                  nominee.sharePercent,
                ),
              ),
            if (e.nominees.isEmpty) const _NoneRecorded(),
          ],
        ),
        _Section(
          key: ProfileScreen.paymentAccountsKey,
          title: l10n.profilePaymentAccounts,
          children: [
            for (final account in e.paymentAccounts)
              _PaymentAccountItem(
                key: ProfileScreen.paymentAccountKey(account.id),
                account: account,
              ),
            if (e.paymentAccounts.isEmpty) const _NoneRecorded(),
          ],
        ),
        // Last and plain: resigning is rare, and not what the profile is for.
        Padding(
          padding: const EdgeInsets.only(top: 24),
          child: Card.outlined(
            margin: EdgeInsets.zero,
            clipBehavior: Clip.antiAlias,
            child: ListTile(
              key: ProfileScreen.resignationKey,
              leading: const Icon(Icons.exit_to_app),
              title: Text(l10n.resignationTitle),
              subtitle: Text(l10n.resignationEntrySubtitle),
              trailing: const Icon(Icons.chevron_right),
              onTap: () =>
                  Navigator.of(context).push(ResignationScreen.route()),
            ),
          ),
        ),
      ],
    );
  }

  static bool _present(String? value) => value != null && value.isNotEmpty;

  /// Street line, then upazila, district, division and postcode.
  static String _addressText(AppLocalizations l10n, Address address) {
    final area = [
      if (address.upazila case final upazila? when upazila.isNotEmpty) upazila,
      address.district,
      l10n.divisionName(address.division.wire),
    ].join(', ');
    final postcode = address.postcode;
    return [
      address.line,
      _present(postcode) ? '$area $postcode' : area,
    ].join('\n');
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.employee});

  final EmployeeDetail employee;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final job = employee.currentJob;
    final role = [
      job?.designation?.name,
      job?.orgUnit?.name,
    ].nonNulls.join(' · ');

    return Card.outlined(
      key: ProfileScreen.headerKey,
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(employee.fullName, style: theme.textTheme.titleLarge),
            if (employee.fullNameBn case final nameBn? when nameBn.isNotEmpty)
              Text(nameBn, style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(
              employee.employeeCode,
              style: theme.textTheme.labelLarge?.copyWith(
                color: theme.colorScheme.primary,
              ),
            ),
            if (role.isNotEmpty)
              Text(
                role,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            if (employee.isAdolescent) ...[
              const SizedBox(height: 12),
              Chip(
                avatar: const Icon(Icons.shield_outlined),
                label: Text(l10n.adolescentWorker),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// A heading and an outlined card of rows.
class _Section extends StatelessWidget {
  const _Section({super.key, required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            child: Text(title, style: theme.textTheme.titleMedium),
          ),
          const SizedBox(height: 8),
          Card.outlined(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 12,
                children: children,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A label above its value, read out together.
class _Field extends StatelessWidget {
  const _Field({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return MergeSemantics(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: theme.textTheme.labelMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          Text(value, style: theme.textTheme.bodyLarge),
        ],
      ),
    );
  }
}

/// A list entry: a title and an optional subtitle.
class _Item extends StatelessWidget {
  const _Item({required this.title, this.subtitle});

  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return MergeSemantics(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: theme.textTheme.bodyLarge),
          if (subtitle case final subtitle?)
            Text(
              subtitle,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
        ],
      ),
    );
  }
}

/// Provider, method and the masked number only: no account name, branch or
/// routing number.
class _PaymentAccountItem extends StatelessWidget {
  const _PaymentAccountItem({super.key, required this.account});

  final PaymentAccount account;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final method = l10n.paymentMethodName(account.method.wire);
    final provider = account.provider;
    final masked = switch (account.accountNumberMasked) {
      final number? when number.isNotEmpty => maskAccountNumber(number),
      _ => null,
    };

    return MergeSemantics(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  provider == null || provider.isEmpty
                      ? method
                      : l10n.paymentProviderName(provider),
                  style: theme.textTheme.bodyLarge,
                ),
                if (provider != null && provider.isNotEmpty)
                  Text(
                    method,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                if (masked != null)
                  Text(
                    masked,
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
              ],
            ),
          ),
          if (account.isPrimary)
            Chip(
              avatar: const Icon(Icons.star_outline),
              label: Text(l10n.primaryAccount),
            ),
        ],
      ),
    );
  }
}

/// The server's masked account number, re-masked to its last four
/// characters if it ever arrives longer, so a full number never shows.
String maskAccountNumber(String masked) {
  final visible = masked.replaceAll(RegExp(r'[^0-9A-Za-z]'), '');
  if (visible.length <= 4) return masked;
  return '•••• ${visible.substring(visible.length - 4)}';
}

class _NoneRecorded extends StatelessWidget {
  const _NoneRecorded();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Text(
      AppLocalizations.of(context).noneRecorded,
      style: theme.textTheme.bodyMedium?.copyWith(
        color: theme.colorScheme.onSurfaceVariant,
      ),
    );
  }
}

/// The 404 case: this login has no employee record (usual for admins).
class _NoEmployeeRecord extends StatelessWidget {
  const _NoEmployeeRecord();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return Center(
      key: ProfileScreen.emptyStateKey,
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.badge_outlined,
              size: 48,
              color: theme.colorScheme.outline,
            ),
            const SizedBox(height: 16),
            Text(
              l10n.noEmployeeRecordTitle,
              style: theme.textTheme.titleMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(l10n.noEmployeeRecordBody, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}
