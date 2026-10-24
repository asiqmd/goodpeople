import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Deployment environment, chosen with `--dart-define=APP_ENV=<name>`.
///
/// Phase 0 uses dart-define environments instead of native flavors, so one
/// Android/iOS build setup serves every environment.
enum AppEnv { dev, staging, prod }

/// Build-time configuration read from `--dart-define` values.
class AppConfig {
  const AppConfig({required this.apiBaseUrl, required this.env});

  /// Reads `API_BASE_URL` and `APP_ENV` from the compile-time environment.
  ///
  /// `API_BASE_URL` defaults to `http://localhost:4000`. The Android emulator
  /// cannot reach the host's localhost, so pass `http://10.0.2.2:4000` there.
  factory AppConfig.fromEnvironment() {
    const baseUrl = String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'http://localhost:4000',
    );
    const envName = String.fromEnvironment('APP_ENV', defaultValue: 'dev');
    return AppConfig(
      apiBaseUrl: normalizeBaseUrl(baseUrl),
      env: parseEnv(envName),
    );
  }

  /// API origin without a trailing slash, for example `http://localhost:4000`.
  final String apiBaseUrl;
  final AppEnv env;

  bool get isProd => env == AppEnv.prod;

  static AppEnv parseEnv(String name) {
    final env = AppEnv.values.asNameMap()[name.trim().toLowerCase()];
    if (env == null) {
      throw ArgumentError.value(
        name,
        'APP_ENV',
        'Use one of ${AppEnv.values.map((e) => e.name).join(', ')}',
      );
    }
    return env;
  }

  static String normalizeBaseUrl(String url) {
    var trimmed = url.trim();
    while (trimmed.endsWith('/')) {
      trimmed = trimmed.substring(0, trimmed.length - 1);
    }
    return trimmed;
  }
}

final appConfigProvider = Provider<AppConfig>(
  (ref) => AppConfig.fromEnvironment(),
);
