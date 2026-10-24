import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../ui/error_text.dart';
import '../ui/language_menu.dart';
import '../ui/notice_card.dart';
import '../ui/theme.dart';
import 'modules.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key, required this.session});

  final SignedIn session;

  static ValueKey<String> moduleTileKey(String feature) =>
      ValueKey('module-$feature');

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
            _LoadError(
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

class _LoadError extends StatelessWidget {
  const _LoadError({required this.error, required this.onRetry});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off, size: 48, color: theme.colorScheme.outline),
            const SizedBox(height: 16),
            Text(
              l10n.loadAccessFailed,
              style: theme.textTheme.titleMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(describeError(l10n, error), textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton.tonal(onPressed: onRetry, child: Text(l10n.retry)),
          ],
        ),
      ),
    );
  }
}
