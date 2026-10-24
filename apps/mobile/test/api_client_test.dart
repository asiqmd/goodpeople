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

void main() {
  (DioGoodPeopleApi, _StubAdapter) client(int status, Object? body) {
    final adapter = _StubAdapter(status, body);
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost:4000'))
      ..httpClientAdapter = adapter;
    return (DioGoodPeopleApi(dio), adapter);
  }

  test('login posts the contract body and parses the response', () async {
    final (api, adapter) = client(200, loginJson);

    final response = await api.login(
      tenant: 'acme',
      email: 'rahima@acme.test',
      password: 'secret',
    );

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
      expect(items.first.stepId, managerStepId);
      expect(items.first.kind, ApprovalStepKind.manager);
      expect(items.first.request.employee.fullName, 'Jamal Uddin');
      expect(items.first.balance?.available, 6);
      expect(items.last.kind, ApprovalStepKind.hr);
      expect(items.last.request.days, 47);
      expect(items.last.balance?.isOnRequest, isTrue);
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

      final decided = await api.decideApproval(
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
      expect(decided.status, LeaveRequestStatus.approved);
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
}
