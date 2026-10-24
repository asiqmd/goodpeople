import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../auth/auth_controller.dart';

/// The signed-in user's notification inbox: the latest 50 and how many are
/// unread, for the bell on the home screen.
///
/// It reloads when the app comes back to the foreground and when a push
/// arrives (see `SessionServices`), and on pull-to-refresh in the inbox.
final notificationInboxProvider =
    AsyncNotifierProvider.autoDispose<
      NotificationInboxController,
      NotificationInbox
    >(
      NotificationInboxController.new,
      // Retries go through the refresh logic in AuthController, not
      // Riverpod's backoff.
      retry: (retryCount, error) => null,
    );

class NotificationInboxController extends AsyncNotifier<NotificationInbox> {
  @override
  Future<NotificationInbox> build() {
    if (ref.watch(authProvider) is! SignedIn) {
      throw const SessionExpiredException();
    }
    return ref.read(authProvider.notifier).fetchNotifications();
  }

  /// Marks one notification read: on screen at once, then on the server.
  /// If the server cannot be told, the next reload shows it unread again.
  Future<void> markRead(String id) async {
    final auth = ref.read(authProvider.notifier);
    if (state.value case final inbox?) {
      state = AsyncData(inbox.withRead(id, DateTime.now()));
    }
    try {
      await auth.markNotificationRead(id);
    } on Object {
      // Shown unread again by the next reload.
    }
  }

  /// Marks everything read, the same way as [markRead].
  Future<void> markAllRead() async {
    final auth = ref.read(authProvider.notifier);
    if (state.value case final inbox?) {
      state = AsyncData(inbox.allRead(DateTime.now()));
    }
    try {
      await auth.markAllNotificationsRead();
    } on Object {
      // Shown unread again by the next reload.
    }
  }
}
