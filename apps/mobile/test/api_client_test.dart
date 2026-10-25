import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:good_people/api/api_exception.dart';
import 'package:good_people/api/api_models.dart';
import 'package:good_people/api/good_people_api.dart';

import 'support/fake_api.dart';

/// Answers every request with [status] and [body] and records the request.
class _StubAdapter implements HttpClientAdapter {
  _StubAdapter(this.status, this.body);

  final int status;
  final Object? body;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

/// Answers every request with [status], the raw [bytes] and [headers], as
/// a file download does, and records the request.
class _FileAdapter implements HttpClientAdapter {
  _FileAdapter(this.status, this.bytes, this.headers);

  final int status;
  final List<int> bytes;
  final Map<String, List<String>> headers;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return ResponseBody.fromBytes(bytes, status, headers: headers);
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  (DioGoodPeopleApi, _StubAdapter) client(int status, Object? body) {
    final adapter = _StubAdapter(status, body);
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost:4000'))
      ..httpClientAdapter = adapter;
    return (DioGoodPeopleApi(dio), adapter);
  }

  /// The app's real client setup (JSON by default) with a file answer.
  (DioGoodPeopleApi, _FileAdapter) fileClient(
    int status,
    List<int> bytes, {
    Map<String, List<String>> headers = const {},
  }) {
    final adapter = _FileAdapter(status, bytes, headers);
    final dio = Dio(
      BaseOptions(
        baseUrl: 'http://localhost:4000',
        contentType: Headers.jsonContentType,
        responseType: ResponseType.json,
        headers: const {'Accept': 'application/json'},
      ),
    )..httpClientAdapter = adapter;
    return (DioGoodPeopleApi(dio), adapter);
  }

  test('login posts the contract body and parses the response', () async {
    final (api, adapter) = client(200, loginJson);

    final response = await api.login(
      tenant: 'acme',
      email: 'rahima@acme.test',
      password: 'secret',
    ) as LoginResponse;

    final request = adapter.requests.single;
    expect(request.method, 'POST');
    expect(request.uri.toString(), 'http://localhost:4000/auth/login');
    expect(request.data, {
      'tenant': 'acme',
      'email': 'rahima@acme.test',
      'password': 'secret',
    });
    expect(response.tokens.accessToken, 'access-1');
    expect(response.tokens.expiresIn, 900);
    expect(response.user.role, UserRole.tenantAdmin);
    expect(response.tenant.slug, 'acme');
  });

  test('tenant access sends the bearer token and allows null limits', () async {
    final (api, adapter) = client(200, accessJson(accessState: 'read_only'));

    final view = await api.getTenantAccess('access-1');

    expect(adapter.requests.single.uri.path, '/tenant/access');
    expect(adapter.requests.single.headers['Authorization'], 'Bearer access-1');
    expect(view.access.accessState, AccessState.readOnly);
    expect(view.tenant.billingMode, BillingMode.trial);
    expect(view.tenant.planCode, PlanCode.growth);
    expect(view.access.limits.maxEmployees, 50);
    expect(view.access.limits.smsCreditsMonthly, isNull);
    expect(view.access.hasFeature('payroll'), isTrue);
  });

  test('my employee sends the bearer token and parses the detail', () async {
    final (api, adapter) = client(200, employeeJson());

    final employee = await api.fetchMyEmployee('access-1');

    expect(adapter.requests.single.method, 'GET');
    expect(adapter.requests.single.uri.path, '/tenant/me/employee');
    expect(adapter.requests.single.headers['Authorization'], 'Bearer access-1');
    expect(employee.employeeCode, 'MG-0005');
    expect(employee.fullNameBn, 'রহিমা খাতুন');
    expect(employee.dateOfBirth, DateTime.utc(1996, 4, 8));
    expect(employee.gender, Gender.female);
    expect(employee.bloodGroup, BloodGroup.bPositive);
    expect(employee.presentAddress.division, Division.dhaka);
    expect(employee.presentAddress.postcode, isNull);
    expect(employee.permanentAddress.postcode, '2200');
    expect(employee.identity.nid, '1996000005');
    expect(employee.identity.passport, isNull);
    expect(employee.probationEndsOn, isNull);
    final job = employee.currentJob!;
    expect(job.employmentType, EmploymentType.permanent);
    expect(job.workerCategory, WorkerCategory.worker);
    expect(job.manager?.employeeCode, 'MG-0004');
    expect(employee.nominees.single.sharePercent, 100);
    expect(employee.paymentAccounts.first.method, PaymentMethod.mfs);
    expect(employee.paymentAccounts.first.isPrimary, isTrue);
    expect(employee.portalUser?.role, UserRole.employee);
  });

  test('my employee tolerates nulls and unknown enum values', () async {
    final body = employeeJson()
      ..['gender'] = 'not_yet_known'
      ..['religion'] = null
      ..['bloodGroup'] = null
      ..['emergencyContact'] = null
      ..['portalUser'] = null
      ..['currentJob'] = {
        ...jobJson(),
        'event': 'secondment',
        'location': null,
        'orgUnit': null,
        'designation': null,
        'grade': null,
        'costCentre': null,
        'manager': null,
        'reason': null,
        'employmentType': 'gig',
        'workerCategory': 'contractor',
      };
    final (api, _) = client(200, body);

    final employee = await api.fetchMyEmployee('access-1');

    expect(employee.gender, Gender.unknown);
    expect(employee.religion, isNull);
    expect(employee.bloodGroup, isNull);
    expect(employee.emergencyContact, isNull);
    expect(employee.portalUser, isNull);
    final job = employee.currentJob!;
    expect(job.legalEntity.name, 'My Group Textiles Ltd');
    expect(job.event, JobEvent.unknown);
    expect(job.location, isNull);
    expect(job.manager, isNull);
    expect(job.employmentType, EmploymentType.unknown);
    expect(job.workerCategory, WorkerCategory.unknown);

    final (noJobApi, _) = client(200, employeeJson()..['currentJob'] = null);
    expect((await noJobApi.fetchMyEmployee('access-1')).currentJob, isNull);
  });

  test('my employee rejects a malformed date as a badResponse', () async {
    final (api, _) = client(200, employeeJson()..['joinedOn'] = '2020-02-30');

    await expectLater(
      api.fetchMyEmployee('access-1'),
      throwsA(
        isA<ApiException>().having(
          (e) => e.kind,
          'kind',
          ApiErrorKind.badResponse,
        ),
      ),
    );
  });

  test('error bodies become ApiException with message and issues', () async {
    final (api, _) = client(400, {
      'statusCode': 400,
      'error': 'Bad Request',
      'message': 'Validation failed',
      'issues': [
        {'path': 'email', 'message': 'Invalid email'},
      ],
    });

    await expectLater(
      api.login(tenant: 'acme', email: 'nope', password: 'x'),
      throwsA(
        isA<ApiException>()
            .having((e) => e.statusCode, 'statusCode', 400)
            .having((e) => e.message, 'message', 'Validation failed')
            .having((e) => e.issues.single.path, 'issue path', 'email'),
      ),
    );
  });

  test('a 401 is reported as unauthorized with the API message', () async {
    final (api, _) = client(401, {
      'statusCode': 401,
      'error': 'Unauthorized',
      'message': 'Wrong workspace, email or password',
    });

    await expectLater(
      api.login(tenant: 'acme', email: 'a@acme.test', password: 'x'),
      throwsA(
        isA<ApiException>()
            .having((e) => e.isUnauthorized, 'isUnauthorized', isTrue)
            .having(
              (e) => e.message,
              'message',
              'Wrong workspace, email or password',
            ),
      ),
    );
  });

  group('leave', () {
    test(
      'balances send the year and parse halves and per-event leave',
      () async {
        final body = [
          ...balancesJson(2026),
          balanceJson({...casualLeaveJson, 'accrual': 'lifetime'}),
        ];
        final (api, adapter) = client(200, body);

        final balances = await api.fetchMyLeaveBalances('access-1', year: 2026);

        final request = adapter.requests.single;
        expect(request.method, 'GET');
        expect(request.uri.path, '/tenant/me/leave/balances');
        expect(request.uri.queryParameters, {'year': '2026'});
        expect(request.headers['Authorization'], 'Bearer access-1');

        final casual = balances.first;
        expect(casual.leaveType.code, 'CL');
        expect(casual.leaveType.nameBn, 'নৈমিত্তিক ছুটি');
        expect(casual.leaveType.accrual, LeaveAccrual.annualGrant);
        expect(casual.leaveType.paid, isTrue);
        expect(casual.year, 2026);
        expect(casual.entitlement, 10);
        expect(casual.taken, 1.5);
        expect(casual.available, 8.5);
        expect(casual.isOnRequest, isFalse);
        expect(casual.eligibleFrom, isNull);
        expect(balances[2].carriedForward, 4);
        expect(balances[2].eligibleFrom, DateTime.utc(2027, 3, 1));

        final maternity = balances[3];
        expect(maternity.leaveType.accrual, LeaveAccrual.perEvent);
        expect(maternity.entitlement, isNull);
        expect(maternity.available, isNull);
        expect(maternity.isOnRequest, isTrue);

        expect(balances.last.leaveType.accrual, LeaveAccrual.unknown);
      },
    );

    test('leave types parse gender, half days and unknown values', () async {
      final (api, adapter) = client(200, [
        ...leaveTypesJson(),
        leaveTypeJson(
          id: 'x',
          code: 'X',
          name: 'Future leave',
          accrual: 'monthly',
          gender: 'other',
        ),
      ]);

      final types = await api.fetchLeaveTypes('access-1');

      expect(adapter.requests.single.uri.path, '/tenant/leave/types');
      expect(
        adapter.requests.single.headers['Authorization'],
        'Bearer access-1',
      );
      final byCode = {for (final type in types) type.code: type};
      expect(byCode['CL']!.allowHalfDay, isTrue);
      expect(byCode['CL']!.gender, isNull);
      expect(byCode['SL']!.requiresDocumentAfterDays, 2);
      expect(byCode['ML']!.gender, Gender.female);
      expect(byCode['ML']!.countsOffDays, isTrue);
      expect(byCode['ML']!.allowHalfDay, isFalse);
      expect(byCode['ML']!.maxDaysPerRequest, 112);
      expect(byCode['PL']!.gender, Gender.male);
      expect(byCode['OL']!.isActive, isFalse);
      expect(byCode['X']!.accrual, LeaveAccrual.unknown);
      expect(byCode['X']!.gender, Gender.unknown);
    });

    test(
      'preview posts the draft and parses excluded days and problems',
      () async {
        final (api, adapter) = client(201, {
          'days': 2,
          'excluded': [
            {'date': '2027-02-05', 'reason': 'weekly_off'},
            {
              'date': '2027-02-21',
              'reason': 'holiday',
              'name': 'Language Martyrs’ Day',
            },
            {'date': '2027-02-22', 'reason': 'eclipse'},
          ],
          'balance': balanceJson(casualLeaveJson, year: 2027, available: 1),
          'problems': ['Only 1 days available.'],
        });

        final preview = await api.previewLeave(
          'access-1',
          LeaveDraft(
            leaveTypeId: casualLeaveId,
            startDate: DateTime.utc(2027, 2, 4),
            endDate: DateTime.utc(2027, 2, 22),
          ),
        );

        final request = adapter.requests.single;
        expect(request.method, 'POST');
        expect(request.uri.path, '/tenant/me/leave/preview');
        expect(request.headers['Authorization'], 'Bearer access-1');
        expect(request.data, {
          'leaveTypeId': casualLeaveId,
          'startDate': '2027-02-04',
          'endDate': '2027-02-22',
          'halfDay': null,
        });
        expect(preview.days, 2);
        expect(preview.excluded.first.date, DateTime.utc(2027, 2, 5));
        expect(preview.excluded.first.reason, ExcludedDayReason.weeklyOff);
        expect(preview.excluded.first.name, isNull);
        expect(preview.excluded[1].reason, ExcludedDayReason.holiday);
        expect(preview.excluded[1].name, 'Language Martyrs’ Day');
        expect(preview.excluded[2].reason, ExcludedDayReason.unknown);
        expect(preview.balance?.year, 2027);
        expect(preview.balance?.available, 1);
        expect(preview.problems, ['Only 1 days available.']);
        expect(preview.canSubmit, isFalse);

        final (okApi, _) = client(201, {
          'days': 0.5,
          'excluded': <Object?>[],
          'balance': null,
          'problems': <Object?>[],
        });
        final ok = await okApi.previewLeave(
          'access-1',
          LeaveDraft(
            leaveTypeId: casualLeaveId,
            startDate: DateTime.utc(2027, 2, 4),
            endDate: DateTime.utc(2027, 2, 4),
            halfDay: HalfDay.firstHalf,
          ),
        );
        expect(ok.days, 0.5);
        expect(ok.balance, isNull);
        expect(ok.canSubmit, isTrue);
      },
    );

    test('apply posts the body, with halfDay only for a half day', () async {
      final (api, adapter) = client(
        201,
        leaveRequestJson(
          id: pendingRequestId,
          type: casualLeaveJson,
          startDate: '2026-11-02',
          endDate: '2026-11-02',
          halfDay: 'second_half',
          days: 0.5,
          reason: 'Doctor',
        ),
      );

      final created = await api.applyForLeave(
        'access-1',
        LeaveDraft(
          leaveTypeId: casualLeaveId,
          startDate: DateTime.utc(2026, 11, 2),
          endDate: DateTime.utc(2026, 11, 2),
          halfDay: HalfDay.secondHalf,
        ),
        reason: 'Doctor',
      );
      await api.applyForLeave(
        'access-1',
        LeaveDraft(
          leaveTypeId: casualLeaveId,
          startDate: DateTime.utc(2026, 11, 2),
          endDate: DateTime.utc(2026, 11, 3),
        ),
        reason: 'Wedding',
      );

      final (half, full) = (adapter.requests.first, adapter.requests.last);
      expect(half.method, 'POST');
      expect(half.uri.path, '/tenant/me/leave/requests');
      expect(half.headers['Authorization'], 'Bearer access-1');
      expect(half.data, {
        'leaveTypeId': casualLeaveId,
        'startDate': '2026-11-02',
        'endDate': '2026-11-02',
        'halfDay': 'second_half',
        'reason': 'Doctor',
      });
      expect(full.data, {
        'leaveTypeId': casualLeaveId,
        'startDate': '2026-11-02',
        'endDate': '2026-11-03',
        'reason': 'Wedding',
      });

      expect(created.id, pendingRequestId);
      expect(created.employee.employeeCode, 'MG-0005');
      expect(created.leaveType.nameBn, 'নৈমিত্তিক ছুটি');
      expect(created.startDate, DateTime.utc(2026, 11, 2));
      expect(created.halfDay, HalfDay.secondHalf);
      expect(created.days, 0.5);
      expect(created.status, LeaveRequestStatus.pending);
      expect(created.needsDocument, isFalse);
      expect(created.steps.map((s) => s.kind), [
        ApprovalStepKind.manager,
        ApprovalStepKind.hr,
      ]);
      expect(created.steps.first.approver?.fullName, 'Shirin Akter');
      expect(created.steps.first.status, ApprovalStatus.pending);
      expect(created.steps.last.approver, isNull);
      expect(created.steps.last.status, ApprovalStatus.waiting);
      expect(created.createdAt, DateTime.utc(2026, 10, 20, 8));
      expect(created.decidedAt, isNull);
    });

    test('a refused request carries the leave_not_allowed code', () async {
      final (api, _) = client(400, {
        'statusCode': 400,
        'error': 'Bad Request',
        'message': 'Only 1 days available. This overlaps another request.',
        'code': 'leave_not_allowed',
      });

      await expectLater(
        api.applyForLeave(
          'access-1',
          LeaveDraft(
            leaveTypeId: casualLeaveId,
            startDate: DateTime.utc(2026, 11, 2),
            endDate: DateTime.utc(2026, 11, 3),
          ),
          reason: 'Wedding',
        ),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'statusCode', 400)
              .having((e) => e.code, 'code', 'leave_not_allowed')
              .having(
                (e) => e.message,
                'message',
                'Only 1 days available. This overlaps another request.',
              ),
        ),
      );
    });

    test(
      'my requests send the year when given and tolerate unknown values',
      () async {
        final body = [
          myRequestsJson().first,
          leaveRequestJson(
            id: 'future-shape',
            type: casualLeaveJson,
            startDate: '2026-11-02',
            endDate: '2026-11-02',
            halfDay: 'evening',
            days: 1,
            status: 'withdrawn',
            steps: [
              stepJson(
                id: 'step',
                stepNo: 1,
                kind: 'director',
                status: 'escalated',
              ),
            ],
          ),
        ];
        final (api, adapter) = client(200, body);

        final requests = await api.fetchMyLeaveRequests('access-1', year: 2026);
        await api.fetchMyLeaveRequests('access-1');

        expect(adapter.requests.first.uri.path, '/tenant/me/leave/requests');
        expect(adapter.requests.first.uri.queryParameters, {'year': '2026'});
        expect(adapter.requests.last.uri.queryParameters, isEmpty);

        final approved = requests.first;
        expect(approved.status, LeaveRequestStatus.approved);
        expect(approved.days, 4);
        expect(approved.steps.first.decidedBy, 'Shirin Akter');
        expect(approved.steps.first.decidedAt, DateTime.utc(2026, 10, 21, 4));
        expect(approved.decidedAt, DateTime.utc(2026, 10, 22, 5));
        expect(approved.canCancelOn(DateTime.utc(2026, 10, 24)), isTrue);
        expect(approved.canCancelOn(DateTime.utc(2026, 12, 20)), isFalse);

        final unknown = requests.last;
        expect(unknown.status, LeaveRequestStatus.unknown);
        expect(unknown.halfDay, HalfDay.unknown);
        expect(unknown.steps.single.kind, ApprovalStepKind.unknown);
        expect(unknown.steps.single.status, ApprovalStatus.unknown);
        expect(unknown.canCancelOn(DateTime.utc(2026, 10, 24)), isFalse);
      },
    );

    test('cancel posts to the request; a 409 keeps the API message', () async {
      final (api, adapter) = client(
        201,
        leaveRequestJson(
          id: pendingRequestId,
          type: casualLeaveJson,
          startDate: '2026-11-02',
          endDate: '2026-11-03',
          days: 2,
          status: 'cancelled',
        ),
      );

      final cancelled = await api.cancelLeaveRequest(
        'access-1',
        pendingRequestId,
      );

      final request = adapter.requests.single;
      expect(request.method, 'POST');
      expect(
        request.uri.path,
        '/tenant/leave/requests/$pendingRequestId/cancel',
      );
      expect(request.headers['Authorization'], 'Bearer access-1');
      expect(cancelled.status, LeaveRequestStatus.cancelled);

      final (refusing, _) = client(409, {
        'statusCode': 409,
        'error': 'Conflict',
        'message': 'This request is already rejected',
      });
      await expectLater(
        refusing.cancelLeaveRequest('access-1', rejectedRequestId),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'statusCode', 409)
              .having((e) => e.code, 'code', isNull)
              .having(
                (e) => e.message,
                'message',
                'This request is already rejected',
              ),
        ),
      );
    });

    test('approvals parse the request and the requester balance', () async {
      final (api, adapter) = client(200, approvalsJson());

      final items = await api.fetchApprovals('access-1');

      expect(adapter.requests.single.uri.path, '/tenant/approvals');
      expect(
        adapter.requests.single.headers['Authorization'],
        'Bearer access-1',
      );
      final [first, last] = items.cast<LeaveApprovalItem>();
      expect(first.stepId, managerStepId);
      expect(first.kind, ApprovalStepKind.manager);
      expect(first.request.employee.fullName, 'Jamal Uddin');
      expect(first.request.employee.fullNameBn, isNull);
      expect(first.balance?.available, 6);
      expect(last.kind, ApprovalStepKind.hr);
      expect(last.request.days, 47);
      expect(last.balance?.isOnRequest, isTrue);
    });

    test('an inbox item without subjectType is leave, as before '
        'attendance', () async {
      final old = {...approvalsJson().first}..remove('subjectType');
      final (api, _) = client(200, [old]);

      final items = await api.fetchApprovals('access-1');

      expect(items.single, isA<LeaveApprovalItem>());
      expect(items.single.stepId, managerStepId);
    });

    test('approve and reject post the optional comment to the step', () async {
      final (api, adapter) = client(
        201,
        leaveRequestJson(
          id: 'd0000000-0000-4000-8000-000000000001',
          type: casualLeaveJson,
          startDate: '2026-10-28',
          endDate: '2026-10-29',
          days: 2,
          status: 'approved',
        ),
      );

      await api.decideApproval(
        'access-1',
        managerStepId,
        ApprovalDecision.approve,
        comment: 'Get well soon',
      );
      await api.decideApproval('access-1', hrStepId, ApprovalDecision.reject);

      final (approve, reject) = (adapter.requests.first, adapter.requests.last);
      expect(approve.method, 'POST');
      expect(approve.uri.path, '/tenant/approvals/$managerStepId/approve');
      expect(approve.headers['Authorization'], 'Bearer access-1');
      expect(approve.data, {'comment': 'Get well soon'});
      expect(reject.uri.path, '/tenant/approvals/$hrStepId/reject');
      expect(reject.data, <String, Object?>{});
    });

    test('approving a correction accepts the correction it answers', () async {
      final (api, adapter) = client(
        201,
        regularizationJson(
          id: 'ad000000-0000-4000-8000-000000000010',
          date: '2026-10-22',
          inTime: '08:02',
          status: 'approved',
        ),
      );

      await api.decideApproval(
        'access-1',
        correctionStepId,
        ApprovalDecision.approve,
      );

      expect(
        adapter.requests.single.uri.path,
        '/tenant/approvals/$correctionStepId/approve',
      );
    });

    test(
      'holidays send the year and parse tentative dates and the rule',
      () async {
        final body = holidayYearJson(2026);
        (body['holidays']! as List<Object?>).add({
          'id': 'h-new',
          'calendarId': 'f0000000-0000-4000-8000-000000000001',
          'date': '2026-12-31',
          'name': 'New kind',
          'nameBn': null,
          'kind': 'regional',
          'isTentative': false,
        });
        final (api, adapter) = client(200, body);

        final view = await api.fetchMyHolidays('access-1', year: 2026);

        final request = adapter.requests.single;
        expect(request.uri.path, '/tenant/me/holidays');
        expect(request.uri.queryParameters, {'year': '2026'});
        expect(request.headers['Authorization'], 'Bearer access-1');
        expect(view.year, 2026);
        expect(view.calendar.name, 'Bangladesh public holidays');
        expect(view.calendar.isDefault, isTrue);
        expect(view.calendar.locations.single.name, 'Gazipur Factory');
        expect(view.holidays, hasLength(5));
        expect(view.holidays.first.date, DateTime.utc(2026, 2, 21));
        expect(view.holidays.first.kind, HolidayKind.public);
        expect(view.holidays[1].kind, HolidayKind.festival);
        expect(view.holidays[1].isTentative, isTrue);
        expect(view.holidays[2].nameBn, isNull);
        expect(view.holidays[2].kind, HolidayKind.company);
        expect(view.holidays.last.kind, HolidayKind.unknown);
        expect(view.festivalDays, 1);
        expect(view.festivalDaysRequired, 13);
        final rule = view.festivalRule!;
        expect(rule.key, 'holidays.festival.days_per_year');
        expect(rule.value, 13);
        expect(rule.from, DateTime.utc(2026));
        expect(rule.to, isNull);
        expect(rule.section, '118');
        expect(rule.status, RuleStatus.needsReview);
      },
    );

    test('a list endpoint that answers an object is a badResponse', () async {
      final (api, _) = client(200, {'items': <Object?>[]});

      await expectLater(
        api.fetchApprovals('access-1'),
        throwsA(
          isA<ApiException>().having(
            (e) => e.kind,
            'kind',
            ApiErrorKind.badResponse,
          ),
        ),
      );
    });
  });

  group('attendance', () {
    test(
      'today parses the day, the punches and the self-punch rules',
      () async {
        final (api, adapter) = client(200, attendanceTodayJson());

        final today = await api.fetchMyAttendanceToday('access-1');

        final request = adapter.requests.single;
        expect(request.method, 'GET');
        expect(request.uri.path, '/tenant/me/attendance/today');
        expect(request.headers['Authorization'], 'Bearer access-1');
        expect(today.employee.fullNameBn, 'রহিমা খাতুন');
        expect(today.timeZone, 'Asia/Dhaka');
        expect(today.nextDirection, PunchDirection.punchOut);

        final day = today.day;
        expect(day.date, DateTime.utc(2026, 10, 24));
        expect(day.dayType, DayType.working);
        expect(day.status, AttendanceStatus.pending);
        expect(day.shift?.name, 'General shift');
        expect(day.shift?.startTime, const ClockTime(8, 0));
        expect(day.shift?.endTime, const ClockTime(17, 0));
        expect(day.firstIn, DateTime.utc(2026, 10, 24, 1, 55));
        expect(day.lastOut, isNull);
        expect(day.flags, isEmpty);
        expect(day.regularization, isNull);

        expect(today.punches, hasLength(2));
        expect(today.punches.first.source, PunchSource.device);
        expect(today.punches.first.direction, PunchDirection.punchIn);
        expect(today.punches.first.device?.name, 'Main gate');
        expect(today.punches.first.voided, isFalse);
        expect(today.punches.last.voided, isTrue);
        expect(today.punches.last.note, 'Double tap');

        final selfPunch = today.selfPunch;
        expect(selfPunch.mode, SelfPunchMode.geofenced);
        expect(selfPunch.blockedReason, isNull);
        expect(selfPunch.geofence?.radiusM, 200);
        expect(selfPunch.canPunch, isTrue);
        expect(selfPunch.needsLocation, isTrue);
        expect(selfPunch.geofence!.distanceTo(atTheBazaar).round(), 801);
        expect(selfPunch.geofence!.distanceTo(atTheFactory).round(), 15);
      },
    );

    test(
      'a blocked self-punch and unknown values do not break today',
      () async {
        final json = attendanceTodayJson(
          mode: 'off',
          blockedReason: 'disabled',
          geofence: null,
          nextDirection: 'in',
          punches: [
            punchJson(
              id: 'p',
              date: '2026-10-24',
              time: '08:00',
              source: 'kiosk',
              direction: 'unknown',
            ),
          ],
          day: dayJson(
            date: '2026-10-24',
            dayType: 'shutdown',
            status: 'excused',
            shift: null,
            flags: ['late', 'new_flag'],
          ),
        );
        final (api, _) = client(200, json);

        final today = await api.fetchMyAttendanceToday('access-1');

        expect(today.selfPunch.mode, SelfPunchMode.off);
        expect(today.selfPunch.blockedReason, SelfPunchBlock.disabled);
        expect(today.selfPunch.canPunch, isFalse);
        expect(today.nextDirection, PunchDirection.punchIn);
        expect(today.punches.single.source, PunchSource.unknown);
        expect(today.punches.single.direction, PunchDirection.unknown);
        expect(today.day.dayType, DayType.unknown);
        expect(today.day.status, AttendanceStatus.unknown);
        expect(today.day.shift, isNull);
        expect(today.day.flags, {AttendanceFlag.late, AttendanceFlag.unknown});
      },
    );

    test('punch posts the mobile source with or without a location', () async {
      final (api, adapter) = client(201, attendanceTodayJson());

      await api.punch('access-1', location: atTheFactory);
      await api.punch(
        'access-1',
        location: const PunchLocation(latitude: 24, longitude: 90.4),
      );
      await api.punch('access-1');

      final [located, noAccuracy, bare] = adapter.requests;
      expect(located.method, 'POST');
      expect(located.uri.path, '/tenant/me/attendance/punch');
      expect(located.headers['Authorization'], 'Bearer access-1');
      expect(located.data, {
        'source': 'mobile',
        'latitude': 24.0024,
        'longitude': 90.4265,
        'accuracyM': 12.0,
      });
      expect(noAccuracy.data, {
        'source': 'mobile',
        'latitude': 24.0,
        'longitude': 90.4,
      });
      expect(bare.data, {'source': 'mobile'});
    });

    test('a refused punch carries the code and the API message', () async {
      final (api, _) = client(400, {
        'statusCode': 400,
        'error': 'Bad Request',
        'message': 'You are about 801 m away, outside the 200 m allowed',
        'code': 'outside_geofence',
      });

      await expectLater(
        api.punch('access-1', location: atTheBazaar),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'statusCode', 400)
              .having((e) => e.code, 'code', 'outside_geofence')
              .having(
                (e) => e.message,
                'message',
                'You are about 801 m away, outside the 200 m allowed',
              ),
        ),
      );
    });

    test('my attendance sends the dates and parses days and totals', () async {
      final (api, adapter) = client(
        200,
        attendanceRangeJson('2026-10-01', '2026-10-24'),
      );

      final range = await api.fetchMyAttendance(
        'access-1',
        from: DateTime.utc(2026, 10),
        to: DateTime.utc(2026, 10, 24),
      );

      final request = adapter.requests.single;
      expect(request.uri.path, '/tenant/me/attendance');
      expect(request.uri.queryParameters, {
        'from': '2026-10-01',
        'to': '2026-10-24',
      });
      expect(range.timeZone, 'Asia/Dhaka');
      expect(range.from, DateTime.utc(2026, 10));
      expect(range.days, hasLength(24));
      final byDay = {for (final day in range.days) day.date.day: day};
      expect(byDay[2]!.dayType, DayType.weeklyOff);
      expect(byDay[2]!.isOffDay, isTrue);
      expect(byDay[21]!.dayType, DayType.holiday);
      expect(byDay[21]!.holidayName, 'Durga Puja');
      expect(byDay[22]!.flags, {AttendanceFlag.late});
      expect(byDay[22]!.lateMinutes, 25);
      expect(byDay[19]!.overtimeMinutes, 120);
      expect(byDay[14]!.leave?.code, 'CL');
      expect(byDay[14]!.status, AttendanceStatus.onLeave);
      expect(byDay[20]!.status, AttendanceStatus.missingPunch);
      expect(byDay[20]!.regularization?.status, RegularizationStatus.pending);
      expect(byDay[8]!.flags, {AttendanceFlag.onDuty});
      expect(byDay[12]!.status, AttendanceStatus.halfDay);
      expect(range.totals.present, 14);
      expect(range.totals.halfDay, 1);
      expect(range.totals.absent, 1);
      expect(range.totals.onLeave, 1);
      expect(range.totals.missingPunch, 1);
      expect(range.totals.late, 1);
      expect(range.totals.workedMinutes, 7250);
      expect(range.totals.overtimeMinutes, 120);
    });

    test('corrections: list, ask and cancel', () async {
      final (list, listAdapter) = client(200, myRegularizationsJson());
      final corrections = await list.fetchMyRegularizations('access-1');
      expect(
        listAdapter.requests.single.uri.path,
        '/tenant/me/attendance/regularizations',
      );
      expect(corrections.map((c) => c.status), [
        RegularizationStatus.pending,
        RegularizationStatus.approved,
        RegularizationStatus.rejected,
      ]);
      expect(corrections.first.inTime, isNull);
      expect(corrections.first.outTime, const ClockTime(17, 40));
      expect(corrections.first.canCancel, isTrue);
      expect(corrections[1].kind, RegularizationKind.onDuty);
      expect(corrections[1].canCancel, isFalse);
      expect(corrections.last.inTime, const ClockTime(8, 0));
      expect(
        corrections.last.steps.first.comment,
        'The device has you at 9:40',
      );

      final (ask, askAdapter) = client(
        201,
        regularizationJson(id: 'new', date: '2026-10-22', inTime: '08:02'),
      );
      final created = await ask.requestRegularization(
        'access-1',
        RegularizationDraft(
          date: DateTime.utc(2026, 10, 22),
          kind: RegularizationKind.missedPunch,
          inTime: const ClockTime(8, 2),
          reason: 'The device did not read my finger',
        ),
      );
      await ask.requestRegularization(
        'access-1',
        RegularizationDraft(
          date: DateTime.utc(2026, 10, 8),
          kind: RegularizationKind.onDuty,
          // Times on an on-duty day are never sent.
          inTime: const ClockTime(9, 0),
          reason: 'Buyer inspection',
        ),
      );
      final [missed, onDuty] = askAdapter.requests;
      expect(missed.method, 'POST');
      expect(missed.uri.path, '/tenant/me/attendance/regularizations');
      expect(missed.data, {
        'date': '2026-10-22',
        'kind': 'missed_punch',
        'inTime': '08:02',
        'reason': 'The device did not read my finger',
      });
      expect(onDuty.data, {
        'date': '2026-10-08',
        'kind': 'on_duty',
        'reason': 'Buyer inspection',
      });
      expect(created.inTime, const ClockTime(8, 2));

      final (cancel, cancelAdapter) = client(
        201,
        regularizationJson(
          id: pendingCorrectionId,
          date: '2026-10-20',
          outTime: '17:40',
          status: 'cancelled',
        ),
      );
      final cancelled = await cancel.cancelRegularization(
        'access-1',
        pendingCorrectionId,
      );
      expect(cancelAdapter.requests.single.method, 'POST');
      expect(
        cancelAdapter.requests.single.uri.path,
        '/tenant/attendance/regularizations/$pendingCorrectionId/cancel',
      );
      expect(cancelled.status, RegularizationStatus.cancelled);
    });

    test('a refused correction carries its code', () async {
      final (api, _) = client(409, {
        'statusCode': 409,
        'error': 'Conflict',
        'message': 'A correction for this day is already waiting',
        'code': 'already_pending',
      });

      await expectLater(
        api.requestRegularization(
          'access-1',
          RegularizationDraft(
            date: DateTime.utc(2026, 10, 20),
            kind: RegularizationKind.missedPunch,
            outTime: const ClockTime(17, 40),
            reason: 'Card reader',
          ),
        ),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'statusCode', 409)
              .having((e) => e.code, 'code', 'already_pending'),
        ),
      );
    });

    test('a bad HH:MM time breaks the contract', () {
      expect(
        () => Regularization.fromJson(
          regularizationJson(id: 'x', date: '2026-10-20', inTime: '8:00'),
        ),
        throwsFormatException,
      );
      expect(() => ClockTime.parse('24:00'), throwsFormatException);
      expect(ClockTime.parse('23:59').wire, '23:59');
    });

    test(
      'a mixed inbox parses leave, corrections and unknown subjects',
      () async {
        final (api, _) = client(200, mixedApprovalsJson());

        final items = await api.fetchApprovals('access-1');

        expect(items, hasLength(3));
        final [leave, correction, unknown] = items;
        expect(leave, isA<LeaveApprovalItem>());
        expect((leave as LeaveApprovalItem).request.days, 2);

        expect(correction, isA<RegularizationApprovalItem>());
        correction as RegularizationApprovalItem;
        expect(correction.stepId, correctionStepId);
        expect(correction.kind, ApprovalStepKind.manager);
        expect(correction.regularization.employee.fullNameBn, 'কুলসুম আক্তার');
        expect(correction.regularization.kind, RegularizationKind.missedPunch);
        expect(correction.regularization.inTime, const ClockTime(8, 2));
        expect(correction.regularization.date, DateTime.utc(2026, 10, 22));
        expect(correction.day?.status, AttendanceStatus.missingPunch);

        expect(unknown, isA<UnknownApprovalItem>());
        unknown as UnknownApprovalItem;
        expect(unknown.stepId, unknownStepId);
        expect(unknown.kind, ApprovalStepKind.hr);
        expect(unknown.subjectType, 'overtime_request');
      },
    );
  });

  group('selfie punches', () {
    test('today reads requireSelfie and a punch\'s selfie; an older body '
        'without them asks for none', () async {
      final (api, _) = client(
        200,
        attendanceTodayJson(
          requireSelfie: true,
          punches: [
            punchJson(
              id: mobilePunchId,
              date: '2026-10-24',
              time: '07:55',
              source: 'mobile',
              selfieDocumentId: selfieDocumentId,
            ),
          ],
        ),
      );

      final today = await api.fetchMyAttendanceToday('access-1');

      expect(today.selfPunch.requireSelfie, isTrue);
      expect(today.punches.single.selfieDocumentId, selfieDocumentId);

      final older = attendanceTodayJson();
      (older['selfPunch']! as Json).remove('requireSelfie');
      for (final punch in older['punches']! as List<Object?>) {
        (punch! as Json).remove('selfieDocumentId');
      }
      final (oldApi, _) = client(200, older);
      final before = await oldApi.fetchMyAttendanceToday('access-1');
      expect(before.selfPunch.requireSelfie, isFalse);
      expect(before.punches.first.selfieDocumentId, isNull);
    });

    test('a punch with a selfie is a multipart form: text fields and the '
        'photo in "selfie"', () async {
      final (api, adapter) = fileClient(
        201,
        utf8.encode(jsonEncode(attendanceTodayJson())),
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );

      final today = await api.punch(
        'access-1',
        location: atTheFactory,
        selfie: PunchSelfie(bytes: tinyPng),
      );

      final request = adapter.requests.single;
      expect(request.method, 'POST');
      expect(request.uri.path, '/tenant/me/attendance/punch');
      expect(request.headers['Authorization'], 'Bearer access-1');
      expect(request.contentType, startsWith('multipart/form-data; boundary='));
      final form = request.data as FormData;
      expect(Map.fromEntries(form.fields), {
        'source': 'mobile',
        'latitude': '24.0024',
        'longitude': '90.4265',
        'accuracyM': '12.0',
      });
      final (field, file) = (form.files.single.key, form.files.single.value);
      expect(field, 'selfie');
      expect(file.filename, 'selfie.jpg');
      expect(file.contentType.toString(), 'image/jpeg');
      expect(file.length, tinyPng.length);
      expect(today.nextDirection, PunchDirection.punchOut);
    });

    test('a refused selfie punch carries its code', () async {
      final (api, _) = client(400, {
        'statusCode': 400,
        'error': 'Bad Request',
        'message': 'Take a photo to punch',
        'code': 'selfie_required',
      });

      await expectLater(
        api.punch('access-1', location: atTheFactory),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'statusCode', 400)
              .having((e) => e.code, 'code', 'selfie_required'),
        ),
      );
    });
  });

  group('documents and lifecycle', () {
    test('my documents parse categories, sources, dates and unknown '
        'values', () async {
      final body = [
        ...myDocumentsJson(),
        documentJson(
          id: 'da000000-0000-4000-8000-000000000099',
          title: 'Something new',
          category: 'tax_card',
          source: 'scanned',
        ),
      ];
      final (api, adapter) = client(200, body);

      final documents = await api.fetchMyDocuments('access-1');

      final request = adapter.requests.single;
      expect(request.method, 'GET');
      expect(request.uri.path, '/tenant/me/documents');
      expect(request.headers['Authorization'], 'Bearer access-1');
      final byId = {for (final d in documents) d.id: d};
      final letter = byId[appointmentLetterId]!;
      expect(letter.category, DocumentCategory.letter);
      expect(letter.source, DocumentSource.generated);
      expect(letter.refNo, 'MG/HR/2020/0005');
      expect(letter.issuedOn, DateTime.utc(2020, 3));
      expect(letter.expiresOn, isNull);
      expect(letter.uploadedBy, isNull);
      expect(letter.employee.employeeCode, 'MG-0005');
      final scan = byId[nidScanId]!;
      expect(scan.category, DocumentCategory.nid);
      expect(scan.isImage, isTrue);
      expect(scan.sizeBytes, 48213);
      expect(byId[medicalCertificateId]!.expiresOn, DateTime.utc(2026, 11, 30));
      final unknown = byId['da000000-0000-4000-8000-000000000099']!;
      expect(unknown.category, DocumentCategory.unknown);
      expect(unknown.source, DocumentSource.unknown);
    });

    test('expiry: expired before today, soon within 60 days, else none', () {
      EmployeeDocument expiring(String? date) => EmployeeDocument.fromJson(
        documentJson(id: 'x', title: 'x', expiresOn: date),
      );

      expect(
        expiring('2026-10-23').expiryOn(leaveToday),
        DocumentExpiry.expired,
      );
      expect(expiring('2026-10-24').expiryOn(leaveToday), DocumentExpiry.soon);
      expect(expiring('2026-12-23').expiryOn(leaveToday), DocumentExpiry.soon);
      expect(expiring('2026-12-24').expiryOn(leaveToday), DocumentExpiry.none);
      expect(expiring(null).expiryOn(leaveToday), DocumentExpiry.none);
    });

    test('downloading a document asks for bytes and returns them with the '
        'type and name', () async {
      final (api, adapter) = fileClient(
        200,
        tinyPng,
        headers: {
          Headers.contentTypeHeader: ['image/png'],
          'content-disposition': [
            'inline; filename="nid-front.png"; '
                "filename*=UTF-8''nid-front.png",
          ],
        },
      );

      final file = await api.downloadDocument('access-1', nidScanId);

      final request = adapter.requests.single;
      expect(request.method, 'GET');
      expect(request.uri.path, '/tenant/documents/$nidScanId/file');
      expect(request.headers['Authorization'], 'Bearer access-1');
      expect(request.headers['Accept'], '*/*');
      expect(request.responseType, ResponseType.bytes);
      expect(file.bytes, tinyPng);
      expect(file.contentType, 'image/png');
      expect(file.fileName, 'nid-front.png');
    });

    test('the service book sends the language and reads a Bangla file '
        'name', () async {
      final (api, adapter) = fileClient(
        200,
        pdfBytes,
        headers: {
          Headers.contentTypeHeader: ['application/pdf; charset=binary'],
          'content-disposition': [
            'inline; filename="service-book-____.pdf"; '
                "filename*=UTF-8''service-book-%E0%A6%AC%E0%A6%87.pdf",
          ],
        },
      );

      final file = await api.fetchMyServiceBook(
        'access-1',
        language: LetterLanguage.bn,
      );

      final request = adapter.requests.single;
      expect(request.uri.path, '/tenant/me/service-book');
      expect(request.uri.queryParameters, {'language': 'bn'});
      expect(request.headers['Authorization'], 'Bearer access-1');
      expect(file.bytes, pdfBytes);
      expect(file.contentType, 'application/pdf');
      expect(file.fileName, 'service-book-বই.pdf');
    });

    test('a refused download carries the API error from its bytes', () async {
      final (api, _) = fileClient(
        403,
        utf8.encode(
          jsonEncode({
            'statusCode': 403,
            'error': 'Forbidden',
            'message': 'This document is not shared with you',
          }),
        ),
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );

      await expectLater(
        api.downloadDocument('access-1', nidScanId),
        throwsA(
          isA<ApiException>()
              .having((e) => e.kind, 'kind', ApiErrorKind.server)
              .having((e) => e.statusCode, 'statusCode', 403)
              .having(
                (e) => e.message,
                'message',
                'This document is not shared with you',
              ),
        ),
      );
    });

    test('file names come from filename*, else filename, else none', () {
      expect(fileNameFromDisposition(null), isNull);
      expect(fileNameFromDisposition('inline'), isNull);
      expect(
        fileNameFromDisposition('attachment; filename="letter.pdf"'),
        'letter.pdf',
      );
      expect(
        fileNameFromDisposition('inline; filename=plain.pdf'),
        'plain.pdf',
      );
      expect(
        fileNameFromDisposition(
          "inline; filename=\"a.pdf\"; filename*=UTF-8''%ZZ.pdf",
        ),
        'a.pdf',
      );
    });

    test('separations parse the notice, the shortfall and the trail', () async {
      final (api, adapter) = client(200, [
        ...pendingSeparationsJson(),
        separationJson(
          id: 'db000000-0000-4000-8000-000000000003',
          type: 'dismissal',
          status: 'completed',
          noticeDaysRequired: null,
          initiatedBy: 'hr',
          steps: const [],
          decidedAt: '2025-01-10T04:00:00.000Z',
          completedAt: '2025-01-11T04:00:00.000Z',
        ),
        separationJson(
          id: 'db000000-0000-4000-8000-000000000004',
          type: 'secondment',
          status: 'paused',
          initiatedBy: 'union',
        ),
      ]);

      final [pending, dismissal, unknown] = await api.fetchMySeparations(
        'access-1',
      );

      expect(adapter.requests.single.uri.path, '/tenant/me/separations');
      expect(
        adapter.requests.single.headers['Authorization'],
        'Bearer access-1',
      );
      expect(pending.type, SeparationType.resignation);
      expect(pending.status, SeparationStatus.pending);
      expect(pending.noticeDate, DateTime.utc(2026, 10, 24));
      expect(pending.lastWorkingDay, DateTime.utc(2026, 11, 24));
      expect(pending.noticeDaysRequired, 60);
      expect(pending.noticeGivenDays, 31);
      expect(pending.noticeShortfallDays, 29);
      expect(pending.initiatedBy, SeparationInitiator.employee);
      expect(pending.steps, hasLength(2));
      expect(pending.isOpen, isTrue);
      expect(pending.canCancel, isTrue);
      expect(dismissal.noticeDaysRequired, isNull);
      expect(dismissal.noticeShortfallDays, 0);
      expect(dismissal.initiatedBy, SeparationInitiator.hr);
      expect(dismissal.completedAt, DateTime.utc(2025, 1, 11, 4));
      expect(dismissal.isOpen, isFalse);
      expect(unknown.type, SeparationType.unknown);
      expect(unknown.status, SeparationStatus.unknown);
      expect(unknown.initiatedBy, SeparationInitiator.unknown);
      expect(unknown.canCancel, isFalse);
    });

    test('resigning posts the last day and reason; cancelling posts to the '
        'separation', () async {
      final (api, adapter) = client(201, pendingSeparationsJson().single);

      final created = await api.resign(
        'access-1',
        ResignationDraft(
          lastWorkingDay: DateTime.utc(2026, 11, 24),
          reason: 'Moving back to my village to care for my mother',
        ),
      );
      await api.cancelSeparation('access-1', pendingResignationId);

      final [resign, cancel] = adapter.requests;
      expect(resign.method, 'POST');
      expect(resign.uri.path, '/tenant/me/resignation');
      expect(resign.headers['Authorization'], 'Bearer access-1');
      expect(resign.data, {
        'lastWorkingDay': '2026-11-24',
        'reason': 'Moving back to my village to care for my mother',
      });
      expect(created.id, pendingResignationId);
      expect(cancel.method, 'POST');
      expect(
        cancel.uri.path,
        '/tenant/separations/$pendingResignationId/cancel',
      );
    });

    test('a refused resignation carries its code', () async {
      final (api, _) = client(409, {
        'statusCode': 409,
        'error': 'Conflict',
        'message': 'A separation is already in progress',
        'code': 'separation_open',
      });

      await expectLater(
        api.resign(
          'access-1',
          ResignationDraft(lastWorkingDay: DateTime.utc(2026, 12), reason: 'x'),
        ),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'statusCode', 409)
              .having((e) => e.code, 'code', 'separation_open'),
        ),
      );
    });

    test('a resignation in the inbox parses as a separation item', () async {
      final (api, _) = client(200, [separationApprovalJson()]);

      final item = (await api.fetchApprovals('access-1')).single;

      expect(item, isA<SeparationApprovalItem>());
      item as SeparationApprovalItem;
      expect(item.stepId, separationStepId);
      expect(item.kind, ApprovalStepKind.manager);
      expect(item.separation.employee.fullName, 'Kulsum Akter');
      expect(item.separation.noticeShortfallDays, 29);
    });
  });

  group('payroll', () {
    test('my payslips parse kinds, dates and net pay; unknown kinds are '
        'kept', () async {
      final body = [
        ...myPayslipsJson(),
        payslipJson(
          itemId: 'e1000000-0000-4000-8000-000000000099',
          kind: 'bonus',
        ),
      ];
      final (api, adapter) = client(200, body);

      final payslips = await api.fetchMyPayslips('access-1');

      final request = adapter.requests.single;
      expect(request.method, 'GET');
      expect(request.uri.path, '/tenant/me/payslips');
      expect(request.headers['Authorization'], 'Bearer access-1');
      expect(payslips.map((p) => p.itemId), [
        septemberAdjustmentId,
        septemberPayslipId,
        augustPayslipId,
        'e1000000-0000-4000-8000-000000000099',
      ]);
      final adjustment = payslips.first;
      expect(adjustment.runId, 'e2000000-0000-4000-8000-000000000003');
      expect(adjustment.kind, PayrollRunKind.adjustment);
      expect(adjustment.isAdjustment, isTrue);
      expect(adjustment.periodStart, DateTime.utc(2026, 9));
      expect(adjustment.periodEnd, DateTime.utc(2026, 9, 30));
      expect(adjustment.paymentDate, DateTime.utc(2026, 10, 20));
      expect(adjustment.net, '1250.50');
      expect(adjustment.publishedAt, DateTime.utc(2026, 10, 20, 6));
      expect(payslips[1].kind, PayrollRunKind.regular);
      expect(payslips[1].isAdjustment, isFalse);
      expect(payslips[1].net, '12500.00');
      expect(payslips.last.kind, PayrollRunKind.unknown);
    });

    test('a net pay that is not an amount breaks the contract', () async {
      for (final net in <Object>['12,500.00', '12500.001', '', 12500]) {
        final (api, _) = client(200, [
          {...payslipJson(itemId: septemberPayslipId), 'net': net},
        ]);
        await expectLater(
          api.fetchMyPayslips('access-1'),
          throwsA(
            isA<ApiException>().having(
              (e) => e.kind,
              'kind',
              ApiErrorKind.badResponse,
            ),
          ),
          reason: '$net',
        );
      }
    });

    test('a workspace without payroll gets a 403 with its code', () async {
      final (api, _) = client(403, {
        'statusCode': 403,
        'error': 'Forbidden',
        'message': 'Your plan does not include payroll',
        'code': 'feature_not_in_plan',
      });

      await expectLater(
        api.fetchMyPayslips('access-1'),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'statusCode', 403)
              .having((e) => e.code, 'code', 'feature_not_in_plan'),
        ),
      );
    });

    test('a payslip PDF sends the language and returns the file with its '
        'name', () async {
      final (api, adapter) = fileClient(
        200,
        pdfBytes,
        headers: {
          Headers.contentTypeHeader: ['application/pdf'],
          'content-disposition': [
            'attachment; filename="payslip-MG-0005-2026-09-bn.pdf"',
          ],
        },
      );

      final file = await api.fetchMyPayslipPdf(
        'access-1',
        septemberPayslipId,
        language: LetterLanguage.bn,
      );

      final request = adapter.requests.single;
      expect(request.method, 'GET');
      expect(request.uri.path, '/tenant/me/payslips/$septemberPayslipId');
      expect(request.uri.queryParameters, {'language': 'bn'});
      expect(request.headers['Authorization'], 'Bearer access-1');
      expect(request.headers['Accept'], '*/*');
      expect(request.responseType, ResponseType.bytes);
      expect(file.bytes, pdfBytes);
      expect(file.contentType, 'application/pdf');
      expect(file.fileName, 'payslip-MG-0005-2026-09-bn.pdf');
    });
  });

  test('a body that breaks the contract is a badResponse error', () async {
    final (api, _) = client(200, {'accessToken': 'only-this'});

    await expectLater(
      api.refresh('refresh-1'),
      throwsA(
        isA<ApiException>().having(
          (e) => e.kind,
          'kind',
          ApiErrorKind.badResponse,
        ),
      ),
    );
  });

  group('sign-in by code, two-step sign-in, account and notifications', () {
    test('login answers a second step instead of a session', () async {
      final (api, _) = client(200, {'mfaRequired': true, 'mfaToken': 'mfa-1'});
      final step = await api.login(
        tenant: 'acme',
        email: 'a@acme.test',
        password: 'x',
      );
      expect(step, isA<TwoStepChallenge>());
      step as TwoStepChallenge;
      expect(step.mfaToken, 'mfa-1');
      expect(step.setupRequired, isFalse);

      final (setupApi, _) = client(200, {
        'mfaSetupRequired': true,
        'mfaToken': 'mfa-2',
      });
      final setup = await setupApi.login(
        tenant: 'acme',
        email: 'a@acme.test',
        password: 'x',
      ) as TwoStepChallenge;
      expect(setup.setupRequired, isTrue);
    });

    test(
      'the second step posts the token and code and answers a session',
      () async {
        final (api, adapter) = client(200, loginJson);
        final session = await api.verifyMfa(
          mfaToken: 'mfa-1',
          code: 'k7qm-2xpd',
        );
        expect(adapter.requests.single.uri.path, '/auth/mfa/verify');
        expect(adapter.requests.single.data, {
          'mfaToken': 'mfa-1',
          'code': 'k7qm-2xpd',
        });
        expect(session.tokens.accessToken, 'access-1');
      },
    );

    test('a code by SMS: requested, then verified into a session with no '
        'email', () async {
      final (api, adapter) = client(202, {
        'sent': true,
        'expiresInSeconds': 300,
      });
      final sent = await api.requestOtp(tenant: 'acme', phone: '01712345678');
      expect(adapter.requests.single.method, 'POST');
      expect(adapter.requests.single.uri.path, '/auth/otp/request');
      expect(adapter.requests.single.data, {
        'tenant': 'acme',
        'phone': '01712345678',
      });
      expect(sent.expiresInSeconds, 300);

      final (verify, verifyAdapter) = client(200, phoneLoginJson);
      final session = await verify.verifyOtp(
        tenant: 'acme',
        phone: '01712345678',
        code: '123456',
      );
      expect(verifyAdapter.requests.single.uri.path, '/auth/otp/verify');
      expect(verifyAdapter.requests.single.data, {
        'tenant': 'acme',
        'phone': '01712345678',
        'code': '123456',
      });
      expect(session.user.email, isNull);
      expect(session.user.role, UserRole.employee);
    });

    test('a 429 carries its code and when to try again', () async {
      final (api, _) = client(429, {
        'statusCode': 429,
        'error': 'Too Many Requests',
        'message': 'Too many attempts. Try again in 15 minutes.',
        'code': 'too_many_attempts',
        'retryAfterSeconds': 840,
      });
      await expectLater(
        api.requestOtp(tenant: 'acme', phone: '01712345678'),
        throwsA(
          isA<ApiException>()
              .having((e) => e.code, 'code', 'too_many_attempts')
              .having((e) => e.retryAfterSeconds, 'retryAfterSeconds', 840),
        ),
      );
    });

    test('no connection is a network error, not an HTTP one', () async {
      final dio = Dio(BaseOptions(baseUrl: 'http://localhost:4000'))
        ..httpClientAdapter = _OfflineAdapter();
      await expectLater(
        DioGoodPeopleApi(dio).punch('access-1'),
        throwsA(
          isA<ApiException>()
              .having((e) => e.kind, 'kind', ApiErrorKind.network)
              .having((e) => e.statusCode, 'statusCode', isNull),
        ),
      );
    });

    test('account: read, password, language and devices', () async {
      final (api, adapter) = client(200, accountJson(mfaEnabled: true));
      final account = await api.fetchAccount('access-1');
      expect(adapter.requests.single.uri.path, '/account');
      expect(
        adapter.requests.single.headers['Authorization'],
        'Bearer access-1',
      );
      expect(account.role, UserRole.tenantAdmin);
      expect(account.mfaEnabled, isTrue);
      expect(account.hasPassword, isTrue);
      expect(account.phone, '+8801711000005');

      final (write, writes) = client(204, null);
      await write.changePassword(
        'access-1',
        currentPassword: 'old secret',
        newPassword: 'a whole new password',
        keepRefreshToken: 'refresh-1',
      );
      await write.registerDevice(
        'access-1',
        platform: DevicePlatform.android,
        token: 'fcm-token-0123456789',
      );
      await write.removeDevice('access-1', 'fcm-token-0123456789');
      expect(
        [for (final r in writes.requests) (r.method, r.uri.path)],
        [
          ('POST', '/account/password'),
          ('POST', '/account/devices'),
          ('POST', '/account/devices/remove'),
        ],
      );
      expect(
        [for (final r in writes.requests) r.data],
        [
          {
            'currentPassword': 'old secret',
            'newPassword': 'a whole new password',
            'keepRefreshToken': 'refresh-1',
          },
          {'platform': 'android', 'token': 'fcm-token-0123456789'},
          {'token': 'fcm-token-0123456789'},
        ],
      );

      final (prefs, prefsAdapter) = client(200, {
        ...accountJson(),
        'language': 'bn',
      });
      final updated = await prefs.updatePreferences(
        'access-1',
        language: UserLanguage.bn,
      );
      expect(prefsAdapter.requests.single.method, 'PATCH');
      expect(prefsAdapter.requests.single.uri.path, '/account/preferences');
      expect(prefsAdapter.requests.single.data, {'language': 'bn'});
      expect(updated.language, UserLanguage.bn);
    });

    test('the inbox parses items and counts; reading posts to them', () async {
      final (api, adapter) = client(
        200,
        inboxJson([
          notificationJson(id: 'f0000000-0000-4000-8000-000000000001'),
          notificationJson(
            id: 'f0000000-0000-4000-8000-000000000002',
            event: 'attendance.missing_punch',
            link: null,
            readAt: '2026-10-24T05:00:00.000Z',
          ),
          notificationJson(
            id: 'f0000000-0000-4000-8000-000000000003',
            event: 'brand.new_event',
          ),
        ]),
      );
      final inbox = await api.fetchNotifications('access-1', unreadOnly: true);
      expect(adapter.requests.single.uri.path, '/tenant/notifications');
      expect(adapter.requests.single.uri.queryParameters, {'unread': 'true'});
      expect(inbox.unread, 2);
      expect(inbox.items.map((n) => n.event), [
        NotificationEvent.approvalRequested,
        NotificationEvent.missingPunch,
        NotificationEvent.unknown,
      ]);
      expect(inbox.items.first.link, '/workspace/approvals');
      expect(inbox.items[1].isRead, isTrue);
      expect(inbox.items[1].link, isNull);
      expect(inbox.items.first.createdAt, DateTime.utc(2026, 10, 24, 3));

      final read = inbox.withRead(inbox.items.first.id, DateTime.utc(2026));
      expect(read.unread, 1);
      expect(read.items.first.isRead, isTrue);
      expect(read.withRead(inbox.items.first.id, DateTime.utc(2026)).unread, 1);
      expect(inbox.allRead(DateTime.utc(2026)).unread, 0);

      final (write, writes) = client(204, null);
      await write.markNotificationRead(
        'access-1',
        'f0000000-0000-4000-8000-000000000001',
      );
      await write.markAllNotificationsRead('access-1');
      expect(
        [for (final r in writes.requests) (r.method, r.uri.path)],
        [
          (
            'POST',
            '/tenant/notifications/f0000000-0000-4000-8000-000000000001/read',
          ),
          ('POST', '/tenant/notifications/read-all'),
        ],
      );
    });

    test('a punch from the offline queue sends when it happened and its '
        'clientId, as JSON or in the form', () async {
      final at = DateTime.utc(2026, 10, 24, 2, 5, 0, 123, 456);
      final (api, adapter) = client(201, attendanceTodayJson());
      await api.punch(
        'access-1',
        location: atTheFactory,
        clientId: '3b241101-e2bb-4255-8caf-4136c566a962',
        punchedAt: at,
      );
      expect(adapter.requests.single.data, {
        'source': 'mobile',
        'latitude': 24.0024,
        'longitude': 90.4265,
        'accuracyM': 12.0,
        'clientId': '3b241101-e2bb-4255-8caf-4136c566a962',
        'punchedAt': '2026-10-24T02:05:00.123Z',
      });

      final (form, formAdapter) = fileClient(
        201,
        utf8.encode(jsonEncode(attendanceTodayJson())),
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );
      await form.punch(
        'access-1',
        selfie: PunchSelfie(bytes: tinyPng),
        clientId: '3b241101-e2bb-4255-8caf-4136c566a962',
        punchedAt: at,
      );
      final fields = Map.fromEntries(
        (formAdapter.requests.single.data as FormData).fields,
      );
      expect(fields, {
        'source': 'mobile',
        'clientId': '3b241101-e2bb-4255-8caf-4136c566a962',
        'punchedAt': '2026-10-24T02:05:00.123Z',
      });
    });

    test('team day and leave calendar send their dates and parse', () async {
      final (api, adapter) = client(
        200,
        teamDayJson('2026-10-24', [
          teamRowJson(
            id: 'e0000000-0000-4000-8000-000000000001',
            name: 'Karim Uddin',
            code: 'MG-0011',
            date: '2026-10-24',
            status: 'missing_punch',
          ),
        ]),
      );
      final day = await api.fetchTeamDay(
        'access-1',
        date: DateTime.utc(2026, 10, 24),
      );
      expect(adapter.requests.single.uri.path, '/tenant/attendance/daily');
      expect(adapter.requests.single.uri.queryParameters, {
        'date': '2026-10-24',
      });
      expect(day.counts, {AttendanceStatus.missingPunch: 1});
      expect(day.rows.single.employee.employeeCode, 'MG-0011');
      expect(day.rows.single.day.status, AttendanceStatus.missingPunch);

      final (leave, leaveAdapter) = client(
        200,
        leaveCalendarJson('2026-10-24', '2026-10-30', [
          {
            'requestId': 'b0000000-0000-4000-8000-000000000101',
            'employee': {
              'id': 'e0000000-0000-4000-8000-000000000002',
              'fullName': 'Salma Begum',
              'employeeCode': 'MG-0012',
            },
            'leaveType': {'code': 'SL', 'name': 'Sick leave', 'nameBn': null},
            'startDate': '2026-10-24',
            'endDate': '2026-10-25',
            'status': 'approved',
          },
        ]),
      );
      final calendar = await leave.fetchLeaveCalendar(
        'access-1',
        from: DateTime.utc(2026, 10, 24),
        to: DateTime.utc(2026, 10, 30),
      );
      expect(leaveAdapter.requests.single.uri.path, '/tenant/leave/calendar');
      expect(leaveAdapter.requests.single.uri.queryParameters, {
        'from': '2026-10-24',
        'to': '2026-10-30',
      });
      final entry = calendar.entries.single;
      expect(entry.status, LeaveRequestStatus.approved);
      expect(entry.covers(DateTime.utc(2026, 10, 25)), isTrue);
      expect(entry.covers(DateTime.utc(2026, 10, 26)), isFalse);
    });
  });
}

/// Fails every request the way dio does with no connection.
class _OfflineAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async => throw DioException.connectionError(
    requestOptions: options,
    reason: 'Network is unreachable',
  );

  @override
  void close({bool force = false}) {}
}
