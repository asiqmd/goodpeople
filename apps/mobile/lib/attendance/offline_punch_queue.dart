import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import 'attendance_providers.dart';

/// A punch the app could not send for want of a connection, kept on the
/// phone and sent later with the time it happened.
///
/// [clientId] is chosen once, before the first attempt, and never changes:
/// the API recognises a resend by it and does not count the punch twice.
class QueuedPunch {
  const QueuedPunch({
    required this.clientId,
    required this.punchedAt,
    required this.userId,
    this.timeZone,
    this.location,
    this.selfieFile,
  });

  factory QueuedPunch.fromJson(Json json) => QueuedPunch(
    clientId: json['clientId']! as String,
    punchedAt: DateTime.parse(json['punchedAt']! as String).toUtc(),
    userId: json['userId']! as String,
    timeZone: json['timeZone'] as String?,
    location: switch (json['location']) {
      {
        'latitude': final num latitude,
        'longitude': final num longitude,
        'accuracyM': final num? accuracy,
      } =>
        PunchLocation(
          latitude: latitude.toDouble(),
          longitude: longitude.toDouble(),
          accuracyM: accuracy?.toDouble(),
        ),
      _ => null,
    },
    selfieFile: json['selfieFile'] as String?,
  );

  final String clientId;

  /// When the punch happened, in UTC.
  final DateTime punchedAt;

  /// The login it belongs to: it is sent only in that login's session.
  final String userId;

  /// The day's time zone when it was taken, to show the time.
  final String? timeZone;
  final PunchLocation? location;

  /// The photo taken with it, a file in the queue's store.
  final String? selfieFile;

  QueuedPunch withSelfieFile(String? file) => QueuedPunch(
    clientId: clientId,
    punchedAt: punchedAt,
    userId: userId,
    timeZone: timeZone,
    location: location,
    selfieFile: file,
  );

  Json toJson() => {
    'clientId': clientId,
    'punchedAt': toWireInstant(punchedAt),
    'userId': userId,
    'timeZone': timeZone,
    'location': switch (location) {
      final PunchLocation at => {
        'latitude': at.latitude,
        'longitude': at.longitude,
        'accuracyM': at.accuracyM,
      },
      null => null,
    },
    'selfieFile': selfieFile,
  };
}

/// A queued punch the API refused when it was sent. It has left the queue;
/// it is kept until the user has seen why, since only a correction can add
/// it now.
class RefusedPunch {
  const RefusedPunch({
    required this.punch,
    required this.message,
    this.statusCode,
    this.code,
  });

  factory RefusedPunch.fromJson(Json json) => RefusedPunch(
    punch: QueuedPunch.fromJson(json['punch']! as Json),
    statusCode: json['statusCode'] as int?,
    code: json['code'] as String?,
    message: json['message']! as String,
  );

  final QueuedPunch punch;
  final int? statusCode;

  /// The API's `code`, for example `offline_punch_too_old`.
  final String? code;

  /// The API's message (English), shown when the code has no translation.
  final String message;

  /// The refusal as the [ApiException] it was, for the same text as a live
  /// punch's error.
  ApiException get error => ApiException(
    kind: ApiErrorKind.server,
    statusCode: statusCode,
    message: message,
    code: code,
  );

  Json toJson() => {
    'punch': punch.toJson(),
    'statusCode': statusCode,
    'code': code,
    'message': message,
  };
}

/// Everything the queue holds, for every login on the phone.
class PunchQueue {
  const PunchQueue({this.waiting = const [], this.refused = const []});

  factory PunchQueue.fromJson(Json json) => PunchQueue(
    waiting: [
      for (final item in json['waiting'] as List<Object?>? ?? const [])
        QueuedPunch.fromJson(item! as Json),
    ],
    refused: [
      for (final item in json['refused'] as List<Object?>? ?? const [])
        RefusedPunch.fromJson(item! as Json),
    ],
  );

  /// Oldest first.
  final List<QueuedPunch> waiting;
  final List<RefusedPunch> refused;

  List<QueuedPunch> waitingFor(String userId) => [
    for (final punch in waiting)
      if (punch.userId == userId) punch,
  ];

  List<RefusedPunch> refusedFor(String userId) => [
    for (final refusal in refused)
      if (refusal.punch.userId == userId) refusal,
  ];

  PunchQueue copyWith({
    List<QueuedPunch>? waiting,
    List<RefusedPunch>? refused,
  }) => PunchQueue(
    waiting: waiting ?? this.waiting,
    refused: refused ?? this.refused,
  );

  Json toJson() => {
    'version': 1,
    'waiting': [for (final punch in waiting) punch.toJson()],
    'refused': [for (final refusal in refused) refusal.toJson()],
  };
}

/// Where the queue is kept between runs of the app, with the photos of
/// selfie punches.
abstract interface class PunchQueueStore {
  /// What was saved last, or an empty queue.
  Future<PunchQueue> load();

  Future<void> save(PunchQueue queue);

  /// Keeps a punch's photo; returns the name to read it back by.
  Future<String> writePhoto(String clientId, Uint8List bytes);

  /// The photo saved as [name], or `null` when it is gone.
  Future<Uint8List?> readPhoto(String name);

  Future<void> deletePhoto(String name);
}

/// [PunchQueueStore] as files: `queue.json` and the photos, in an
/// `offline_punches` folder of the app's support directory (kept until the
/// app is uninstalled, and not backed up as user documents).
class FilePunchQueueStore implements PunchQueueStore {
  FilePunchQueueStore({Future<Directory> Function()? directory})
    : _directory = directory ?? _supportFolder;

  final Future<Directory> Function() _directory;

  static Future<Directory> _supportFolder() async => Directory(
    '${(await getApplicationSupportDirectory()).path}/offline_punches',
  );

  Future<Directory> _folder() async {
    final folder = await _directory();
    await folder.create(recursive: true);
    return folder;
  }

  Future<File> _file(String name) async =>
      File('${(await _folder()).path}/$name');

  @override
  Future<PunchQueue> load() async {
    final file = await _file('queue.json');
    if (!await file.exists()) return const PunchQueue();
    try {
      return PunchQueue.fromJson(jsonDecode(await file.readAsString()) as Json);
    } on Object {
      // A half-written or older file: better an empty queue than none.
      return const PunchQueue();
    }
  }

  @override
  Future<void> save(PunchQueue queue) async {
    final file = await _file('queue.json');
    // Written aside and renamed, so a crash leaves the old file whole.
    final draft = File('${file.path}.tmp');
    await draft.writeAsString(jsonEncode(queue.toJson()), flush: true);
    await draft.rename(file.path);
  }

  @override
  Future<String> writePhoto(String clientId, Uint8List bytes) async {
    final name = 'selfie-$clientId.jpg';
    await (await _file(name)).writeAsBytes(bytes, flush: true);
    return name;
  }

  @override
  Future<Uint8List?> readPhoto(String name) async {
    final file = await _file(name);
    return await file.exists() ? file.readAsBytes() : null;
  }

  @override
  Future<void> deletePhoto(String name) async {
    final file = await _file(name);
    if (await file.exists()) await file.delete();
  }
}

final punchQueueStoreProvider = Provider<PunchQueueStore>(
  (ref) => FilePunchQueueStore(),
);

/// Punches waiting to be sent, kept for the whole run of the app.
///
/// The Today tab adds a punch that failed for want of a connection; [send]
/// tries again: when the session starts, when the app comes back to the
/// foreground, every minute while it is open (see `SessionServices`), and
/// after any call that went through ([apiContactProvider]).
final offlinePunchQueueProvider =
    NotifierProvider<OfflinePunchQueue, PunchQueue>(OfflinePunchQueue.new);

class OfflinePunchQueue extends Notifier<PunchQueue> {
  late Future<void> _loaded;
  Future<void> _saved = Future.value();

  /// The round of [send] in progress, which a second call joins.
  Future<int>? _round;

  PunchQueueStore get _store => ref.read(punchQueueStoreProvider);

  @override
  PunchQueue build() {
    _loaded = _load();
    ref.listen(apiContactProvider, (_, _) => unawaited(send()));
    return const PunchQueue();
  }

  Future<void> _load() async {
    final PunchQueue saved;
    try {
      saved = await _store.load();
    } on Object {
      return;
    }
    // Anything added while the file was read stays.
    state = PunchQueue(
      waiting: [...saved.waiting, ...state.waiting],
      refused: [...saved.refused, ...state.refused],
    );
  }

  /// Keeps [punch] to send later, with the photo of a [selfie] punch.
  Future<void> add(QueuedPunch punch, {PunchSelfie? selfie}) async {
    await _loaded;
    var queued = punch;
    if (selfie != null) {
      try {
        queued = punch.withSelfieFile(
          await _store.writePhoto(punch.clientId, selfie.bytes),
        );
      } on Object {
        // Sent without it; if the workspace needs one, the API says so.
      }
    }
    state = state.copyWith(waiting: [...state.waiting, queued]);
    await _save();
  }

  /// Sends the signed-in user's waiting punches, oldest first, and returns
  /// how many the API took.
  ///
  /// A punch the API takes (201) leaves the queue. One it refuses with a
  /// 4xx other than 401, 408 and 429 leaves it too, kept in
  /// [PunchQueue.refused] to show the user why. Anything else (no
  /// connection, a timeout, a 5xx, an ended session) keeps the punch and
  /// ends this round.
  ///
  /// A call while a round runs joins it, so punches go one at a time.
  Future<int> send() =>
      _round ??= _sendRound().whenComplete(() => _round = null);

  Future<int> _sendRound() async {
    var sent = 0;
    await _loaded;
    // The container can go while a round waits for the server.
    while (ref.mounted) {
      final userId = switch (ref.read(authProvider)) {
        SignedIn(:final user) => user.id,
        SignedOut() => null,
      };
      if (userId == null) break;
      final next = state.waitingFor(userId).firstOrNull;
      if (next == null) break;

      final outcome = await _sendOne(next);
      if (outcome == null) break;
      if (outcome is ApiException) {
        _drop(next, refusal: outcome);
      } else {
        sent++;
        _drop(next);
      }
      await _save();
    }
    if (sent > 0 && ref.mounted) {
      ref.invalidate(attendanceTodayProvider);
      ref.invalidate(myAttendanceProvider);
    }
    return sent;
  }

  /// `true` when the API took [punch], the [ApiException] when it refused
  /// it, `null` to keep it.
  Future<Object?> _sendOne(QueuedPunch punch) async {
    PunchSelfie? selfie;
    if (punch.selfieFile case final file?) {
      try {
        if (await _store.readPhoto(file) case final bytes?) {
          selfie = PunchSelfie(bytes: bytes);
        }
      } on Object {
        // Sent without it, as when it could not be saved.
      }
    }
    try {
      await ref
          .read(authProvider.notifier)
          .punch(
            location: punch.location,
            selfie: selfie,
            clientId: punch.clientId,
            punchedAt: punch.punchedAt,
          );
      return true;
    } on ApiException catch (error) {
      // A 2xx whose body the app did not expect: the punch is recorded.
      if (error.kind == ApiErrorKind.badResponse) return true;
      // Another resend of this punch got there first: it is recorded once.
      if (error.code == 'duplicate') return true;
      return isRefusal(error) ? error : null;
    } on Object {
      // SessionExpiredException, or anything unexpected: try again later.
      return null;
    }
  }

  /// Whether [error] is the API refusing a punch for good, so sending it
  /// again cannot help.
  static bool isRefusal(ApiException error) {
    final status = error.statusCode;
    return error.kind == ApiErrorKind.server &&
        status != null &&
        status >= 400 &&
        status < 500 &&
        !const {401, 408, 429}.contains(status);
  }

  void _drop(QueuedPunch punch, {ApiException? refusal}) {
    if (punch.selfieFile case final file?) {
      unawaited(_store.deletePhoto(file).catchError((Object _) {}));
    }
    state = state.copyWith(
      waiting: [
        for (final waiting in state.waiting)
          if (waiting.clientId != punch.clientId) waiting,
      ],
      refused: refusal == null
          ? null
          : [
              ...state.refused,
              RefusedPunch(
                punch: punch.withSelfieFile(null),
                statusCode: refusal.statusCode,
                code: refusal.code,
                message: refusal.message,
              ),
            ],
    );
  }

  /// Forgets a refused punch once the user has seen it.
  Future<void> dismiss(String clientId) async {
    await _loaded;
    state = state.copyWith(
      refused: [
        for (final refusal in state.refused)
          if (refusal.punch.clientId != clientId) refusal,
      ],
    );
    await _save();
  }

  /// Saves one after another, each the latest state.
  Future<void> _save() => _saved = _saved.then((_) async {
    try {
      await _store.save(state);
    } on Object {
      // Kept in memory for this run of the app.
    }
  });
}
