import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../config/app_config.dart';
import '../l10n/app_localizations.dart';
import '../ui/error_text.dart';
import '../ui/format.dart';
import '../ui/language_menu.dart';
import '../ui/notice_card.dart';
import 'auth_controller.dart';
import 'phone.dart';

/// How the user signs in: email and password, or a code texted to their
/// mobile number (for workers, who often have no email).
enum SignInMethod { email, phone }

/// Where the login screen is.
enum _Step {
  /// Workspace, then email and password or the mobile number.
  credentials,

  /// The code texted to the number.
  smsCode,

  /// After a right password: the authenticator or a recovery code, or (when
  /// the role must use it and has not set it up) a note to do that on the
  /// web first.
  twoStep,
}

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, this.sessionExpired = false});

  /// Shows a notice that the previous session ended.
  final bool sessionExpired;

  static const workspaceFieldKey = ValueKey('login-workspace');
  static const emailFieldKey = ValueKey('login-email');
  static const passwordFieldKey = ValueKey('login-password');
  static const phoneFieldKey = ValueKey('login-phone');
  static const codeFieldKey = ValueKey('login-code');

  /// The main button of each step: Sign in, Send code or Verify.
  static const submitKey = ValueKey('login-submit');
  static const resendKey = ValueKey('login-resend');
  static const recoveryToggleKey = ValueKey('login-recovery-toggle');
  static const backKey = ValueKey('login-back');
  static const setupRequiredKey = ValueKey('login-mfa-setup-required');

  static ValueKey<String> methodKey(SignInMethod method) =>
      ValueKey('login-method-${method.name}');

  /// How long "Send again" waits after a code was sent.
  static const resendDelay = Duration(seconds: 30);

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  static final _emailPattern = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

  final _formKey = GlobalKey<FormState>();
  final _workspace = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _phone = TextEditingController();
  final _code = TextEditingController();

  SignInMethod _method = SignInMethod.email;
  _Step _step = _Step.credentials;
  bool _submitting = false;
  bool _obscurePassword = true;
  Object? _error;

  /// The number the code went to, as sent to the API.
  String? _sentTo;
  int _codeMinutes = 5;
  bool _canResend = false;
  Timer? _resendTimer;

  /// The second step a password sign-in asked for.
  TwoStepChallenge? _challenge;
  bool _useRecoveryCode = false;

  @override
  void dispose() {
    _resendTimer?.cancel();
    _workspace.dispose();
    _email.dispose();
    _password.dispose();
    _phone.dispose();
    _code.dispose();
    super.dispose();
  }

  AuthController get _auth => ref.read(authProvider.notifier);

  /// Runs [action] with the button busy, keeping its failure to show.
  Future<void> _run(Future<void> Function() action) async {
    if (_submitting) return;
    if (!_formKey.currentState!.validate()) return;

    FocusScope.of(context).unfocus();
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await action();
    } on Exception catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  // On success the auth state changes and AuthGate shows HomeScreen.
  Future<void> _submit() => switch (_step) {
    _Step.credentials when _method == SignInMethod.email => _run(() async {
      final challenge = await _auth.signIn(
        workspace: _workspace.text,
        email: _email.text,
        password: _password.text,
      );
      if (challenge != null && mounted) {
        _code.clear();
        setState(() {
          _challenge = challenge;
          _useRecoveryCode = false;
          _step = _Step.twoStep;
        });
      }
    }),
    _Step.credentials => _run(() => _sendCode(cleanBdMobile(_phone.text)!)),
    _Step.smsCode => _run(
      () => _auth.signInWithCode(
        workspace: _workspace.text,
        phone: _sentTo!,
        code: cleanSixDigitCode(_code.text)!,
      ),
    ),
    _Step.twoStep => _run(
      () => _auth.completeTwoStep(
        _challenge!,
        _useRecoveryCode
            ? cleanRecoveryCode(_code.text)!
            : cleanSixDigitCode(_code.text)!,
      ),
    ),
  };

  Future<void> _sendCode(String phone) async {
    final result = await _auth.requestSignInCode(
      workspace: _workspace.text,
      phone: phone,
    );
    if (!mounted) return;
    final again = _step == _Step.smsCode;
    _resendTimer?.cancel();
    _resendTimer = Timer(LoginScreen.resendDelay, () {
      if (mounted) setState(() => _canResend = true);
    });
    setState(() {
      _sentTo = phone;
      _codeMinutes = (result.expiresInSeconds / 60).ceil();
      _canResend = false;
      _step = _Step.smsCode;
    });
    if (again) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppLocalizations.of(context).codeSentAgain)),
      );
    } else {
      _code.clear();
    }
  }

  Future<void> _resend() async {
    if (_submitting || _sentTo == null) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await _sendCode(_sentTo!);
    } on Exception catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  /// Back to the first step, keeping what was typed there.
  void _back() {
    _resendTimer?.cancel();
    setState(() {
      _step = _Step.credentials;
      _challenge = null;
      _error = null;
      _code.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final config = ref.watch(appConfigProvider);
    final firstStep = _step == _Step.credentials;

    return PopScope(
      canPop: firstStep,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop && !_submitting) _back();
      },
      child: Scaffold(
        appBar: AppBar(
          leading: firstStep
              ? null
              : BackButton(
                  key: LoginScreen.backKey,
                  onPressed: _submitting ? null : _back,
                ),
          actions: const [LanguageMenuButton()],
        ),
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
                          switch (_step) {
                            _Step.credentials => l10n.signInSubtitle,
                            _Step.smsCode => l10n.otpTitle,
                            _Step.twoStep => l10n.twoStepTitle,
                          },
                          style: theme.textTheme.bodyLarge,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 32),
                        if (widget.sessionExpired &&
                            _error == null &&
                            firstStep) ...[
                          NoticeCard(
                            message: l10n.sessionExpired,
                            background: theme.colorScheme.secondaryContainer,
                            foreground: theme.colorScheme.onSecondaryContainer,
                            icon: Icons.info_outline,
                          ),
                          const SizedBox(height: 16),
                        ],
                        ...switch (_step) {
                          _Step.credentials => _credentials(context),
                          _Step.smsCode => _smsCode(context),
                          _Step.twoStep => _twoStep(context),
                        },
                        if (_error case final error?) ...[
                          const SizedBox(height: 16),
                          NoticeCard(
                            message: _errorText(l10n, error),
                            details: [
                              if (error is ApiException)
                                for (final issue in error.issues) issue.message,
                            ],
                            background: theme.colorScheme.errorContainer,
                            foreground: theme.colorScheme.onErrorContainer,
                            icon: Icons.error_outline,
                          ),
                        ],
                        if (_submitLabel(l10n) case final label?) ...[
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
                                : Text(label),
                          ),
                        ],
                        ..._afterSubmit(context),
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
      ),
    );
  }

  /// A 401 on a step with a code means the code; on the password step, the
  /// password. Both have the API's English message otherwise.
  String _errorText(AppLocalizations l10n, Object error) {
    if (error is ApiException && error.isUnauthorized) {
      return switch (_step) {
        _Step.credentials => l10n.loginWrongCredentials,
        _Step.smsCode => l10n.codeWrongOrExpired,
        _Step.twoStep => l10n.twoStepWrongCode,
      };
    }
    return describeError(l10n, error);
  }

  /// `null` when the step has no main button: two-step sign-in that must be
  /// set up on the web first.
  String? _submitLabel(AppLocalizations l10n) => switch (_step) {
    _Step.credentials when _method == SignInMethod.email => l10n.signIn,
    _Step.credentials => l10n.sendCode,
    _Step.smsCode => l10n.signIn,
    _Step.twoStep when _challenge?.setupRequired ?? false => null,
    _Step.twoStep => l10n.verify,
  };

  List<Widget> _credentials(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final email = _method == SignInMethod.email;
    return [
      SegmentedButton<SignInMethod>(
        segments: [
          ButtonSegment(
            value: SignInMethod.email,
            icon: const Icon(Icons.mail_outline),
            label: Text(
              l10n.signInWithEmail,
              key: LoginScreen.methodKey(SignInMethod.email),
            ),
          ),
          ButtonSegment(
            value: SignInMethod.phone,
            icon: const Icon(Icons.smartphone),
            label: Text(
              l10n.signInWithPhone,
              key: LoginScreen.methodKey(SignInMethod.phone),
            ),
          ),
        ],
        selected: {_method},
        onSelectionChanged: _submitting
            ? null
            : (methods) => setState(() {
                _method = methods.single;
                _error = null;
              }),
      ),
      const SizedBox(height: 24),
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
        validator: (value) =>
            (value ?? '').trim().isEmpty ? l10n.workspaceRequired : null,
      ),
      const SizedBox(height: 16),
      if (email) ...[
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
          autofillHints: const [AutofillHints.username, AutofillHints.email],
          validator: (value) {
            final email = (value ?? '').trim();
            if (email.isEmpty) return l10n.emailRequired;
            if (!_emailPattern.hasMatch(email)) return l10n.emailInvalid;
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
              tooltip: _obscurePassword ? l10n.showPassword : l10n.hidePassword,
              icon: Icon(
                _obscurePassword
                    ? Icons.visibility_outlined
                    : Icons.visibility_off_outlined,
              ),
              onPressed: () =>
                  setState(() => _obscurePassword = !_obscurePassword),
            ),
          ),
          textInputAction: TextInputAction.done,
          autofillHints: const [AutofillHints.password],
          onFieldSubmitted: (_) => _submit(),
          validator: (value) =>
              (value ?? '').isEmpty ? l10n.passwordRequired : null,
        ),
      ] else
        TextFormField(
          key: LoginScreen.phoneFieldKey,
          controller: _phone,
          enabled: !_submitting,
          decoration: InputDecoration(
            labelText: l10n.mobileNumber,
            hintText: l10n.mobileNumberHint,
            prefixIcon: const Icon(Icons.smartphone),
          ),
          keyboardType: TextInputType.phone,
          autofillHints: const [AutofillHints.telephoneNumber],
          textInputAction: TextInputAction.done,
          onFieldSubmitted: (_) => _submit(),
          validator: (value) {
            if ((value ?? '').trim().isEmpty) return l10n.mobileNumberRequired;
            return cleanBdMobile(value!) == null
                ? l10n.mobileNumberInvalid
                : null;
          },
        ),
    ];
  }

  Widget _codeField(
    BuildContext context, {
    required String label,
    required String? Function(String text) clean,
    required String invalid,
    bool recovery = false,
  }) {
    return TextFormField(
      key: LoginScreen.codeFieldKey,
      controller: _code,
      enabled: !_submitting,
      autofocus: true,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(recovery ? Icons.key_outlined : Icons.pin_outlined),
      ),
      keyboardType: recovery
          ? TextInputType.visiblePassword
          : TextInputType.number,
      inputFormatters: [LengthLimitingTextInputFormatter(recovery ? 12 : 8)],
      autocorrect: false,
      enableSuggestions: false,
      autofillHints: const [AutofillHints.oneTimeCode],
      textInputAction: TextInputAction.done,
      onFieldSubmitted: (_) => _submit(),
      validator: (value) => clean(value ?? '') == null ? invalid : null,
    );
  }

  List<Widget> _smsCode(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return [
      Text(
        l10n.otpSentBody(_sentTo ?? '', _codeMinutes),
        style: theme.textTheme.bodyMedium,
      ),
      const SizedBox(height: 16),
      _codeField(
        context,
        label: l10n.codeLabel,
        clean: cleanSixDigitCode,
        invalid: l10n.codeRequired,
      ),
    ];
  }

  List<Widget> _twoStep(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    if (_challenge?.setupRequired ?? false) {
      return [
        NoticeCard(
          key: LoginScreen.setupRequiredKey,
          icon: Icons.shield_outlined,
          title: l10n.twoStepSetupTitle,
          message: l10n.twoStepSetupBody,
          background: theme.colorScheme.secondaryContainer,
          foreground: theme.colorScheme.onSecondaryContainer,
        ),
      ];
    }
    return [
      Text(
        _useRecoveryCode ? l10n.twoStepRecoveryBody : l10n.twoStepBody,
        style: theme.textTheme.bodyMedium,
      ),
      const SizedBox(height: 16),
      if (_useRecoveryCode)
        _codeField(
          context,
          label: l10n.recoveryCodeLabel,
          clean: cleanRecoveryCode,
          invalid: l10n.recoveryCodeInvalid,
          recovery: true,
        )
      else
        _codeField(
          context,
          label: l10n.codeLabel,
          clean: cleanSixDigitCode,
          invalid: l10n.codeRequired,
        ),
    ];
  }

  /// Links under the main button.
  List<Widget> _afterSubmit(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return switch (_step) {
      _Step.credentials => const [],
      _Step.smsCode => [
        const SizedBox(height: 16),
        TextButton(
          key: LoginScreen.resendKey,
          onPressed: _canResend && !_submitting ? _resend : null,
          child: Text(l10n.sendCodeAgain),
        ),
        if (!_canResend)
          Text(
            l10n.sendCodeAgainHint(
              formatNumber(l10n, LoginScreen.resendDelay.inSeconds),
            ),
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
            textAlign: TextAlign.center,
          ),
        TextButton(
          onPressed: _submitting ? null : _back,
          child: Text(l10n.useDifferentNumber),
        ),
      ],
      _Step.twoStep when _challenge?.setupRequired ?? false => [
        const SizedBox(height: 24),
        FilledButton.tonal(
          onPressed: _back,
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          child: Text(l10n.back),
        ),
      ],
      _Step.twoStep => [
        const SizedBox(height: 16),
        TextButton(
          key: LoginScreen.recoveryToggleKey,
          onPressed: _submitting
              ? null
              : () => setState(() {
                  _useRecoveryCode = !_useRecoveryCode;
                  _error = null;
                  _code.clear();
                }),
          child: Text(
            _useRecoveryCode ? l10n.useAuthenticatorCode : l10n.useRecoveryCode,
          ),
        ),
      ],
    };
  }
}
