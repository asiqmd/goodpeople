part of 'api_models.dart';

// ── Payroll (Phase 2): my salary tax, provident fund and loans ──────────────
//
// Like payslips, these need the workspace's `payroll` feature. Money is the
// API's decimal string (see [_readMoney]); the tax working's figures are
// whole taka as JSON numbers.

/// A Bangladesh income year, July to June, as the API spells it: `2026-27`
/// for 1 July 2026 to 30 June 2027.
String fiscalYearOf(DateTime date) {
  final start = date.month >= 7 ? date.year : date.year - 1;
  return '$start-${((start + 1) % 100).toString().padLeft(2, '0')}';
}

/// The income year before [fiscalYear], for example `2025-26` before
/// `2026-27`.
String previousFiscalYear(String fiscalYear) {
  final start = int.parse(fiscalYear.substring(0, 4)) - 1;
  return '$start-${((start + 1) % 100).toString().padLeft(2, '0')}';
}

/// Where an investment declaration stands.
enum DeclarationStatus implements WireValue {
  draft('draft'),
  submitted('submitted'),
  verified('verified'),
  unknown('unknown');

  const DeclarationStatus(this.wire);
  @override
  final String wire;

  static DeclarationStatus fromWire(String value) =>
      _byWire(values, value, unknown);
}

/// The investments and donations that earn a tax rebate.
enum InvestmentKind implements WireValue {
  savingsCertificate('savings_certificate'),
  dps('dps'),
  lifeInsurance('life_insurance'),
  providentFundOther('provident_fund_other'),
  superannuation('superannuation'),
  universalPension('universal_pension'),
  listedShares('listed_shares'),
  mutualFund('mutual_fund'),
  zakat('zakat'),
  donation('donation'),
  other('other'),
  unknown('unknown');

  const InvestmentKind(this.wire);
  @override
  final String wire;

  static InvestmentKind fromWire(String value) =>
      _byWire(values, value, unknown);

  /// The kinds an employee can declare, in the order the form offers them.
  static List<InvestmentKind> get declarable => [
    for (final kind in values)
      if (kind != unknown) kind,
  ];
}

/// One line of an investment declaration.
class DeclarationItem {
  const DeclarationItem({
    required this.kind,
    required this.declared,
    this.verified,
    this.note,
    this.documentId,
  });

  factory DeclarationItem.fromJson(Json json) => DeclarationItem(
    kind: InvestmentKind.fromWire(_read<String>(json, 'kind')),
    declared: _readMoney(json, 'declared'),
    verified: json['verified'] == null ? null : _readMoney(json, 'verified'),
    note: _read<String?>(json, 'note'),
    documentId: _read<String?>(json, 'documentId'),
  );

  final InvestmentKind kind;

  /// What the employee says they invested.
  final String declared;

  /// What payroll accepted after checking the proofs; `null` until then.
  final String? verified;
  final String? note;
  final String? documentId;
}

/// `TaxDeclarationView`: an employee's investments for an income year.
class TaxDeclaration {
  const TaxDeclaration({
    required this.employee,
    required this.fiscalYear,
    required this.items,
    required this.declared,
    this.id,
    this.status,
    this.verified,
    this.submittedAt,
    this.verifiedAt,
  });

  factory TaxDeclaration.fromJson(Json json) => TaxDeclaration(
    id: _read<String?>(json, 'id'),
    employee: EmployeeRef.fromJson(_read<Json>(json, 'employee')),
    fiscalYear: _read<String>(json, 'fiscalYear'),
    status: _readOptionalWire(json, 'status', DeclarationStatus.fromWire),
    items: _readList(json, 'items', DeclarationItem.fromJson),
    declared: _readMoney(json, 'declared'),
    verified: json['verified'] == null ? null : _readMoney(json, 'verified'),
    submittedAt: _readOptionalTimestamp(json, 'submittedAt'),
    verifiedAt: _readOptionalTimestamp(json, 'verifiedAt'),
  );

  /// `null` while nothing has been saved for the year.
  final String? id;
  final EmployeeRef employee;
  final String fiscalYear;

  /// `null` while nothing has been saved for the year.
  final DeclarationStatus? status;
  final List<DeclarationItem> items;

  /// The items' total.
  final String declared;

  /// What payroll accepted in all; `null` until it verifies.
  final String? verified;
  final DateTime? submittedAt;
  final DateTime? verifiedAt;

  /// Payroll has checked it, so the employee can no longer change it.
  bool get isVerified => status == DeclarationStatus.verified;
}

/// One line of the declaration the employee sends.
class DeclarationDraftItem {
  const DeclarationDraftItem({
    required this.kind,
    required this.declared,
    this.note,
  });

  final InvestmentKind kind;

  /// An amount such as `100000` or `12500.50`.
  final String declared;
  final String? note;

  Json toJson() => {
    'kind': kind.wire,
    'declared': declared,
    if (note case final note? when note.isNotEmpty) 'note': note,
  };
}

/// `PUT /tenant/me/tax/declaration` body: the whole declaration, kept as a
/// draft or, with [submit], sent to payroll.
class TaxDeclarationDraft {
  const TaxDeclarationDraft({required this.items, required this.submit});

  final List<DeclarationDraftItem> items;
  final bool submit;

  Json toJson() => {
    'items': [for (final item in items) item.toJson()],
    'submit': submit,
  };
}

/// The employee's tax profile: what changes their tax-free threshold.
class TaxProfile {
  const TaxProfile({
    required this.disabled,
    required this.freedomFighter,
    required this.disabledDependants,
    this.area,
  });

  factory TaxProfile.fromJson(Json json) => TaxProfile(
    disabled: _read<bool>(json, 'disabled'),
    freedomFighter: _read<bool>(json, 'freedomFighter'),
    disabledDependants: _read<int>(json, 'disabledDependants'),
    area: _read<String?>(json, 'area'),
  );

  final bool disabled;
  final bool freedomFighter;
  final int disabledDependants;
  final String? area;
}

/// A locked payroll run of the year that paid the employee: its salary and
/// the tax deducted from it.
class TaxMonth {
  const TaxMonth({
    required this.month,
    required this.periodEnd,
    required this.runId,
    required this.kind,
    required this.salary,
    required this.tax,
    this.challanNo,
    this.depositedOn,
  });

  factory TaxMonth.fromJson(Json json) => TaxMonth(
    month: _readDate(json, 'month'),
    periodEnd: _readDate(json, 'periodEnd'),
    runId: _read<String>(json, 'runId'),
    kind: PayrollRunKind.fromWire(_read<String>(json, 'kind')),
    salary: _readMoney(json, 'salary'),
    tax: _readMoney(json, 'tax'),
    challanNo: _read<String?>(json, 'challanNo'),
    depositedOn: _readOptionalDate(json, 'depositedOn'),
  );

  /// The run's first day.
  final DateTime month;
  final DateTime periodEnd;
  final String runId;
  final PayrollRunKind kind;
  final String salary;
  final String tax;

  /// The treasury challan the tax was deposited with, once it was.
  final String? challanNo;
  final DateTime? depositedOn;
}

/// Salary and tax from before the employee joined in the year, for example
/// from an earlier employer.
class TaxOpening {
  const TaxOpening({required this.salary, required this.tax, required this.pf});

  factory TaxOpening.fromJson(Json json) => TaxOpening(
    salary: _readMoney(json, 'salary'),
    tax: _readMoney(json, 'tax'),
    pf: _readMoney(json, 'pf'),
  );

  final String salary;
  final String tax;
  final String pf;
}

/// The year's tax as the latest run worked it out (`RunTaxWorking`). The
/// figures are whole taka, except [deductedBefore] and [thisMonth].
class TaxWorking {
  const TaxWorking({
    required this.salary,
    required this.exemption,
    required this.taxableIncome,
    required this.threshold,
    required this.grossTax,
    required this.investment,
    required this.rebate,
    required this.minimumTax,
    required this.tax,
    required this.deductedBefore,
    required this.monthsLeft,
    required this.thisMonth,
  });

  factory TaxWorking.fromJson(Json json) => TaxWorking(
    salary: _read<num>(json, 'salary'),
    exemption: _read<num>(json, 'exemption'),
    taxableIncome: _read<num>(json, 'taxableIncome'),
    threshold: _read<num>(json, 'threshold'),
    grossTax: _read<num>(json, 'grossTax'),
    investment: _read<num>(json, 'investment'),
    rebate: _read<num>(json, 'rebate'),
    minimumTax: _read<num>(json, 'minimumTax'),
    tax: _read<num>(json, 'tax'),
    deductedBefore: _readMoney(json, 'deductedBefore'),
    monthsLeft: _read<int>(json, 'monthsLeft'),
    thisMonth: _readMoney(json, 'thisMonth'),
  );

  /// The year's salary income, projected to June.
  final num salary;
  final num exemption;
  final num taxableIncome;

  /// The tax-free threshold for this employee.
  final num threshold;
  final num grossTax;
  final num investment;
  final num rebate;
  final num minimumTax;

  /// The year's tax.
  final num tax;
  final String deductedBefore;

  /// This month and the months after it in the year.
  final int monthsLeft;

  /// Deducted from this month's salary.
  final String thisMonth;
}

/// `GET /tenant/me/tax` 200 response (`TaxYearView`): the employee's
/// salary and tax for an income year, month by month, with the year's
/// working and their investment declaration.
class TaxYearView {
  const TaxYearView({
    required this.fiscalYear,
    required this.employee,
    required this.profile,
    required this.months,
    required this.salary,
    required this.tax,
    required this.declaration,
    this.tin,
    this.opening,
    this.latest,
  });

  factory TaxYearView.fromJson(Json json) {
    final employee = _read<Json>(json, 'employee');
    return TaxYearView(
      fiscalYear: _read<String>(json, 'fiscalYear'),
      employee: EmployeeRef.fromJson(employee),
      tin: _read<String?>(employee, 'tin'),
      profile: TaxProfile.fromJson(_read<Json>(json, 'profile')),
      months: _readList(json, 'months', TaxMonth.fromJson),
      opening: _readOptional(json, 'opening', TaxOpening.fromJson),
      salary: _readMoney(json, 'salary'),
      tax: _readMoney(json, 'tax'),
      latest: _readOptional(json, 'latest', TaxWorking.fromJson),
      declaration: TaxDeclaration.fromJson(_read<Json>(json, 'declaration')),
    );
  }

  final String fiscalYear;
  final EmployeeRef employee;

  /// The employee's e-TIN, when HR has it.
  final String? tin;
  final TaxProfile profile;
  final List<TaxMonth> months;
  final TaxOpening? opening;

  /// Salary paid in the year so far, [opening] included.
  final String salary;

  /// Tax deducted in the year so far, [opening] included.
  final String tax;

  /// `null` until a run of the year has worked the tax out.
  final TaxWorking? latest;
  final TaxDeclaration declaration;
}

// ── Provident fund ──────────────────────────────────────────────────────────

/// What moved money in or out of a provident fund account.
enum PfEntryKind implements WireValue {
  opening('opening'),
  contribution('contribution'),
  interest('interest'),
  loanOut('loan_out'),
  loanRepaid('loan_repaid'),
  withdrawal('withdrawal'),
  forfeited('forfeited'),
  unknown('unknown');

  const PfEntryKind(this.wire);
  @override
  final String wire;

  static PfEntryKind fromWire(String value) => _byWire(values, value, unknown);
}

/// The member's own account, or the employer's contributions for them.
enum PfAccount implements WireValue {
  own('own'),
  employer('employer'),
  unknown('unknown');

  const PfAccount(this.wire);
  @override
  final String wire;

  static PfAccount fromWire(String value) => _byWire(values, value, unknown);
}

class PfBalance {
  const PfBalance({
    required this.own,
    required this.employer,
    required this.total,
    required this.vestedPercent,
    required this.payable,
  });

  factory PfBalance.fromJson(Json json) => PfBalance(
    own: _readMoney(json, 'own'),
    employer: _readMoney(json, 'employer'),
    total: _readMoney(json, 'total'),
    vestedPercent: _read<num>(json, 'vestedPercent'),
    payable: _readMoney(json, 'payable'),
  );

  final String own;
  final String employer;
  final String total;

  /// The share of the employer's account the member would take on leaving
  /// today, for example `50`.
  final num vestedPercent;

  /// What a leaver would take today: [own] and the vested share of
  /// [employer].
  final String payable;
}

class PfEntry {
  const PfEntry({
    required this.id,
    required this.date,
    required this.kind,
    required this.account,
    required this.amount,
    this.runId,
    this.note,
  });

  factory PfEntry.fromJson(Json json) => PfEntry(
    id: _read<String>(json, 'id'),
    date: _readDate(json, 'date'),
    kind: PfEntryKind.fromWire(_read<String>(json, 'kind')),
    account: PfAccount.fromWire(_read<String>(json, 'account')),
    amount: _readMoney(json, 'amount'),
    runId: _read<String?>(json, 'runId'),
    note: _read<String?>(json, 'note'),
  );

  final String id;
  final DateTime date;
  final PfEntryKind kind;
  final PfAccount account;

  /// Signed: negative for money out, such as a withdrawal.
  final String amount;
  final String? runId;
  final String? note;

  bool get isOut => amount.startsWith('-');
}

/// `GET /tenant/me/pf` 200 response for a member (`PfStatement`).
class PfStatement {
  const PfStatement({
    required this.employee,
    required this.joinedOn,
    required this.balance,
    required this.entries,
    this.leftOn,
  });

  factory PfStatement.fromJson(Json json) => PfStatement(
    employee: EmployeeRef.fromJson(_read<Json>(json, 'employee')),
    joinedOn: _readDate(json, 'joinedOn'),
    leftOn: _readOptionalDate(json, 'leftOn'),
    balance: PfBalance.fromJson(_read<Json>(json, 'balance')),
    entries: _readList(json, 'entries', PfEntry.fromJson),
  );

  final EmployeeRef employee;
  final DateTime joinedOn;
  final DateTime? leftOn;
  final PfBalance balance;
  final List<PfEntry> entries;
}

// ── Advances and loans ──────────────────────────────────────────────────────

enum LoanKind implements WireValue {
  advance('advance'),
  loan('loan'),
  pfLoan('pf_loan'),
  unknown('unknown');

  const LoanKind(this.wire);
  @override
  final String wire;

  static LoanKind fromWire(String value) => _byWire(values, value, unknown);
}

enum LoanStatus implements WireValue {
  pending('pending'),
  active('active'),
  closed('closed'),
  rejected('rejected'),
  cancelled('cancelled'),
  unknown('unknown');

  const LoanStatus(this.wire);
  @override
  final String wire;

  static LoanStatus fromWire(String value) => _byWire(values, value, unknown);
}

class LoanRepayment {
  const LoanRepayment({
    required this.date,
    required this.amount,
    this.runId,
    this.note,
  });

  factory LoanRepayment.fromJson(Json json) => LoanRepayment(
    date: _readDate(json, 'date'),
    amount: _readMoney(json, 'amount'),
    runId: _read<String?>(json, 'runId'),
    note: _read<String?>(json, 'note'),
  );

  final DateTime date;
  final String amount;

  /// The run it was deducted in; `null` when paid in directly.
  final String? runId;
  final String? note;

  bool get fromSalary => runId != null;
}

/// `GET /tenant/me/loans` item (`LoanView`): a salary advance or a loan,
/// recovered from salary in monthly instalments.
class LoanView {
  const LoanView({
    required this.id,
    required this.employee,
    required this.kind,
    required this.status,
    required this.principal,
    required this.installment,
    required this.repaid,
    required this.outstanding,
    required this.startMonth,
    required this.reason,
    required this.createdAt,
    required this.repayments,
    this.decidedAt,
    this.closedAt,
  });

  factory LoanView.fromJson(Json json) => LoanView(
    id: _read<String>(json, 'id'),
    employee: EmployeeRef.fromJson(_read<Json>(json, 'employee')),
    kind: LoanKind.fromWire(_read<String>(json, 'kind')),
    status: LoanStatus.fromWire(_read<String>(json, 'status')),
    principal: _readMoney(json, 'principal'),
    installment: _readMoney(json, 'installment'),
    repaid: _readMoney(json, 'repaid'),
    outstanding: _readMoney(json, 'outstanding'),
    startMonth: _readMonth(json, 'startMonth'),
    reason: _read<String>(json, 'reason'),
    createdAt: _readTimestamp(json, 'createdAt'),
    decidedAt: _readOptionalTimestamp(json, 'decidedAt'),
    closedAt: _readOptionalTimestamp(json, 'closedAt'),
    repayments: _readList(json, 'repayments', LoanRepayment.fromJson),
  );

  final String id;
  final EmployeeRef employee;
  final LoanKind kind;
  final LoanStatus status;
  final String principal;

  /// Deducted from each month's salary.
  final String installment;
  final String repaid;
  final String outstanding;

  /// The first month recovered, as UTC midnight on its first day.
  final DateTime startMonth;
  final String reason;
  final DateTime createdAt;
  final DateTime? decidedAt;
  final DateTime? closedAt;
  final List<LoanRepayment> repayments;
}

final _yearMonth = RegExp(r'^(\d{4})-(\d{2})$');

/// A `YYYY-MM` month as UTC midnight on its first day.
DateTime _readMonth(Json json, String key) {
  final text = _read<String>(json, key);
  final match = _yearMonth.firstMatch(text);
  if (match != null) {
    final month = int.parse(match[2]!);
    if (month >= 1 && month <= 12) {
      return DateTime.utc(int.parse(match[1]!), month);
    }
  }
  throw FormatException('Expected "$key" to be a YYYY-MM month: $text');
}
