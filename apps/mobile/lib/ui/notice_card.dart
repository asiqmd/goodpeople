import 'package:flutter/material.dart';

/// A coloured box with an icon, an optional title and a message.
class NoticeCard extends StatelessWidget {
  const NoticeCard({
    super.key,
    required this.message,
    required this.background,
    required this.foreground,
    required this.icon,
    this.title,
    this.details = const [],
  });

  final String? title;
  final String message;
  final List<String> details;
  final Color background;
  final Color foreground;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final bodyStyle = textTheme.bodyMedium?.copyWith(color: foreground);
    return Semantics(
      container: true,
      liveRegion: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: foreground, size: 20),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (title case final title?)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 2),
                        child: Text(
                          title,
                          style: textTheme.titleSmall?.copyWith(
                            color: foreground,
                          ),
                        ),
                      ),
                    Text(message, style: bodyStyle),
                    for (final detail in details)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text('• $detail', style: bodyStyle),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
