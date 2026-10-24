import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../config/app_config.dart';
import '../l10n/app_localizations.dart';
import '../ui/error_text.dart';
import '../ui/language_menu.dart';
import '../ui/notice_card.dart';
import 'auth_controller.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, this.sessionExpired = false});

  /// Shows a notice that the previous session ended.
  final bool sessionExpired;

  static const workspaceFieldKey = ValueKey('login-workspace');
  static const emailFieldKey = ValueKey('login-email');
  static const passwordFieldKey = ValueKey('login-password');
  static const submitKey = ValueKey('login-submit');

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  static final _emailPattern = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

  final _formKey = GlobalKey<FormState>();
  final _workspace = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();

  bool _submitting = false;
  bool _obscurePassword = true;
  Object? _error;

  @override
  void dispose() {
    _workspace.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting) return;
    if (!_formKey.currentState!.validate()) return;

    FocusScope.of(context).unfocus();
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      // On success the auth state changes and AuthGate shows HomeScreen.
      await ref
          .read(authProvider.notifier)
          .signIn(
            workspace: _workspace.text,
            email: _email.text,
            password: _password.text,
          );
    } on Exception catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final config = ref.watch(appConfigProvider);

    return Scaffold(
      appBar: AppBar(actions: const [LanguageMenuButton()]),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: AutofillGroup(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        l10n.appTitle,
                        style: theme.textTheme.headlineMedium?.copyWith(
                          color: theme.colorScheme.primary,
                          fontWeight: FontWeight.w600,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        l10n.signInSubtitle,
                        style: theme.textTheme.bodyLarge,
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 32),
                      if (widget.sessionExpired && _error == null) ...[
                        NoticeCard(
                          message: l10n.sessionExpired,
                          background: theme.colorScheme.secondaryContainer,
                          foreground: theme.colorScheme.onSecondaryContainer,
                          icon: Icons.info_outline,
                        ),
                        const SizedBox(height: 16),
                      ],
                      TextFormField(
                        key: LoginScreen.workspaceFieldKey,
                        controller: _workspace,
                        enabled: !_submitting,
                        decoration: InputDecoration(
                          labelText: l10n.workspace,
                          hintText: l10n.workspaceHint,
                          prefixIcon: const Icon(Icons.apartment_outlined),
                        ),
                        autocorrect: false,
                        enableSuggestions: false,
                        textInputAction: TextInputAction.next,
                        validator: (value) => (value ?? '').trim().isEmpty
                            ? l10n.workspaceRequired
                            : null,
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        key: LoginScreen.emailFieldKey,
                        controller: _email,
                        enabled: !_submitting,
                        decoration: InputDecoration(
                          labelText: l10n.email,
                          prefixIcon: const Icon(Icons.mail_outline),
                        ),
                        keyboardType: TextInputType.emailAddress,
                        autocorrect: false,
                        textInputAction: TextInputAction.next,
                        autofillHints: const [
                          AutofillHints.username,
                          AutofillHints.email,
                        ],
                        validator: (value) {
                          final email = (value ?? '').trim();
                          if (email.isEmpty) return l10n.emailRequired;
                          if (!_emailPattern.hasMatch(email)) {
                            return l10n.emailInvalid;
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        key: LoginScreen.passwordFieldKey,
                        controller: _password,
                        enabled: !_submitting,
                        obscureText: _obscurePassword,
                        decoration: InputDecoration(
                          labelText: l10n.password,
                          prefixIcon: const Icon(Icons.lock_outline),
                          suffixIcon: IconButton(
                            tooltip: _obscurePassword
                                ? l10n.showPassword
                                : l10n.hidePassword,
                            icon: Icon(
                              _obscurePassword
                                  ? Icons.visibility_outlined
                                  : Icons.visibility_off_outlined,
                            ),
                            onPressed: () => setState(
                              () => _obscurePassword = !_obscurePassword,
                            ),
                          ),
                        ),
                        textInputAction: TextInputAction.done,
                        autofillHints: const [AutofillHints.password],
                        onFieldSubmitted: (_) => _submit(),
                        validator: (value) => (value ?? '').isEmpty
                            ? l10n.passwordRequired
                            : null,
                      ),
                      if (_error case final error?) ...[
                        const SizedBox(height: 16),
                        NoticeCard(
                          message: describeError(l10n, error),
                          details: [
                            if (error is ApiException)
                              for (final issue in error.issues) issue.message,
                          ],
                          background: theme.colorScheme.errorContainer,
                          foreground: theme.colorScheme.onErrorContainer,
                          icon: Icons.error_outline,
                        ),
                      ],
                      const SizedBox(height: 24),
                      FilledButton(
                        key: LoginScreen.submitKey,
                        onPressed: _submitting ? null : _submit,
                        style: FilledButton.styleFrom(
                          minimumSize: const Size.fromHeight(52),
                        ),
                        child: _submitting
                            ? const SizedBox.square(
                                dimension: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.5,
                                ),
                              )
                            : Text(l10n.signIn),
                      ),
                      if (!config.isProd) ...[
                        const SizedBox(height: 24),
                        Text(
                          '${config.env.name} · ${config.apiBaseUrl}',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.outline,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
