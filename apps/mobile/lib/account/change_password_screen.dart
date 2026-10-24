import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../ui/error_text.dart';
import '../ui/notice_card.dart';

/// Changes the signed-in login's password. Pops with `true` once changed.
///
/// The phone stays signed in (the API keeps this session's refresh token);
/// every other session of the login ends.
class ChangePasswordScreen extends ConsumerStatefulWidget {
  const ChangePasswordScreen({super.key});

  static const currentFieldKey = ValueKey('password-current');
  static const newFieldKey = ValueKey('password-new');
  static const confirmFieldKey = ValueKey('password-confirm');
  static const submitKey = ValueKey('password-submit');

  /// The API's minimum.
  static const minLength = 10;

  static Route<bool> route() =>
      MaterialPageRoute(builder: (context) => const ChangePasswordScreen());

  @override
  ConsumerState<ChangePasswordScreen> createState() =>
      _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends ConsumerState<ChangePasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _new = TextEditingController();
  final _confirm = TextEditingController();

  bool _saving = false;
  Object? _error;

  @override
  void dispose() {
    _current.dispose();
    _new.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_saving || !_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    final navigator = Navigator.of(context);
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref
          .read(authProvider.notifier)
          .changePassword(
            currentPassword: _current.text,
            newPassword: _new.text,
          );
      navigator.pop(true);
    } on SessionExpiredException {
      // AuthGate is already showing the login screen.
    } on Object catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final error = _error;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.changePassword)),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              TextFormField(
                key: ChangePasswordScreen.currentFieldKey,
                controller: _current,
                enabled: !_saving,
                obscureText: true,
                decoration: InputDecoration(labelText: l10n.currentPassword),
                autofillHints: const [AutofillHints.password],
                textInputAction: TextInputAction.next,
                validator: (value) =>
                    (value ?? '').isEmpty ? l10n.currentPasswordRequired : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                key: ChangePasswordScreen.newFieldKey,
                controller: _new,
                enabled: !_saving,
                obscureText: true,
                decoration: InputDecoration(
                  labelText: l10n.newPassword,
                  helperText: l10n.newPasswordHint,
                ),
                autofillHints: const [AutofillHints.newPassword],
                textInputAction: TextInputAction.next,
                validator: (value) {
                  final password = value ?? '';
                  if (password.length < ChangePasswordScreen.minLength) {
                    return l10n.newPasswordTooShort;
                  }
                  if (password == _current.text) return l10n.newPasswordSame;
                  return null;
                },
              ),
              const SizedBox(height: 16),
              TextFormField(
                key: ChangePasswordScreen.confirmFieldKey,
                controller: _confirm,
                enabled: !_saving,
                obscureText: true,
                decoration: InputDecoration(labelText: l10n.confirmNewPassword),
                textInputAction: TextInputAction.done,
                onFieldSubmitted: (_) => _submit(),
                validator: (value) =>
                    value != _new.text ? l10n.newPasswordMismatch : null,
              ),
              if (error != null) ...[
                const SizedBox(height: 16),
                NoticeCard(
                  icon: Icons.error_outline,
                  message: describeError(l10n, error),
                  details: [
                    if (error is ApiException)
                      for (final issue in error.issues) issue.message,
                  ],
                  background: scheme.errorContainer,
                  foreground: scheme.onErrorContainer,
                ),
              ],
              const SizedBox(height: 24),
              FilledButton(
                key: ChangePasswordScreen.submitKey,
                onPressed: _saving ? null : _submit,
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(52),
                ),
                child: _saving
                    ? const SizedBox.square(
                        dimension: 22,
                        child: CircularProgressIndicator(strokeWidth: 2.5),
                      )
                    : Text(l10n.changePassword),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
