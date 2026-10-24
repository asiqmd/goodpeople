import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../approvals/approvals_providers.dart';
import '../approvals/approvals_tab.dart';
import '../l10n/app_localizations.dart';
import '../ui/format.dart';
import '../ui/language_menu.dart';
import 'apply_tab.dart';
import 'balances_tab.dart';
import 'holidays_tab.dart';
import 'requests_tab.dart';

enum LeaveTab { balances, apply, requests, approvals, holidays }

/// Leave for the signed-in user: balances, the apply form, their own
/// requests, approvals waiting for them, and the holiday calendar.
///
/// The Approvals tab shows only while the inbox is not empty, with the
/// count as a badge. It is the whole inbox, attendance corrections
/// included. Tabs keep their state (a half-filled form survives a
/// look at the balances), and each loads the first time it is opened.
class LeaveScreen extends ConsumerStatefulWidget {
  const LeaveScreen({super.key, this.initialTab = LeaveTab.balances});

  /// The tab shown first, for example when a notification opens the screen.
  final LeaveTab initialTab;

  static ValueKey<String> tabKey(LeaveTab tab) =>
      ValueKey('leave-tab-${tab.name}');

  static const approvalsBadgeKey = ValueKey('leave-approvals-badge');

  static Route<void> route({LeaveTab initialTab = LeaveTab.balances}) =>
      MaterialPageRoute(
        builder: (context) => LeaveScreen(initialTab: initialTab),
      );

  @override
  ConsumerState<LeaveScreen> createState() => _LeaveScreenState();
}

class _LeaveScreenState extends ConsumerState<LeaveScreen>
    with TickerProviderStateMixin {
  List<LeaveTab> _tabs = const [];
  TabController? _controller;
  late LeaveTab _selected = widget.initialTab;

  /// Tabs opened so far. The others are not built, so they load nothing.
  late final _opened = <LeaveTab>{widget.initialTab};

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  /// The controller for [tabs], made anew when the Approvals tab comes or
  /// goes. The selected tab stays selected; if it went away, Balances is.
  TabController _controllerFor(List<LeaveTab> tabs) {
    final current = _controller;
    if (current != null && listEquals(tabs, _tabs)) return current;

    if (!tabs.contains(_selected)) {
      _selected = LeaveTab.balances;
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

  void _show(LeaveTab tab) {
    final index = _tabs.indexOf(tab);
    if (index >= 0) _controller?.animateTo(index);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final waiting = ref.watch(approvalsProvider).value?.length ?? 0;
    final tabs = [
      LeaveTab.balances,
      LeaveTab.apply,
      LeaveTab.requests,
      if (waiting > 0) LeaveTab.approvals,
      LeaveTab.holidays,
    ];
    final controller = _controllerFor(tabs);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.leaveTitle),
        actions: const [LanguageMenuButton()],
        bottom: TabBar(
          controller: controller,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: [
            for (final tab in tabs)
              Tab(
                key: LeaveScreen.tabKey(tab),
                child: tab == LeaveTab.approvals
                    ? Row(
                        mainAxisSize: MainAxisSize.min,
                        spacing: 8,
                        children: [
                          Text(_label(l10n, tab)),
                          Badge(
                            key: LeaveScreen.approvalsBadgeKey,
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

  Widget _body(LeaveTab tab) => switch (tab) {
    LeaveTab.balances => const BalancesTab(),
    LeaveTab.apply => ApplyTab(onShowRequests: () => _show(LeaveTab.requests)),
    LeaveTab.requests => const RequestsTab(),
    LeaveTab.approvals => const ApprovalsTab(),
    LeaveTab.holidays => const HolidaysTab(),
  };

  static String _label(AppLocalizations l10n, LeaveTab tab) => switch (tab) {
    LeaveTab.balances => l10n.leaveTabBalances,
    LeaveTab.apply => l10n.leaveTabApply,
    LeaveTab.requests => l10n.leaveTabRequests,
    LeaveTab.approvals => l10n.leaveTabApprovals,
    LeaveTab.holidays => l10n.leaveTabHolidays,
  };
}
