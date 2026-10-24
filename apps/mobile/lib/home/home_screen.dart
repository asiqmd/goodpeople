import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_screen.dart';
import '../profile/profile_screen.dart';
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

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final access = ref.watch(tenantAccessProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(access.value?.tenant.name ?? session.tenant.name),
        actions: [
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

class _AccessDetails extends StatelessWidget {
  const _AccessDetails({required this.view, required this.user});

  final TenantAccessView view;
  final AuthUser user;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final tenant = view.tenant;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        AccessBanner(state: view.access.accessState),
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
/// profile or Leave.
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
