import 'package:flutter/material.dart';

/// Bangladesh flag green.
const _seedColor = Color(0xFF006A4E);

/// Fonts tried for glyphs the platform default (Roboto, SF Pro) lacks, such
/// as Bangla. All ship with the OS: Noto Sans Bengali on Android, Kohinoor
/// Bangla and Bangla Sangam MN on iOS. No font assets are bundled.
const appFontFamilyFallback = [
  'GPArabic',
  'Noto Sans Bengali',
  'Noto Sans',
  'Kohinoor Bangla',
  'Bangla Sangam MN',
];

ThemeData buildAppTheme(Brightness brightness) {
  final scheme = ColorScheme.fromSeed(
    seedColor: _seedColor,
    brightness: brightness,
  );
  return ThemeData(
    colorScheme: scheme,
    fontFamilyFallback: appFontFamilyFallback,
    inputDecorationTheme: const InputDecorationThemeData(
      border: OutlineInputBorder(),
    ),
    extensions: [
      brightness == Brightness.light ? StatusColors.light : StatusColors.dark,
    ],
  );
}

/// Warning colours, which Material 3's [ColorScheme] does not define.
@immutable
class StatusColors extends ThemeExtension<StatusColors> {
  const StatusColors({
    required this.warningContainer,
    required this.onWarningContainer,
  });

  static const light = StatusColors(
    warningContainer: Color(0xFFFFE08B),
    onWarningContainer: Color(0xFF3B2F00),
  );

  static const dark = StatusColors(
    warningContainer: Color(0xFF574500),
    onWarningContainer: Color(0xFFFFE08B),
  );

  final Color warningContainer;
  final Color onWarningContainer;

  static StatusColors of(BuildContext context) =>
      Theme.of(context).extension<StatusColors>() ?? light;

  @override
  StatusColors copyWith({Color? warningContainer, Color? onWarningContainer}) {
    return StatusColors(
      warningContainer: warningContainer ?? this.warningContainer,
      onWarningContainer: onWarningContainer ?? this.onWarningContainer,
    );
  }

  @override
  StatusColors lerp(StatusColors? other, double t) {
    if (other == null) return this;
    return StatusColors(
      warningContainer: Color.lerp(
        warningContainer,
        other.warningContainer,
        t,
      )!,
      onWarningContainer: Color.lerp(
        onWarningContainer,
        other.onWarningContainer,
        t,
      )!,
    );
  }
}
