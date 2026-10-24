import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth/auth_controller.dart';
import 'auth/login_screen.dart';
import 'home/home_screen.dart';
import 'l10n/app_localizations.dart';
import 'settings/locale_controller.dart';
import 'ui/theme.dart';

class GoodPeopleApp extends ConsumerWidget {
  const GoodPeopleApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp(
      onGenerateTitle: (context) => AppLocalizations.of(context).appTitle,
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(Brightness.light),
      darkTheme: buildAppTheme(Brightness.dark),
      locale: ref.watch(localeProvider),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      home: const AuthGate(),
    );
  }
}

/// Shows the login screen or the home screen for the current auth state.
///
/// Signing in, signing out and an expired session all switch screens here,
/// so no screen has to navigate on its own.
class AuthGate extends ConsumerWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return switch (ref.watch(authProvider)) {
      final SignedIn session => HomeScreen(session: session),
      SignedOut(:final sessionExpired) => LoginScreen(
        sessionExpired: sessionExpired,
      ),
    };
  }
}
