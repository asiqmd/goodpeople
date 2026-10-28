import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../auth/auth_controller.dart';

/// How many interviews need the signed-in login: still to come, or over
/// without their scorecard. The home screen offers Interviews only when it
/// is above 0.
///
/// 0 without the workspace's `recruitment` feature (nothing is asked), and
/// for a 403 or 404: the plan lost the feature, or an older API.
final interviewsToDoProvider = FutureProvider.autoDispose<int>((ref) async {
  _requireSession(ref);
  final access = await ref.watch(tenantAccessProvider.future);
  if (!access.access.hasFeature('recruitment')) return 0;
  try {
    final me = await ref.read(authProvider.notifier).fetchRecruitmentMe();
    return me.interviews;
  } on ApiException catch (error) {
    if (error.statusCode == 403 || error.statusCode == 404) return 0;
    rethrow;
  }
}, retry: _noRetry);

/// The signed-in login's interviews, to come and past.
final myInterviewsProvider = FutureProvider.autoDispose<MyInterviews>((ref) {
  _requireSession(ref);
  return ref.read(authProvider.notifier).fetchMyInterviews();
}, retry: _noRetry);

/// One of the login's interviews, with their scorecard and, once it is in,
/// the other interviewers'. Submitting a scorecard puts the API's answer in
/// place without another call.
final myInterviewProvider = AsyncNotifierProvider.autoDispose
    .family<InterviewController, MyInterviewDetail, String>(
      InterviewController.new,
      retry: _noRetry,
    );

class InterviewController extends AsyncNotifier<MyInterviewDetail> {
  InterviewController(this.interviewId);

  final String interviewId;

  @override
  Future<MyInterviewDetail> build() {
    _requireSession(ref);
    return ref.read(authProvider.notifier).fetchMyInterview(interviewId);
  }

  /// Sends the scorecard and shows the interview as the API answers it.
  /// The list and the home screen's count change with it, so they reload.
  Future<void> submit(ScorecardDraft draft) async {
    final detail = await ref
        .read(authProvider.notifier)
        .submitScorecard(interviewId, draft);
    state = AsyncData(detail);
    ref
      ..invalidate(myInterviewsProvider)
      ..invalidate(interviewsToDoProvider);
  }
}

/// Rebuilds when the session changes, and fails once it has ended, like
/// [tenantAccessProvider].
void _requireSession(Ref ref) {
  if (ref.watch(authProvider) is! SignedIn) {
    throw const SessionExpiredException();
  }
}

/// Retries go through the refresh logic in AuthController, not Riverpod's
/// backoff.
Duration? _noRetry(int retryCount, Object error) => null;
