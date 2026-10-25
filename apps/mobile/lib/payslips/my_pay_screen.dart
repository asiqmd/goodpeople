import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../ui/language_menu.dart';
import 'loans_tab.dart';
import 'payslips_tab.dart';
import 'provident_fund_tab.dart';
import 'tax_tab.dart';

enum MyPayTab { payslips, tax, providentFund, loans }

/// My pay for the signed-in employee: payslips, salary tax for the income
/// year (with the investment declaration and the certificate), the
/// provident fund statement, and salary advances and loans.
///
/// Like Leave and Attendance, tabs keep their state (a half-filled
/// declaration survives a look at the payslips), and each loads the first
/// time it is opened.
class MyPayScreen extends ConsumerStatefulWidget {
  const MyPayScreen({super.key, this.initialTab = MyPayTab.payslips});

  /// The tab shown first, for example when a notification opens the screen.
  final MyPayTab initialTab;

  static ValueKey<String> tabKey(MyPayTab tab) =>
      ValueKey('my-pay-tab-${tab.name}');

  static Route<void> route({MyPayTab initialTab = MyPayTab.payslips}) =>
      MaterialPageRoute(
        builder: (context) => MyPayScreen(initialTab: initialTab),
      );

  @override
  ConsumerState<MyPayScreen> createState() => _MyPayScreenState();
}

class _MyPayScreenState extends ConsumerState<MyPayScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _controller = TabController(
    length: MyPayTab.values.length,
    initialIndex: widget.initialTab.index,
    vsync: this,
  )..addListener(_onTabChanged);

  late MyPayTab _selected = widget.initialTab;

  /// Tabs opened so far. The others are not built, so they load nothing.
  late final _opened = <MyPayTab>{widget.initialTab};

  @override
  void dispose() {
    _controller
      ..removeListener(_onTabChanged)
      ..dispose();
    super.dispose();
  }

  void _onTabChanged() {
    final tab = MyPayTab.values[_controller.index];
    if (tab == _selected) return;
    setState(() {
      _selected = tab;
      _opened.add(tab);
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.myPayTitle),
        actions: const [LanguageMenuButton()],
        bottom: TabBar(
          controller: _controller,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: [
            for (final tab in MyPayTab.values)
              Tab(key: MyPayScreen.tabKey(tab), text: _label(l10n, tab)),
          ],
        ),
      ),
      body: SafeArea(
        child: IndexedStack(
          index: _selected.index,
          sizing: StackFit.expand,
          children: [
            for (final tab in MyPayTab.values)
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

  static Widget _body(MyPayTab tab) => switch (tab) {
    MyPayTab.payslips => const PayslipsTab(),
    MyPayTab.tax => const TaxTab(),
    MyPayTab.providentFund => const ProvidentFundTab(),
    MyPayTab.loans => const LoansTab(),
  };

  static String _label(AppLocalizations l10n, MyPayTab tab) => switch (tab) {
    MyPayTab.payslips => l10n.payslipsTitle,
    MyPayTab.tax => l10n.myPayTabTax,
    MyPayTab.providentFund => l10n.myPayTabProvidentFund,
    MyPayTab.loans => l10n.myPayTabLoans,
  };
}
