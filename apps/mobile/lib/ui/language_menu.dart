import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../settings/locale_controller.dart';

/// App bar button that switches between English and Bangla.
class LanguageMenuButton extends ConsumerWidget {
  const LanguageMenuButton({super.key});

  /// Each language is labelled in itself, so it reads the same in any locale.
  static const _languages = [
    (locale: Locale('en'), label: 'English'),
    (locale: Locale('bn'), label: 'বাংলা'),
    (locale: Locale('ar'), label: 'العربية'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = Localizations.localeOf(context).languageCode;
    return PopupMenuButton<Locale>(
      tooltip: AppLocalizations.of(context).language,
      icon: const Icon(Icons.translate),
      onSelected: ref.read(localeProvider.notifier).select,
      itemBuilder: (context) => [
        for (final language in _languages)
          CheckedPopupMenuItem<Locale>(
            value: language.locale,
            checked: language.locale.languageCode == current,
            child: Text(language.label),
          ),
      ],
    );
  }
}
