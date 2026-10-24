import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../config/app_config.dart';
import 'firebase_push_service.dart';

/// What a push from Good People carries in its `data`, plus the title the
/// phone showed.
class PushMessage {
  const PushMessage({
    required this.event,
    this.link,
    this.notificationId,
    this.title,
  });

  factory PushMessage.fromData(Map<String, Object?> data, {String? title}) =>
      PushMessage(
        event: NotificationEvent.fromWire('${data['event'] ?? ''}'),
        link: switch (data['link']) {
          final String link when link.isNotEmpty => link,
          _ => null,
        },
        notificationId: switch (data['notificationId']) {
          final String id when id.isNotEmpty => id,
          _ => null,
        },
        title: title,
      );

  final NotificationEvent event;

  /// A web app path, as on the inbox item.
  final String? link;

  /// The inbox item it announces, to mark read when it is opened.
  final String? notificationId;
  final String? title;
}

/// Push notifications for this phone.
///
/// Off ([NoPushService]) unless the build has Firebase's settings (see
/// [FirebaseConfig]); then [FirebasePushService]. Tests replace it through
/// [pushServiceProvider].
abstract interface class PushService {
  /// What the token is registered as, or `null` when push is off.
  DevicePlatform? get platform;

  /// Asks for permission to show notifications where the phone needs it,
  /// and returns this phone's token, or `null` when push is off, not
  /// allowed, or not available right now.
  Future<String?> register();

  /// A new token, when the platform rotates it.
  Stream<String> get tokenRefreshes;

  /// Pushes that arrive while the app is open. The phone shows none itself.
  Stream<PushMessage> get foregroundMessages;

  /// Pushes the user tapped to bring the app back.
  Stream<PushMessage> get openedMessages;

  /// The push the user tapped to start the app, once.
  Future<PushMessage?> initialMessage();
}

/// [PushService] when push is off: no token, no messages.
class NoPushService implements PushService {
  const NoPushService();

  @override
  DevicePlatform? get platform => null;

  @override
  Future<String?> register() async => null;

  @override
  Stream<String> get tokenRefreshes => const Stream.empty();

  @override
  Stream<PushMessage> get foregroundMessages => const Stream.empty();

  @override
  Stream<PushMessage> get openedMessages => const Stream.empty();

  @override
  Future<PushMessage?> initialMessage() async => null;
}

final pushServiceProvider = Provider<PushService>((ref) {
  final config = FirebaseConfig.fromEnvironment();
  final platform = kIsWeb
      ? null
      : switch (defaultTargetPlatform) {
          TargetPlatform.android => DevicePlatform.android,
          TargetPlatform.iOS => DevicePlatform.ios,
          _ => null,
        };
  if (config == null || platform == null) return const NoPushService();
  return FirebasePushService(config, platform);
});
