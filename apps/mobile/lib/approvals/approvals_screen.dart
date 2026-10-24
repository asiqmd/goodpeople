import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../ui/language_menu.dart';
import 'approvals_tab.dart';

/// The approvals inbox on its own, for a notification that a request waits
/// for the user's decision. Leave and Attendance show the same inbox as a
/// tab.
class ApprovalsScreen extends StatelessWidget {
  const ApprovalsScreen({super.key});

  static Route<void> route() =>
      MaterialPageRoute(builder: (context) => const ApprovalsScreen());

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(AppLocalizations.of(context).leaveTabApprovals),
      actions: const [LanguageMenuButton()],
    ),
    body: const SafeArea(child: ApprovalsTab()),
  );
}
