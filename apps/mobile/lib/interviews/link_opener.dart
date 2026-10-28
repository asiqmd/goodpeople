import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

/// Opens a web link, such as an interview's video call, outside the app.
///
/// Widget tests replace it with a fake through [linkOpenerProvider].
abstract interface class LinkOpener {
  /// Opens [uri] in the browser, or in the app that handles it (a meeting
  /// app for its own links). `false` when nothing could open it.
  Future<bool> open(Uri uri);
}

/// [LinkOpener] on the device, through url_launcher.
class UrlLauncherLinkOpener implements LinkOpener {
  const UrlLauncherLinkOpener();

  @override
  Future<bool> open(Uri uri) async {
    try {
      return await launchUrl(uri, mode: LaunchMode.externalApplication);
    } on Object {
      return false;
    }
  }
}

final linkOpenerProvider = Provider<LinkOpener>(
  (ref) => const UrlLauncherLinkOpener(),
);
