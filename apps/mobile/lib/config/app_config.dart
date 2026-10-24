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

/// Firebase's settings for push notifications, from `--dart-define`s:
/// `FIREBASE_API_KEY`, `FIREBASE_APP_ID`, `FIREBASE_MESSAGING_SENDER_ID`
/// and `FIREBASE_PROJECT_ID`. The app ID differs between the Android and
/// the iOS app, so each build passes its own.
///
/// Built this way, the app needs no `google-services.json` or
/// `GoogleService-Info.plist`. Without the defines push is off; the inbox
/// still reloads whenever the app comes back to the foreground.
class FirebaseConfig {
  const FirebaseConfig({
    required this.apiKey,
    required this.appId,
    required this.messagingSenderId,
    required this.projectId,
  });

  /// `null` unless all four defines are set.
  static FirebaseConfig? fromEnvironment() {
    const config = FirebaseConfig(
      apiKey: String.fromEnvironment('FIREBASE_API_KEY'),
      appId: String.fromEnvironment('FIREBASE_APP_ID'),
      messagingSenderId: String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID'),
      projectId: String.fromEnvironment('FIREBASE_PROJECT_ID'),
    );
    return config.isComplete ? config : null;
  }

  final String apiKey;
  final String appId;
  final String messagingSenderId;
  final String projectId;

  bool get isComplete => [
    apiKey,
    appId,
    messagingSenderId,
    projectId,
  ].every((value) => value.trim().isNotEmpty);
}
