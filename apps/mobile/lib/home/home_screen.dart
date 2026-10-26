import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../account/account_screen.dart';
import '../api/api_models.dart';
import '../attendance/attendance_screen.dart';
import '../attendance/offline_punch_queue.dart';
import '../auth/auth_controller.dart';
import '../documents/documents_screen.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_screen.dart';
import '../notifications/inbox_screen.dart';
import '../notifications/notification_providers.dart';
import '../payslips/my_pay_screen.dart';
import '../profile/profile_screen.dart';
import '../team/team_providers.dart';
import '../team/team_screen.dart';
import '../timesheets/timesheet_screen.dart';
import '../ui/format.dart';
import '../ui/language_menu.dart';
import '../ui/load_error_view.dart';
import '../ui/notice_card.dart';
import '../ui/theme.dart';
import 'modules.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key, required this.session});

  final SignedIn session;

  static ValueKey<String> moduleTileKey(String feature) =>
      ValueKey('module-$feature');

  static const myProfileKey = ValueKey('home-my-profile');
  static const leaveKey = ValueKey('home-leave');
  static const attendanceKey = ValueKey('home-attendance');
  static const documentsKey = ValueKey('home-documents');
  static const myPayKey = ValueKey('home-my-pay');
  static const teamKey = ValueKey('home-team');
  static const timesheetKey = ValueKey('home-timesheet');
  static const accountKey = ValueKey('home-account');
  static const inboxKey = ValueKey('home-inbox');
  static const inboxBadgeKey = ValueKey('home-inbox-badge');
  static const refusedPunchKey = ValueKey('home-refused-punch');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final access = ref.watch(tenantAccessProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(access.value?.tenant.name ?? session.tenant.name),
        actions: [
          const _InboxButton(),
          const LanguageMenuButton(),
          IconButton(
            tooltip: l10n.signOut,
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authProvider.notifier).signOut(),
          ),
        ],
      ),
      body: SafeArea(
        child: switch (access) {
          AsyncData(:final value) => _AccessDetails(
            view: value,
            user: session.user,
          ),
          AsyncError(:final error)
              when !access.isLoading && error is! SessionExpiredException =>
            LoadErrorView(
              title: l10n.loadAccessFailed,
              error: error,
              onRetry: () => ref.invalidate(tenantAccessProvider),
            ),
          _ => const Center(child: CircularProgressIndicator()),
        },
      ),
    );
  }
}

/// The bell: opens the inbox, with the unread count as a badge.
class _InboxButton extends ConsumerWidget {
  const _InboxButton();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final unread = ref.watch(notificationInboxProvider).value?.unread ?? 0;
    return IconButton(
      key: HomeScreen.inboxKey,
      tooltip: l10n.notificationsUnread(unread),
      onPressed: () => Navigator.of(context).push(InboxScreen.route()),
      icon: Badge(
        key: HomeScreen.inboxBadgeKey,
        isLabelVisible: unread > 0,
        label: Text(unread > 99 ? '99+' : formatNumber(l10n, unread)),
        child: Icon(
          unread > 0 ? Icons.notifications : Icons.notifications_none,
        ),
      ),
    );
  }
}

class _AccessDetails extends ConsumerWidget {
  const _AccessDetails({required this.view, required this.user});

  final TenantAccessView view;
  final AuthUser user;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final tenant = view.tenant;
    final hasTeam = ref.watch(hasTeamProvider);
    final refusedPunches = ref
        .watch(offlinePunchQueueProvider)
        .refusedFor(user.id);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        AccessBanner(state: view.access.accessState),
        if (refusedPunches.isNotEmpty) ...[
          Semantics(
            button: true,
            child: GestureDetector(
              key: HomeScreen.refusedPunchKey,
              onTap: () => Navigator.of(context).push(AttendanceScreen.route()),
              child: NoticeCard(
                icon: Icons.cloud_off_outlined,
                message: l10n.homePunchRefused,
                background: theme.colorScheme.errorContainer,
                foreground: theme.colorScheme.onErrorContainer,
              ),
            ),
          ),
          const SizedBox(height: 16),
        ],
        Card.outlined(
          margin: EdgeInsets.zero,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(tenant.name, style: theme.textTheme.titleLarge),
                const SizedBox(height: 4),
                Text(
                  l10n.signedInAs(user.name),
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 32,
                  runSpacing: 12,
                  children: [
                    _Fact(
                      label: l10n.planLabel,
                      value: l10n.planName(tenant.planCode.wire),
                    ),
                    _Fact(
                      label: l10n.billingLabel,
                      value: l10n.billingModeName(tenant.billingMode.wire),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        _ShortcutCard(
          key: HomeScreen.myProfileKey,
          icon: Icons.badge_outlined,
          title: l10n.myProfile,
          subtitle: l10n.myProfileSubtitle,
          onTap: () => Navigator.of(context).push(ProfileScreen.route()),
        ),
        if (view.access.hasFeature('leave')) ...[
          const SizedBox(height: 12),
          _ShortcutCard(
            key: HomeScreen.leaveKey,
            icon: Icons.event_available_outlined,
            title: l10n.leaveTitle,
            subtitle: l10n.leaveSubtitle,
            onTap: () => Navigator.of(context).push(LeaveScreen.route()),
          ),
        ],
        if (view.access.hasFeature('attendance')) ...[
          const SizedBox(height: 12),
          _ShortcutCard(
            key: HomeScreen.attendanceKey,
            icon: Icons.fingerprint,
            title: l10n.attendanceTitle,
            subtitle: l10n.attendanceSubtitle,
            onTap: () => Navigator.of(context).push(AttendanceScreen.route()),
          ),
        ],
        // Part of core HR, which every plan has.
        if (view.access.hasFeature('core_hr')) ...[
          const SizedBox(height: 12),
          _ShortcutCard(
            key: HomeScreen.documentsKey,
            icon: Icons.folder_outlined,
            title: l10n.documentsTitle,
            subtitle: l10n.documentsSubtitle,
            onTap: () => Navigator.of(context).push(DocumentsScreen.route()),
          ),
        ],
        // Staff charged to donor-funded projects (the NGO pack).
        if (view.access.hasFeature('projects')) ...[
          const SizedBox(height: 12),
          _ShortcutCard(
            key: HomeScreen.timesheetKey,
            icon: Icons.timer_outlined,
            title: l10n.timesheetTitle,
            subtitle: l10n.timesheetSubtitle,
            onTap: () => Navigator.of(context).push(TimesheetScreen.route()),
          ),
        ],
        if (view.access.hasFeature('payroll')) ...[
          const SizedBox(height: 12),
          _ShortcutCard(
            key: HomeScreen.myPayKey,
            icon: Icons.payments_outlined,
            title: l10n.myPayTitle,
            subtitle: l10n.myPaySubtitle,
            onTap: () => Navigator.of(context).push(MyPayScreen.route()),
          ),
        ],
        if (hasTeam) ...[
          const SizedBox(height: 12),
          _ShortcutCard(
            key: HomeScreen.teamKey,
            icon: Icons.groups_outlined,
            title: l10n.teamTitle,
            subtitle: l10n.teamSubtitle,
            onTap: () => Navigator.of(context).push(TeamScreen.route()),
          ),
        ],
        const SizedBox(height: 12),
        _ShortcutCard(
          key: HomeScreen.accountKey,
          icon: Icons.manage_accounts_outlined,
          title: l10n.accountTitle,
          subtitle: l10n.accountSubtitle,
          onTap: () => Navigator.of(context).push(AccountScreen.route()),
        ),
        const SizedBox(height: 24),
        Text(l10n.yourModules, style: theme.textTheme.titleMedium),
        const SizedBox(height: 8),
        Card.outlined(
          margin: EdgeInsets.zero,
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              for (final (index, key) in moduleKeys.indexed) ...[
                if (index > 0) const Divider(height: 1),
                _ModuleTile(feature: key, enabled: view.access.hasFeature(key)),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// Explains a limited access state. Renders nothing for full access.
class AccessBanner extends StatelessWidget {
  const AccessBanner({super.key, required this.state});

  final AccessState state;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final status = StatusColors.of(context);

    final banner = switch (state) {
      AccessState.readOnly => NoticeCard(
        icon: Icons.visibility_outlined,
        title: l10n.readOnlyTitle,
        message: l10n.readOnlyBody,
        background: status.warningContainer,
        foreground: status.onWarningContainer,
      ),
      AccessState.suspended => NoticeCard(
        icon: Icons.block,
        title: l10n.suspendedTitle,
        message: l10n.suspendedBody,
        background: scheme.errorContainer,
        foreground: scheme.onErrorContainer,
      ),
      AccessState.full || AccessState.unknown => null,
    };
    if (banner == null) return const SizedBox.shrink();
    return Padding(padding: const EdgeInsets.only(bottom: 16), child: banner);
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: theme.textTheme.labelMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        Text(value, style: theme.textTheme.titleMedium),
      ],
    );
  }
}

class _ModuleTile extends StatelessWidget {
  const _ModuleTile({required this.feature, required this.enabled});

  final String feature;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final color = enabled ? scheme.primary : scheme.onSurfaceVariant;

    return ListTile(
      key: HomeScreen.moduleTileKey(feature),
      leading: Icon(
        enabled ? Icons.check_circle : Icons.lock_outline,
        color: color,
      ),
      title: Text(
        moduleLabel(l10n, feature),
        style: enabled ? null : TextStyle(color: scheme.onSurfaceVariant),
      ),
      trailing: Text(
        enabled ? l10n.moduleEnabled : l10n.moduleLocked,
        style: theme.textTheme.labelLarge?.copyWith(color: color),
      ),
    );
  }
}

/// A tappable card on the home screen that opens a section, such as My
/// profile, Leave, Attendance, My documents, Timesheet, My pay, Team or
/// Account.
class _ShortcutCard extends StatelessWidget {
  const _ShortcutCard({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Card.filled(
      margin: EdgeInsets.zero,
      color: scheme.secondaryContainer,
      clipBehavior: Clip.antiAlias,
      child: Semantics(
        button: true,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Icon(icon, color: scheme.onSecondaryContainer),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: scheme.onSecondaryContainer,
                        ),
                      ),
                      Text(
                        subtitle,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: scheme.onSecondaryContainer,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right, color: scheme.onSecondaryContainer),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
