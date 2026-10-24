import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../ui/language_menu.dart';

/// A document that is a photo or a scan, shown in the app. Pinch or
/// double-tap to zoom.
class DocumentImageScreen extends StatefulWidget {
  const DocumentImageScreen({
    super.key,
    required this.title,
    required this.bytes,
  });

  final String title;
  final Uint8List bytes;

  static const imageKey = ValueKey('document-image');
  static const viewerKey = ValueKey('document-image-viewer');

  static Route<void> route({required String title, required Uint8List bytes}) =>
      MaterialPageRoute(
        builder: (context) => DocumentImageScreen(title: title, bytes: bytes),
      );

  /// How far the image can be zoomed in, and the step a double tap takes.
  static const maxScale = 5.0;
  static const doubleTapScale = 2.5;

  @override
  State<DocumentImageScreen> createState() => _DocumentImageScreenState();
}

class _DocumentImageScreenState extends State<DocumentImageScreen> {
  final _transform = TransformationController();
  TapDownDetails? _doubleTap;

  @override
  void dispose() {
    _transform.dispose();
    super.dispose();
  }

  /// Zooms in around the tapped point, or back out when zoomed.
  void _toggleZoom() {
    if (_transform.value.getMaxScaleOnAxis() > 1) {
      _transform.value = Matrix4.identity();
      return;
    }
    final at = _doubleTap?.localPosition ?? Offset.zero;
    const scale = DocumentImageScreen.doubleTapScale;
    _transform.value = Matrix4.identity()
      ..translateByDouble(-at.dx * (scale - 1), -at.dy * (scale - 1), 0, 1)
      ..scaleByDouble(scale, scale, 1, 1);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: const [LanguageMenuButton()],
      ),
      body: SafeArea(
        child: GestureDetector(
          onDoubleTapDown: (details) => _doubleTap = details,
          onDoubleTap: _toggleZoom,
          child: InteractiveViewer(
            key: DocumentImageScreen.viewerKey,
            transformationController: _transform,
            maxScale: DocumentImageScreen.maxScale,
            child: Center(
              child: Image.memory(
                widget.bytes,
                key: DocumentImageScreen.imageKey,
                fit: BoxFit.contain,
                semanticLabel: widget.title,
                gaplessPlayback: true,
                errorBuilder: (context, error, stackTrace) => Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.broken_image_outlined,
                        size: 48,
                        color: theme.colorScheme.outline,
                      ),
                      const SizedBox(height: 16),
                      Text(l10n.imageLoadFailed, textAlign: TextAlign.center),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
