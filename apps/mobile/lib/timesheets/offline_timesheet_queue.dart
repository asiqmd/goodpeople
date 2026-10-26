import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../attendance/offline_punch_queue.dart';
import '../auth/auth_controller.dart';
import 'timesheet_providers.dart';

/// Hours typed for one day and project, kept on the phone until the API has
/// them. Field staff fill in their timesheet where there is no connection.
///
/// [clientId] is chosen when the hours are typed and never changes: the API
/// recognises a resend by it and does not apply it twice. Typing the same
/// cell again replaces the waiting edit with a new one.
class QueuedTimesheetEntry {
  const QueuedTimesheetEntry({
    required this.clientId,
    required this.userId,
    required this.date,
    required this.hours,
    this.projectId,
  });

  factory QueuedTimesheetEntry.fromJson(Json json) => QueuedTimesheetEntry(
    clientId: json['clientId']! as String,
    userId: json['userId']! as String,
    date: DateTime.parse('${json['date']! as String}T00:00:00Z'),
    projectId: json['projectId'] as String?,
    hours: json['hours']! as String,
  );

  final String clientId;

  /// The login it belongs to: it is sent only in that login's session.
  final String userId;

  /// The day, UTC midnight.
  final DateTime date;

  /// `null`: work not charged to a project.
  final String? projectId;

  /// Such as `7.5`; `0` removes the cell.
  final String hours;

  /// The month it belongs to, UTC midnight on the first.
  DateTime get month => DateTime.utc(date.year, date.month);

  /// Whether this edit is for the same cell as [other].
  bool sameCell(QueuedTimesheetEntry other) =>
      userId == other.userId &&
      projectId == other.projectId &&
      toWireDate(date) == toWireDate(other.date);

  TimesheetEntryDraft get draft => TimesheetEntryDraft(
    clientId: clientId,
    date: date,
    projectId: projectId,
    hours: hours,
  );

  Json toJson() => {
    'clientId': clientId,
    'userId': userId,
    'date': toWireDate(date),
    'projectId': projectId,
    'hours': hours,
  };
}

/// A waiting edit the API did not save. It has left the queue; it is kept
/// until the user has seen why.
class RefusedTimesheetEntry {
  const RefusedTimesheetEntry({
    required this.entry,
    required this.message,
    this.statusCode,
    this.code,
  });

  factory RefusedTimesheetEntry.fromJson(Json json) => RefusedTimesheetEntry(
    entry: QueuedTimesheetEntry.fromJson(json['entry']! as Json),
    statusCode: json['statusCode'] as int?,
    code: json['code'] as String?,
    message: json['message']! as String,
  );

  final QueuedTimesheetEntry entry;
  final int? statusCode;

  /// The API's `code`, for example `day_over_24_hours` or `timesheet_locked`.
  final String? code;

  /// The API's message (English), shown when the code has no translation.
  final String message;

  /// The refusal as an [ApiException], for the same text as a live error.
  ApiException get error => ApiException(
    kind: ApiErrorKind.server,
    statusCode: statusCode,
    message: message,
    code: code,
  );

  Json toJson() => {
    'entry': entry.toJson(),
    'statusCode': statusCode,
    'code': code,
    'message': message,
  };
}

/// Everything the queue holds, for every login on the phone.
class TimesheetQueue {
  const TimesheetQueue({this.waiting = const [], this.refused = const []});

  factory TimesheetQueue.fromJson(Json json) => TimesheetQueue(
    waiting: [
      for (final item in json['waiting'] as List<Object?>? ?? const [])
        QueuedTimesheetEntry.fromJson(item! as Json),
    ],
    refused: [
      for (final item in json['refused'] as List<Object?>? ?? const [])
        RefusedTimesheetEntry.fromJson(item! as Json),
    ],
  );

  /// In the order they were typed.
  final List<QueuedTimesheetEntry> waiting;
  final List<RefusedTimesheetEntry> refused;

  List<QueuedTimesheetEntry> waitingFor(String userId, [DateTime? month]) => [
    for (final entry in waiting)
      if (entry.userId == userId && (month == null || entry.month == month))
        entry,
  ];

  List<RefusedTimesheetEntry> refusedFor(String userId) => [
    for (final refusal in refused)
      if (refusal.entry.userId == userId) refusal,
  ];

  TimesheetQueue copyWith({
    List<QueuedTimesheetEntry>? waiting,
    List<RefusedTimesheetEntry>? refused,
  }) => TimesheetQueue(
    waiting: waiting ?? this.waiting,
    refused: refused ?? this.refused,
  );

  Json toJson() => {
    'version': 1,
    'waiting': [for (final entry in waiting) entry.toJson()],
    'refused': [for (final refusal in refused) refusal.toJson()],
  };
}

/// Where the queue is kept between runs of the app, with the last copy of
/// each month seen, so the timesheet opens without a connection.
abstract interface class TimesheetQueueStore {
  /// What was saved last, or an empty queue.
  Future<TimesheetQueue> load();

  Future<void> save(TimesheetQueue queue);

  /// The month as the API last answered it for [userId], or `null`.
  Future<Json?> loadMonth(String userId, String month);

  Future<void> saveMonth(String userId, String month, Json timesheet);
}

/// [TimesheetQueueStore] as files in an `offline_timesheets` folder of the
/// app's support directory.
class FileTimesheetQueueStore implements TimesheetQueueStore {
  FileTimesheetQueueStore({Future<Directory> Function()? directory})
    : _directory = directory ?? _supportFolder;

  final Future<Directory> Function() _directory;

  static Future<Directory> _supportFolder() async => Directory(
    '${(await getApplicationSupportDirectory()).path}/offline_timesheets',
  );

  Future<File> _file(String name) async {
    final folder = await _directory();
    await folder.create(recursive: true);
    return File('${folder.path}/$name');
  }

  Future<Json?> _read(String name) async {
    final file = await _file(name);
    if (!await file.exists()) return null;
    try {
      return jsonDecode(await file.readAsString()) as Json;
    } on Object {
      // A half-written or older file: as if there were none.
      return null;
    }
  }

  /// Written aside and renamed, so a crash leaves the old file whole.
  Future<void> _write(String name, Json json) async {
    final file = await _file(name);
    final draft = File('${file.path}.tmp');
    await draft.writeAsString(jsonEncode(json), flush: true);
    await draft.rename(file.path);
  }

  @override
  Future<TimesheetQueue> load() async => switch (await _read('queue.json')) {
    final Json json => _parse(json),
    null => const TimesheetQueue(),
  };

  static TimesheetQueue _parse(Json json) {
    try {
      return TimesheetQueue.fromJson(json);
    } on Object {
      return const TimesheetQueue();
    }
  }

  @override
  Future<void> save(TimesheetQueue queue) =>
      _write('queue.json', queue.toJson());

  @override
  Future<Json?> loadMonth(String userId, String month) =>
      _read('month-$userId-$month.json');

  @override
  Future<void> saveMonth(String userId, String month, Json timesheet) =>
      _write('month-$userId-$month.json', timesheet);
}

final timesheetQueueStoreProvider = Provider<TimesheetQueueStore>(
  (ref) => FileTimesheetQueueStore(),
);

/// Timesheet edits waiting to be sent, kept for the whole run of the app.
///
/// [send] goes when the session starts, when the app comes back to the
/// foreground, every minute while it is open (see `SessionServices`), right
/// after the user saves a day, and after any call that went through.
final offlineTimesheetQueueProvider =
    NotifierProvider<OfflineTimesheetQueue, TimesheetQueue>(
      OfflineTimesheetQueue.new,
    );

class OfflineTimesheetQueue extends Notifier<TimesheetQueue> {
  late Future<void> _loaded;
  Future<void> _saved = Future.value();

  /// The round of [send] in progress, which a second call joins.
  Future<int>? _round;

  TimesheetQueueStore get _store => ref.read(timesheetQueueStoreProvider);

  @override
  TimesheetQueue build() {
    _loaded = _load();
    ref.listen(apiContactProvider, (_, _) => unawaited(send()));
    return const TimesheetQueue();
  }

  Future<void> _load() async {
    final TimesheetQueue saved;
    try {
      saved = await _store.load();
    } on Object {
      return;
    }
    // Anything typed while the file was read stays, after what was saved.
    state = TimesheetQueue(
      waiting: [
        for (final entry in saved.waiting)
          if (!state.waiting.any(entry.sameCell)) entry,
        ...state.waiting,
      ],
      refused: [...saved.refused, ...state.refused],
    );
  }

  /// Keeps [entries] to send, each replacing a waiting edit of its cell.
  Future<void> edit(List<QueuedTimesheetEntry> entries) async {
    await _loaded;
    state = state.copyWith(
      waiting: [
        for (final waiting in state.waiting)
          if (!entries.any(waiting.sameCell)) waiting,
        ...entries,
      ],
    );
    await _save();
  }

  /// Sends the signed-in user's waiting edits, a month at a time in one
  /// batch each, and returns how many the API took.
  ///
  /// What the API saves leaves the queue; what it refuses (one entry, or a
  /// whole batch with a 4xx other than 401, 408 and 429, such as a month
  /// already submitted) leaves it too, kept in [TimesheetQueue.refused] to
  /// show the user why. Anything else (no connection, a timeout, a 5xx, an
  /// ended session) keeps the edits and ends this round.
  Future<int> send() =>
      _round ??= _sendRound().whenComplete(() => _round = null);

  Future<int> _sendRound() async {
    var sent = 0;
    await _loaded;
    while (ref.mounted) {
      final userId = switch (ref.read(authProvider)) {
        SignedIn(:final user) => user.id,
        SignedOut() => null,
      };
      if (userId == null) break;
      final first = state.waitingFor(userId).firstOrNull;
      if (first == null) break;
      final month = first.month;
      final batch = state.waitingFor(userId, month);

      final TimesheetSaveResult result;
      try {
        result = await ref.read(authProvider.notifier).saveTimesheetEntries(
          month,
          [for (final e in batch) e.draft],
        );
      } on ApiException catch (error) {
        if (!OfflinePunchQueue.isRefusal(error)) break;
        _drop(
          batch,
          refusals: {
            for (final entry in batch)
              entry.clientId: (
                statusCode: error.statusCode,
                code: error.code,
                message: error.message,
              ),
          },
        );
        await _save();
        continue;
      } on Object {
        // SessionExpiredException, or anything unexpected: try again later.
        break;
      }
      sent += result.acceptedClientIds.length;
      _drop(
        batch,
        refusals: {
          for (final refusal in result.refused)
            ?refusal.clientId: (
              statusCode: null,
              code: refusal.code,
              message: refusal.message,
            ),
        },
      );
      await _save();
      if (ref.mounted) ref.invalidate(myTimesheetProvider(month));
    }
    return sent;
  }

  void _drop(
    List<QueuedTimesheetEntry> batch, {
    required Map<String, ({int? statusCode, String? code, String message})>
    refusals,
  }) {
    final ids = {for (final entry in batch) entry.clientId};
    state = state.copyWith(
      waiting: [
        for (final waiting in state.waiting)
          if (!ids.contains(waiting.clientId)) waiting,
      ],
      refused: [
        ...state.refused,
        for (final entry in batch)
          if (refusals[entry.clientId] case final refusal?)
            RefusedTimesheetEntry(
              entry: entry,
              statusCode: refusal.statusCode,
              code: refusal.code,
              message: refusal.message,
            ),
      ],
    );
  }

  /// Forgets a refused edit once the user has seen it.
  Future<void> dismiss(String clientId) async {
    await _loaded;
    state = state.copyWith(
      refused: [
        for (final refusal in state.refused)
          if (refusal.entry.clientId != clientId) refusal,
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
