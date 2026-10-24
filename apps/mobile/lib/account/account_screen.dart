import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../ui/language_menu.dart';
import '../ui/load_error_view.dart';
import 'change_password_screen.dart';

/// The signed-in login, from `GET /account`.
final accountProvider = FutureProvider.autoDispose<AccountView>(
  (ref) {
    if (ref.watch(authProvider) is! SignedIn) {
      throw const SessionExpiredException();
    }
    return ref.read(authProvider.notifier).fetchAccount();
  },
  // Retries go through the refresh logic in AuthController, not Riverpod's
  // backoff.
  retry: (retryCount, error) => null,
);

/// The signed-in login: who it is, how it signs in, and changing the
/// password. Two-step sign-in is set up in the web app, so here it only
/// says whether it is on.
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  static const changePasswordKey = ValueKey('account-change-password');
  static const twoStepKey = ValueKey('account-two-step');

  static Route<void> route() =>
      MaterialPageRoute(builder: (context) => const AccountScreen());

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final account = ref.watch(accountProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.accountTitle),
        actions: const [LanguageMenuButton()],
      ),
      body: SafeArea(
        child: switch (account) {
          AsyncData(:final value) => _AccountDetails(account: value),
          AsyncError(:final error)
              when !account.isLoading && error is! SessionExpiredException =>
            LoadErrorView(
              title: l10n.accountLoadFailed,
              error: error,
              onRetry: () => ref.invalidate(accountProvider),
            ),
          _ => const Center(child: CircularProgressIndicator()),
        },
      ),
    );
  }
}

class _AccountDetails extends StatelessWidget {
  const _AccountDetails({required this.account});

  final AccountView account;

  Future<void> _changePassword(BuildContext context) async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final changed = await Navigator.of(context)
        .push(ChangePasswordScreen.route());
    if (changed ?? false) {
      messenger.showSnackBar(SnackBar(content: Text(l10n.passwordChanged)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodyMedium?.copyWith(
      color: theme.colorScheme.onSurfaceVariant,
    );

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card.outlined(
          margin: EdgeInsets.zero,
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              _Row(label: l10n.accountName, value: account.name),
              const Divider(height: 1),
              _Row(
                label: l10n.email,
                value: account.email ?? l10n.accountNotSet,
              ),
              const Divider(height: 1),
              _Row(
                label: l10n.mobilePhoneLabel,
                value: account.phone ?? l10n.accountNotSet,
              ),
              const Divider(height: 1),
              _Row(
                label: l10n.accountRole,
                value: l10n.roleName(account.role.wire),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        Text(l10n.password, style: theme.textTheme.titleMedium),
        const SizedBox(height: 8),
        if (account.hasPassword)
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: FilledButton.tonalIcon(
              key: AccountScreen.changePasswordKey,
              onPressed: () => _changePassword(context),
              icon: const Icon(Icons.password),
              label: Text(l10n.changePassword),
            ),
          )
        else
          Text(l10n.accountNoPassword, style: muted),
        const SizedBox(height: 24),
        Text(l10n.accountTwoStep, style: theme.textTheme.titleMedium),
        const SizedBox(height: 8),
        Card.outlined(
          key: AccountScreen.twoStepKey,
          margin: EdgeInsets.zero,
          child: ListTile(
            leading: Icon(
              account.mfaEnabled ? Icons.verified_user : Icons.shield_outlined,
              color: account.mfaEnabled
                  ? theme.colorScheme.primary
                  : theme.colorScheme.onSurfaceVariant,
            ),
            title: Text(
              account.mfaEnabled
                  ? l10n.accountTwoStepOn
                  : l10n.accountTwoStepOff,
            ),
            subtitle: switch ([
              if (account.mfaRequired) l10n.accountTwoStepRequired,
              // Two-step sign-in is for logins with a password.
              if (account.hasPassword) l10n.accountTwoStepHint,
            ]) {
              final notes when notes.isNotEmpty => Text(notes.join(' ')),
              _ => null,
            },
          ),
        ),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return MergeSemantics(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              flex: 2,
              child: Text(
                label,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              flex: 3,
              child: Text(value, style: theme.textTheme.bodyLarge),
            ),
          ],
        ),
      ),
    );
  }
}
