import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

/// Why a file could not be shown.
enum FileOpenProblem {
  /// No app on the phone opens this kind of file, for example no PDF
  /// reader.
  noApp,

  /// Saving or opening failed.
  failed,
}

/// Thrown by [FileOpener.open].
class FileOpenFailed implements Exception {
  const FileOpenFailed(this.problem);

  final FileOpenProblem problem;

  @override
  String toString() => 'FileOpenFailed(${problem.name})';
}

/// Shows a downloaded file, such as a PDF, in the phone's own viewer.
///
/// Widget tests replace it with a fake through [fileOpenerProvider], since
/// there is no other app to hand a file to under `flutter test`.
abstract interface class FileOpener {
  /// Saves [bytes] as [fileName] in the app's cache and opens it in the
  /// viewer for [contentType]. Throws [FileOpenFailed].
  Future<void> open(
    Uint8List bytes, {
    required String fileName,
    required String contentType,
  });

  /// Deletes every file [open] saved. Never throws.
  Future<void> clear();
}

/// [FileOpener] on the device: path_provider for the cache directory and
/// open_filex for the viewer (an Android intent through a FileProvider, a
/// QuickLook preview on iOS).
///
/// HR documents can be personal (an NID scan, a contract), so only the file
/// opened last is kept, in its own folder, and signing out deletes it.
class OpenFilexFileOpener implements FileOpener {
  const OpenFilexFileOpener();

  static const _folder = 'gp-documents';

  Future<Directory> _directory() async =>
      Directory('${(await getTemporaryDirectory()).path}/$_folder');

  @override
  Future<void> open(
    Uint8List bytes, {
    required String fileName,
    required String contentType,
  }) async {
    final OpenResult result;
    try {
      final directory = await _directory();
      if (directory.existsSync()) await directory.delete(recursive: true);
      await directory.create(recursive: true);
      final file = File('${directory.path}/${safeFileName(fileName)}');
      await file.writeAsBytes(bytes, flush: true);
      result = await OpenFilex.open(
        file.path,
        type: contentType,
        uti: contentType == 'application/pdf' ? 'com.adobe.pdf' : null,
      );
    } on Object {
      throw const FileOpenFailed(FileOpenProblem.failed);
    }
    switch (result.type) {
      case ResultType.done:
        return;
      case ResultType.noAppToOpen:
        throw const FileOpenFailed(FileOpenProblem.noApp);
      case ResultType.fileNotFound ||
          ResultType.permissionDenied ||
          ResultType.error:
        throw const FileOpenFailed(FileOpenProblem.failed);
    }
  }

  @override
  Future<void> clear() async {
    try {
      final directory = await _directory();
      if (directory.existsSync()) await directory.delete(recursive: true);
    } on Object {
      // Nothing saved, or no file system to clear (as under tests).
    }
  }
}

/// [fileName] without path separators or characters file systems refuse,
/// and never empty.
String safeFileName(String fileName) {
  final cleaned = fileName
      .replaceAll(RegExp(r'[\\/:*?"<>|\x00-\x1f]'), '_')
      .trim();
  return cleaned.isEmpty || cleaned.startsWith('.')
      ? 'document$cleaned'
      : cleaned;
}

final fileOpenerProvider = Provider<FileOpener>(
  (ref) => const OpenFilexFileOpener(),
);
