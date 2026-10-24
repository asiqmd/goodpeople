import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../attendance/offline_punch_queue.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../notifications/notification_providers.dart';
import '../notifications/notification_routes.dart';
import '../notifications/push_service.dart';
import '../settings/locale_controller.dart';

/// Work that runs while someone is signed in, around [child] (the home
/// screen). AuthGate keys it by the login, so each session starts afresh.
///
/// - Sends punches waiting in the offline queue: now, whenever the app
///   comes back to the foreground, and every [sendInterval] while it is
///   open. (The queue also sends after any call that went through.)
/// - Reloads the notification inbox when the app comes back to the
///   foreground and when a push arrives.
/// - Registers the phone for push, if the build has it, and opens what a
///   tapped push is about.
/// - Tells the API the language the user picks, so notifications come in
///   it.
class SessionServices extends ConsumerStatefulWidget {
  const SessionServices({super.key, required this.child});

  final Widget child;

  static const sendInterval = Duration(minutes: 1);

  @override
  ConsumerState<SessionServices> createState() => _SessionServicesState();
}

class _SessionServicesState extends ConsumerState<SessionServices> {
  late final AppLifecycleListener _lifecycle;
  late final Timer _ticker;
  late final ProviderSubscription<Locale?> _locale;
  final _subscriptions = <StreamSubscription<Object?>>[];

  @override
  void initState() {
    super.initState();
    _lifecycle = AppLifecycleListener(onResume: _onResume);
    _ticker = Timer.periodic(
      SessionServices.sendInterval,
      (_) => _sendWaitingPunches(),
    );
    _locale = ref.listenManual(localeProvider, (previous, next) {
      if (next != null) _tellLanguage(next);
    });
    // A language picked on the login screen counts too.
    if (ref.read(localeProvider) case final chosen?) _tellLanguage(chosen);
    _sendWaitingPunches();
    unawaited(_startPush());
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    _ticker.cancel();
    _locale.close();
    for (final subscription in _subscriptions) {
      unawaited(subscription.cancel());
    }
    super.dispose();
  }

  void _onResume() {
    _sendWaitingPunches();
    ref.invalidate(notificationInboxProvider);
  }

  void _sendWaitingPunches() =>
      unawaited(ref.read(offlinePunchQueueProvider.notifier).send());

  void _tellLanguage(Locale locale) {
    final language = UserLanguage.fromWire(locale.languageCode);
    if (language == UserLanguage.unknown) return;
    unawaited(
      ref
          .read(authProvider.notifier)
          .updateLanguage(language)
          .then<void>(
            (_) {},
            onError: (Object _) {
              // Told again the next time the language changes.
            },
          ),
    );
  }

  Future<void> _startPush() async {
    final push = ref.read(pushServiceProvider);
    final platform = push.platform;
    if (platform == null) return;
    final auth = ref.read(authProvider.notifier);
    Future<void> register(String token) async {
      try {
        await auth.registerDevice(platform, token);
      } on Object {
        // Tried again with the next token, or the next session.
      }
    }

    _subscriptions
      ..add(push.tokenRefreshes.listen(register))
      ..add(push.foregroundMessages.listen(_onForegroundMessage))
      ..add(push.openedMessages.listen(_open));
    if (await push.register() case final token?) await register(token);
    if (await push.initialMessage() case final message?) _open(message);
  }

  /// The phone shows nothing for a push while the app is open: reload the
  /// inbox and say what came.
  void _onForegroundMessage(PushMessage message) {
    if (!mounted) return;
    ref.invalidate(notificationInboxProvider);
    final title = message.title;
    if (title == null || title.isEmpty) return;
    final hasScreen = notificationRoute(message.event, message.link) != null;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(title),
        action: hasScreen
            ? SnackBarAction(
                label: AppLocalizations.of(context).pushOpen,
                onPressed: () => _open(message),
              )
            : null,
      ),
    );
  }

  void _open(PushMessage message) {
    if (!mounted) return;
    if (message.notificationId case final id?) {
      unawaited(ref.read(notificationInboxProvider.notifier).markRead(id));
    } else {
      ref.invalidate(notificationInboxProvider);
    }
    openNotificationTarget(Navigator.of(context), message.event, message.link);
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
