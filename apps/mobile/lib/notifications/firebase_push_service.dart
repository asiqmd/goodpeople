import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import '../api/api_models.dart';
import '../config/app_config.dart';
import 'push_service.dart';

/// [PushService] with Firebase Cloud Messaging, set up from [FirebaseConfig]
/// rather than a google-services file.
///
/// Firebase starts on first use, not with the app, so a build without push
/// never touches it. Pushes carry a `notification` part, so the phone shows
/// them itself while the app is in the background; there is no background
/// handler.
class FirebasePushService implements PushService {
  FirebasePushService(this._config, this.platform);

  final FirebaseConfig _config;

  @override
  final DevicePlatform platform;

  Future<FirebaseMessaging>? _messaging;

  Future<FirebaseMessaging> _start() => _messaging ??= () async {
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp(
        options: FirebaseOptions(
          apiKey: _config.apiKey,
          appId: _config.appId,
          messagingSenderId: _config.messagingSenderId,
          projectId: _config.projectId,
        ),
      );
    }
    return FirebaseMessaging.instance;
  }();

  @override
  Future<String?> register() async {
    try {
      final messaging = await _start();
      final settings = await messaging.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        return null;
      }
      // The API sends with FCM's `message.token`, which takes this token,
      // not the installation ID that register() and onRegistered give.
      // ignore: deprecated_member_use
      return await messaging.getToken();
    } on Object {
      // No Play services, no APNs token yet, or Firebase refused the
      // settings: the app works without push.
      return null;
    }
  }

  @override
  // The same token as register() gives.
  // ignore: deprecated_member_use
  Stream<String> get tokenRefreshes => _after((m) => m.onTokenRefresh);

  @override
  Stream<PushMessage> get foregroundMessages =>
      _after((_) => FirebaseMessaging.onMessage.map(_toMessage));

  @override
  Stream<PushMessage> get openedMessages =>
      _after((_) => FirebaseMessaging.onMessageOpenedApp.map(_toMessage));

  @override
  Future<PushMessage?> initialMessage() async {
    try {
      final message = await (await _start()).getInitialMessage();
      return message == null ? null : _toMessage(message);
    } on Object {
      return null;
    }
  }

  /// [stream] once Firebase has started; empty if it cannot.
  Stream<T> _after<T>(Stream<T> Function(FirebaseMessaging messaging) stream) =>
      Stream.fromFuture(_start())
          .handleError((Object _) {})
          .asyncExpand(stream);

  static PushMessage _toMessage(RemoteMessage message) =>
      PushMessage.fromData(message.data, title: message.notification?.title);
}
