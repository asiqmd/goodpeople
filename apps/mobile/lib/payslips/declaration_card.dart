import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_widgets.dart';
import '../ui/error_text.dart';
import '../ui/format.dart';
import '../ui/notice_card.dart';
import 'pay_providers.dart';
import 'pay_widgets.dart';

/// The employee's investment declaration for an income year: its status,
/// and a form to change it until payroll verifies it. Once verified, what
/// was declared and what payroll accepted, read-only.
///
/// The form keeps what the user typed while the year reloads; it starts
/// again from the server's declaration only when nothing was changed.
class DeclarationCard extends ConsumerStatefulWidget {
  const DeclarationCard({
    super.key,
    required this.fiscalYear,
    required this.declaration,
  });

  final String fiscalYear;
  final TaxDeclaration declaration;

  static const statusKey = ValueKey('declaration-status');
  static const formKey = ValueKey('declaration-form');
  static const readOnlyKey = ValueKey('declaration-read-only');
  static const errorKey = ValueKey('declaration-error');
  static const addRowKey = ValueKey('declaration-add-row');
  static const saveDraftKey = ValueKey('declaration-save-draft');
  static const submitKey = ValueKey('declaration-submit');
  static const totalKey = ValueKey('declaration-total');
  static ValueKey<String> kindFieldKey(int row) =>
      ValueKey('declaration-kind-$row');
  static ValueKey<String> amountFieldKey(int row) =>
      ValueKey('declaration-amount-$row');
  static ValueKey<String> noteFieldKey(int row) =>
      ValueKey('declaration-note-$row');
  static ValueKey<String> removeRowKey(int row) =>
      ValueKey('declaration-remove-$row');
  static ValueKey<String> itemKey(int index) =>
      ValueKey('declaration-item-$index');

  /// The most lines the API takes.
  static const maxItems = 30;

  @override
  ConsumerState<DeclarationCard> createState() => _DeclarationCardState();
}

/// One line of the form.
class _Row {
  _Row({this.kind, String amount = '', String note = ''})
    : amount = TextEditingController(text: amount),
      note = TextEditingController(text: note);

  factory _Row.of(DeclarationItem item) => _Row(
    // A kind this app does not know must be chosen again before saving.
    kind: item.kind == InvestmentKind.unknown ? null : item.kind,
    amount: _editable(item.declared),
    note: item.note ?? '',
  );

  InvestmentKind? kind;
  final TextEditingController amount;
  final TextEditingController note;

  /// Nothing entered: left out when saving instead of refused.
  bool get isBlank =>
      kind == null && amount.text.trim().isEmpty && note.text.trim().isEmpty;

  void dispose() {
    amount.dispose();
    note.dispose();
  }

  /// `100000.00` as `100000`, for editing.
  static String _editable(String money) =>
      money.endsWith('.00') ? money.substring(0, money.length - 3) : money;
}

enum _Saving { draft, submit }

class _DeclarationCardState extends ConsumerState<DeclarationCard> {
  final _formKey = GlobalKey<FormState>();
  List<_Row> _rows = [];

  /// What the last save answered, until the year reloads with it.
  TaxDeclaration? _saved;

  /// Set by any change to the form, cleared by a save.
  bool _dirty = false;
  _Saving? _saving;
  Object? _error;

  TaxDeclaration get _declaration => _saved ?? widget.declaration;

  @override
  void initState() {
    super.initState();
    _rows = _rowsOf(widget.declaration);
  }

  @override
  void didUpdateWidget(DeclarationCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (identical(oldWidget.declaration, widget.declaration)) return;
    _saved = null;
    if (!_dirty) _replaceRows(_rowsOf(widget.declaration));
  }

  @override
  void dispose() {
    for (final row in _rows) {
      row.dispose();
    }
    super.dispose();
  }

  /// The declaration's items, or one empty line to start with.
  static List<_Row> _rowsOf(TaxDeclaration declaration) => [
    for (final item in declaration.items) _Row.of(item),
    if (declaration.items.isEmpty) _Row(),
  ];

  void _replaceRows(List<_Row> rows) {
    final old = _rows;
    _rows = rows;
    // The old fields let go of their controllers during this frame.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      for (final row in old) {
        row.dispose();
      }
    });
  }

  /// Marks the form changed and redraws the total.
  void _changed() => setState(() => _dirty = true);

  /// The form's lines that hold an amount, added up in paisa so `0.10` and
  /// `0.20` make `0.30`; `null` when none does.
  String? _total() {
    int? paisa;
    for (final row in _rows) {
      final text = normalizeAmount(row.amount.text);
      if (row.isBlank || !isValidAmount(text)) continue;
      final [whole, ...fraction] = text.split('.');
      final cents = fraction.isEmpty
          ? 0
          : int.parse(fraction.single.padRight(2, '0'));
      paisa = (paisa ?? 0) + int.parse(whole) * 100 + cents;
    }
    if (paisa == null) return null;
    return '${paisa ~/ 100}.${(paisa % 100).toString().padLeft(2, '0')}';
  }

  void _addRow() => setState(() {
    _rows = [..._rows, _Row()];
    _dirty = true;
  });

  void _removeRow(_Row row) {
    setState(() {
      _rows = [
        for (final other in _rows)
          if (!identical(other, row)) other,
      ];
      if (_rows.isEmpty) _rows = [_Row()];
      _dirty = true;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => row.dispose());
  }

  Future<void> _save({required bool submit}) async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final draft = TaxDeclarationDraft(
      items: [
        for (final row in _rows)
          if (!row.isBlank)
            DeclarationDraftItem(
              kind: row.kind!,
              declared: normalizeAmount(row.amount.text),
              note: row.note.text.trim().isEmpty ? null : row.note.text.trim(),
            ),
      ],
      submit: submit,
    );

    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    // Still usable if the screen closes before the call returns.
    final container = ProviderScope.containerOf(context, listen: false);
    final fiscalYear = widget.fiscalYear;
    setState(() {
      _saving = submit ? _Saving.submit : _Saving.draft;
      _error = null;
    });
    try {
      final saved = await container
          .read(authProvider.notifier)
          .saveMyTaxDeclaration(fiscalYear, draft);
      messenger.showSnackBar(
        SnackBar(
          content: Text(submit ? l10n.declarationSent : l10n.declarationSaved),
        ),
      );
      if (mounted) {
        setState(() {
          _saved = saved;
          _dirty = false;
          _replaceRows(_rowsOf(saved));
        });
      }
      // The year's figures may change with it.
      container.invalidate(myTaxYearProvider(fiscalYear));
    } on SessionExpiredException {
      // AuthGate is already showing the login screen.
    } on Object catch (error) {
      if (mounted) setState(() => _error = error);
      // Verified meanwhile: reload, and the form gives way to the verified
      // declaration, so the message goes in a snack bar too.
      if (error is ApiException && error.code == 'declaration_verified') {
        if (mounted) setState(() => _dirty = false);
        container.invalidate(myTaxYearProvider(fiscalYear));
        messenger.showSnackBar(
          SnackBar(content: Text(l10n.declarationErrorVerified)),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final declaration = _declaration;
    final secondary = theme.textTheme.bodySmall?.copyWith(
      color: scheme.onSurfaceVariant,
    );

    return Card.outlined(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 12,
          children: [
            CardHeading(
              l10n.declarationTitle,
              trailing: switch (declaration.status) {
                final DeclarationStatus status => DeclarationStatusPill(
                  key: DeclarationCard.statusKey,
                  status: status,
                ),
                null => null,
              },
            ),
            Text(l10n.declarationHint, style: theme.textTheme.bodyMedium),
            if (declaration.verifiedAt case final at?)
              Text(
                l10n.declarationVerifiedOn(formatShortDate(l10n, at.toLocal())),
                style: secondary,
              )
            else if (declaration.submittedAt case final at?)
              Text(
                l10n.declarationSubmittedOn(
                  formatShortDate(l10n, at.toLocal()),
                ),
                style: secondary,
              ),
            if (declaration.isVerified)
              _ReadOnly(declaration: declaration)
            else
              _form(context),
          ],
        ),
      ),
    );
  }

  Widget _form(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final error = _error;
    final busy = _saving != null;
    final total = _total();

    Widget progress() => const SizedBox.square(
      dimension: 18,
      child: CircularProgressIndicator(strokeWidth: 2),
    );

    return Form(
      key: _formKey,
      child: Column(
        key: DeclarationCard.formKey,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 12,
        children: [
          for (final (index, row) in _rows.indexed) ...[
            if (index > 0) const Divider(height: 4),
            _RowFields(
              key: ObjectKey(row),
              index: index,
              row: row,
              onChanged: _changed,
              onRemove: busy ? null : () => _removeRow(row),
            ),
          ],
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton.icon(
              key: DeclarationCard.addRowKey,
              onPressed: busy || _rows.length >= DeclarationCard.maxItems
                  ? null
                  : _addRow,
              icon: const Icon(Icons.add),
              label: Text(l10n.declarationAddRow),
            ),
          ),
          if (total != null)
            LeaveFact(
              key: DeclarationCard.totalKey,
              label: l10n.declarationTotal,
              value: formatTaka(l10n, total),
            ),
          if (error != null)
            NoticeCard(
              key: DeclarationCard.errorKey,
              icon: Icons.error_outline,
              message: declarationErrorText(l10n, error),
              details: [
                if (error is ApiException &&
                    error.code != 'declaration_verified')
                  for (final issue in error.issues)
                    if (issue.message.isNotEmpty) issue.message,
              ],
              background: scheme.errorContainer,
              foreground: scheme.onErrorContainer,
            ),
          OverflowBar(
            alignment: MainAxisAlignment.end,
            spacing: 8,
            overflowAlignment: OverflowBarAlignment.end,
            overflowSpacing: 8,
            overflowDirection: VerticalDirection.up,
            children: [
              OutlinedButton.icon(
                key: DeclarationCard.saveDraftKey,
                onPressed: busy ? null : () => _save(submit: false),
                icon: _saving == _Saving.draft
                    ? progress()
                    : const Icon(Icons.save_outlined),
                label: Text(l10n.declarationSaveDraft),
              ),
              FilledButton.icon(
                key: DeclarationCard.submitKey,
                onPressed: busy ? null : () => _save(submit: true),
                icon: _saving == _Saving.submit
                    ? progress()
                    : const Icon(Icons.send_outlined),
                label: Text(l10n.declarationSubmit),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// User-facing text for a declaration the API refused.
String declarationErrorText(AppLocalizations l10n, Object error) {
  if (error is ApiException && error.kind == ApiErrorKind.server) {
    if (error.code == 'declaration_verified') {
      return l10n.declarationErrorVerified;
    }
    if (error.statusCode == 400 && error.issues.isNotEmpty) {
      return l10n.declarationErrorInvalid;
    }
  }
  return describeError(l10n, error);
}

/// The kind, amount and note of one line, with a button to remove it.
class _RowFields extends StatelessWidget {
  const _RowFields({
    super.key,
    required this.index,
    required this.row,
    required this.onChanged,
    required this.onRemove,
  });

  final int index;
  final _Row row;
  final VoidCallback onChanged;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 12,
      children: [
        DropdownButtonFormField<InvestmentKind>(
          key: DeclarationCard.kindFieldKey(index),
          initialValue: row.kind,
          isExpanded: true,
          decoration: InputDecoration(labelText: l10n.declarationKind),
          items: [
            for (final kind in InvestmentKind.declarable)
              DropdownMenuItem(
                value: kind,
                child: Text(
                  l10n.investmentKindName(kind.wire),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
          ],
          onChanged: (kind) {
            row.kind = kind;
            onChanged();
          },
          validator: (kind) => kind == null && !row.isBlank
              ? l10n.declarationKindRequired
              : null,
        ),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: TextFormField(
                key: DeclarationCard.amountFieldKey(index),
                controller: row.amount,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: InputDecoration(
                  labelText: l10n.declarationAmount,
                  prefixText: '৳ ',
                ),
                onChanged: (_) => onChanged(),
                validator: (value) => row.isBlank || isValidAmount(value ?? '')
                    ? null
                    : l10n.declarationAmountInvalid,
              ),
            ),
            const SizedBox(width: 4),
            IconButton(
              key: DeclarationCard.removeRowKey(index),
              tooltip: l10n.declarationRemoveRow,
              onPressed: onRemove,
              icon: const Icon(Icons.delete_outline),
            ),
          ],
        ),
        TextFormField(
          key: DeclarationCard.noteFieldKey(index),
          controller: row.note,
          maxLength: 200,
          textCapitalization: TextCapitalization.sentences,
          decoration: InputDecoration(
            labelText: l10n.declarationNote,
            counterText: '',
          ),
          onChanged: (_) => onChanged(),
        ),
      ],
    );
  }
}

/// A verified declaration: each item as declared and as payroll accepted
/// it, and the totals.
class _ReadOnly extends StatelessWidget {
  const _ReadOnly({required this.declaration});

  final TaxDeclaration declaration;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    String amount(String? value) =>
        value == null ? '—' : formatTaka(l10n, value);

    return Column(
      key: DeclarationCard.readOnlyKey,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 12,
      children: [
        if (declaration.items.isEmpty)
          Text(
            l10n.declarationEmpty,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: scheme.onSurfaceVariant,
            ),
          ),
        for (final (index, item) in declaration.items.indexed) ...[
          if (index > 0) const Divider(height: 1),
          MergeSemantics(
            key: DeclarationCard.itemKey(index),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 4,
              children: [
                Text(
                  l10n.investmentKindName(item.kind.wire),
                  style: theme.textTheme.titleSmall,
                ),
                Wrap(
                  spacing: 32,
                  runSpacing: 8,
                  children: [
                    LeaveFact(
                      label: l10n.declarationDeclared,
                      value: formatTaka(l10n, item.declared),
                    ),
                    LeaveFact(
                      label: l10n.declarationAccepted,
                      value: amount(item.verified),
                    ),
                  ],
                ),
                if (item.note case final note? when note.isNotEmpty)
                  Text(
                    note,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
              ],
            ),
          ),
        ],
        const Divider(height: 4),
        Wrap(
          key: DeclarationCard.totalKey,
          spacing: 32,
          runSpacing: 8,
          children: [
            LeaveFact(
              label: l10n.declarationTotal,
              value: formatTaka(l10n, declaration.declared),
            ),
            LeaveFact(
              label: l10n.declarationAccepted,
              value: amount(declaration.verified),
            ),
          ],
        ),
      ],
    );
  }
}
