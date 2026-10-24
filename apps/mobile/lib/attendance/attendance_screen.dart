import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../approvals/approvals_providers.dart';
import '../approvals/approvals_tab.dart';
import '../l10n/app_localizations.dart';
import '../ui/format.dart';
import '../ui/language_menu.dart';
import 'attendance_providers.dart';
import 'correction_form_screen.dart';
import 'corrections_tab.dart';
import 'month_tab.dart';
import 'today_tab.dart';

enum AttendanceTab { today, month, corrections, approvals }

/// Attendance for the signed-in user: today with the punch button, this
/// month so far, their corrections, and approvals waiting for them.
///
/// Like the Leave screen, the Approvals tab (the whole inbox, leave
/// included) shows only while the inbox is not empty, with the count as a
/// badge. Tabs keep their state, and each loads the first time it is
/// opened.
class AttendanceScreen extends ConsumerStatefulWidget {
  const AttendanceScreen({super.key});

  static ValueKey<String> tabKey(AttendanceTab tab) =>
      ValueKey('attendance-tab-${tab.name}');

  static const approvalsBadgeKey = ValueKey('attendance-approvals-badge');

  static Route<void> route() =>
      MaterialPageRoute(builder: (context) => const AttendanceScreen());

  @override
  ConsumerState<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends ConsumerState<AttendanceScreen>
    with TickerProviderStateMixin {
  List<AttendanceTab> _tabs = const [];
  TabController? _controller;
  AttendanceTab _selected = AttendanceTab.today;

  /// Tabs opened so far. The others are not built, so they load nothing.
  final _opened = <AttendanceTab>{AttendanceTab.today};

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  /// The controller for [tabs], made anew when the Approvals tab comes or
  /// goes. The selected tab stays selected; if it went away, Today is.
  TabController _controllerFor(List<AttendanceTab> tabs) {
    final current = _controller;
    if (current != null && listEquals(tabs, _tabs)) return current;

    if (!tabs.contains(_selected)) {
      _selected = AttendanceTab.today;
      _opened.add(_selected);
    }
    final next = TabController(
      length: tabs.length,
      initialIndex: tabs.indexOf(_selected),
      vsync: this,
    )..addListener(_onTabChanged);
    if (current != null) {
      current.removeListener(_onTabChanged);
      // The old TabBar lets go of it during this frame.
      WidgetsBinding.instance.addPostFrameCallback((_) => current.dispose());
    }
    _tabs = tabs;
    _controller = next;
    return next;
  }

  void _onTabChanged() {
    final tab = _tabs[_controller!.index];
    if (tab == _selected) return;
    setState(() {
      _selected = tab;
      _opened.add(tab);
    });
  }

  void _show(AttendanceTab tab) {
    final index = _tabs.indexOf(tab);
    if (index >= 0) _controller?.animateTo(index);
  }

  /// Opens the correction form, for [day] when it comes from the month. A
  /// sent correction shows under Corrections.
  Future<void> _requestCorrection({AttendanceDay? day}) async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final shift =
        day?.shift ?? ref.read(attendanceTodayProvider).value?.day.shift;
    final created = await Navigator.of(context)
        .push(CorrectionFormScreen.route(date: day?.date, shift: shift));
    if (created == null || !mounted) return;
    messenger.showSnackBar(SnackBar(content: Text(l10n.correctionSent)));
    _show(AttendanceTab.corrections);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final waiting = ref.watch(approvalsProvider).value?.length ?? 0;
    final tabs = [
      AttendanceTab.today,
      AttendanceTab.month,
      AttendanceTab.corrections,
      if (waiting > 0) AttendanceTab.approvals,
    ];
    final controller = _controllerFor(tabs);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.attendanceTitle),
        actions: const [LanguageMenuButton()],
        bottom: TabBar(
          controller: controller,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: [
            for (final tab in tabs)
              Tab(
                key: AttendanceScreen.tabKey(tab),
                child: tab == AttendanceTab.approvals
                    ? Row(
                        mainAxisSize: MainAxisSize.min,
                        spacing: 8,
                        children: [
                          Text(_label(l10n, tab)),
                          Badge(
                            key: AttendanceScreen.approvalsBadgeKey,
                            label: Text(formatNumber(l10n, waiting)),
                          ),
                        ],
                      )
                    : Text(_label(l10n, tab)),
              ),
          ],
        ),
      ),
      body: SafeArea(
        child: IndexedStack(
          index: tabs.indexOf(_selected),
          sizing: StackFit.expand,
          children: [
            for (final tab in tabs)
              KeyedSubtree(
                key: ValueKey(tab),
                child: _opened.contains(tab)
                    ? _body(tab)
                    : const SizedBox.shrink(),
              ),
          ],
        ),
      ),
    );
  }

  Widget _body(AttendanceTab tab) => switch (tab) {
    AttendanceTab.today => const TodayTab(),
    AttendanceTab.month => MonthTab(
      onCorrect: (day) => _requestCorrection(day: day),
    ),
    AttendanceTab.corrections => CorrectionsTab(onRequest: _requestCorrection),
    AttendanceTab.approvals => const ApprovalsTab(),
  };

  static String _label(AppLocalizations l10n, AttendanceTab tab) =>
      switch (tab) {
        AttendanceTab.today => l10n.attendanceTabToday,
        AttendanceTab.month => l10n.attendanceTabMonth,
        AttendanceTab.corrections => l10n.attendanceTabCorrections,
        AttendanceTab.approvals => l10n.leaveTabApprovals,
      };
}
