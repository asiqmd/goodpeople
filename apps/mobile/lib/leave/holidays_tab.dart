import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../ui/format.dart';
import '../ui/load_error_view.dart';
import 'leave_providers.dart';
import 'leave_widgets.dart';

/// The employee's holiday calendar for the chosen year.
class HolidaysTab extends ConsumerWidget {
  const HolidaysTab({super.key});

  static ValueKey<String> holidayKey(String holidayId) =>
      ValueKey('holiday-$holidayId');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final year = ref.watch(leaveYearProvider);
    final holidays = ref.watch(myHolidaysProvider(year));

    return RefreshIndicator(
      onRefresh: () =>
          awaitRefresh(ref.refresh(myHolidaysProvider(year).future)),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          const LeaveYearSwitcher(),
          const SizedBox(height: 16),
          switch (holidays) {
            AsyncData(value: final HolidayYear view) => _HolidayList(
              view: view,
            ),
            AsyncData() => LeaveEmptyState(
              icon: Icons.event_busy_outlined,
              message: l10n.holidaysNoCalendar,
            ),
            AsyncError(:final error)
                when !holidays.isLoading && error is! SessionExpiredException =>
              LoadErrorView(
                title: l10n.holidaysLoadFailed,
                error: error,
                onRetry: () => ref.invalidate(myHolidaysProvider(year)),
              ),
            _ => const LeaveLoading(),
          },
        ],
      ),
    );
  }
}

class _HolidayList extends StatelessWidget {
  const _HolidayList({required this.view});

  final HolidayYear view;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    if (view.holidays.isEmpty) {
      return LeaveEmptyState(
        icon: Icons.event_busy_outlined,
        message: l10n.holidaysNone(formatYear(l10n, view.year)),
      );
    }
    final anyTentative = view.holidays.any((holiday) => holiday.isTentative);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          view.calendar.name,
          style: theme.textTheme.labelLarge?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 8),
        Card.outlined(
          margin: EdgeInsets.zero,
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              for (final (index, holiday) in view.holidays.indexed) ...[
                if (index > 0) const Divider(height: 1),
                _HolidayRow(
                  key: HolidaysTab.holidayKey(holiday.id),
                  holiday: holiday,
                ),
              ],
            ],
          ),
        ),
        if (anyTentative) ...[
          const SizedBox(height: 12),
          Text(
            l10n.holidaysTentativeNote,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ],
    );
  }
}

class _HolidayRow extends StatelessWidget {
  const _HolidayRow({super.key, required this.holiday});

  final Holiday holiday;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final warning = scheme.tertiaryContainer;

    return MergeSemantics(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 96,
              child: Text(
                formatWeekdayDate(l10n, holiday.date),
                style: theme.textTheme.titleSmall,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    localizedName(l10n, holiday.name, holiday.nameBn),
                    style: theme.textTheme.bodyLarge,
                  ),
                  Text(
                    l10n.holidayKindName(holiday.kind.wire),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                  if (holiday.isTentative)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: LeavePill(
                        label: l10n.holidayTentative,
                        background: warning,
                        foreground: scheme.onTertiaryContainer,
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
