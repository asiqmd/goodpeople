import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../auth/auth_controller.dart';

/// What waits for the signed-in login on the Performance screen, their
/// goals in numbers and their reviews.
final performanceMeProvider = FutureProvider.autoDispose<PerformanceMe>((ref) {
  _requireSession(ref);
  return ref.read(authProvider.notifier).fetchPerformanceMe();
}, retry: _noRetry);

/// The home screen's badge on Performance: how many tasks wait.
///
/// 0 without the workspace's `performance` feature (nothing is asked), and
/// for a 403 or 404: the plan lost the feature, or an older API.
final performanceTasksProvider = FutureProvider.autoDispose<int>((ref) async {
  _requireSession(ref);
  final access = await ref.watch(tenantAccessProvider.future);
  if (!access.access.hasFeature('performance')) return 0;
  try {
    return (await ref.watch(performanceMeProvider.future)).tasks;
  } on ApiException catch (error) {
    if (error.statusCode == 403 || error.statusCode == 404) return 0;
    rethrow;
  }
}, retry: _noRetry);

/// The login's own goals. Submitting drafts for agreement tells the manager
/// and changes no goal, so it does not reload them.
final myGoalsProvider = FutureProvider.autoDispose<MyGoals>((ref) {
  _requireSession(ref);
  return ref.read(authProvider.notifier).fetchMyGoals();
}, retry: _noRetry);

/// The goals of the people below the login, for agreeing their drafts.
/// Agreeing reloads them, and the Performance screen's tasks.
final teamGoalsProvider =
    AsyncNotifierProvider.autoDispose<TeamGoalsController, TeamGoals>(
      TeamGoalsController.new,
      retry: _noRetry,
    );

class TeamGoalsController extends AsyncNotifier<TeamGoals> {
  @override
  Future<TeamGoals> build() {
    _requireSession(ref);
    return ref.read(authProvider.notifier).fetchTeamGoals();
  }

  Future<void> agree(String goalId) async {
    await ref.read(authProvider.notifier).agreeGoal(goalId);
    _agreed();
  }

  /// Every draft of one person for a cycle (`null`: outside any cycle).
  Future<void> agreeAll(String employeeId, String? cycleId) async {
    await ref
        .read(authProvider.notifier)
        .agreeAllGoals(employeeId: employeeId, cycleId: cycleId);
    _agreed();
  }

  void _agreed() {
    ref.invalidateSelf();
    ref.invalidate(performanceMeProvider);
  }
}

/// One goal with its check-ins. A check-in or an agreement puts the API's
/// answer in place without another call.
final goalProvider = AsyncNotifierProvider.autoDispose
    .family<GoalController, GoalDetail, String>(
      GoalController.new,
      retry: _noRetry,
    );

class GoalController extends AsyncNotifier<GoalDetail> {
  GoalController(this.goalId);

  final String goalId;

  @override
  Future<GoalDetail> build() {
    _requireSession(ref);
    return ref.read(authProvider.notifier).fetchGoal(goalId);
  }

  /// The lists and the Performance screen show the goal's progress, so they
  /// reload.
  Future<void> checkin(GoalCheckinDraft draft) async {
    state = AsyncData(
      await ref.read(authProvider.notifier).checkinGoal(goalId, draft),
    );
    ref
      ..invalidate(myGoalsProvider)
      ..invalidate(teamGoalsProvider)
      ..invalidate(performanceMeProvider);
  }

  Future<void> agree() async {
    state = AsyncData(await ref.read(authProvider.notifier).agreeGoal(goalId));
    ref
      ..invalidate(teamGoalsProvider)
      ..invalidate(performanceMeProvider);
  }
}

/// One review, as the login may see it. Saving the self review or
/// acknowledging puts the API's answer in place without another call.
final reviewProvider = AsyncNotifierProvider.autoDispose
    .family<ReviewController, ReviewDetail, String>(
      ReviewController.new,
      retry: _noRetry,
    );

class ReviewController extends AsyncNotifier<ReviewDetail> {
  ReviewController(this.reviewId);

  final String reviewId;

  @override
  Future<ReviewDetail> build() {
    _requireSession(ref);
    return ref.read(authProvider.notifier).fetchReview(reviewId);
  }

  /// A draft changes nothing the Performance screen shows; a submitted self
  /// review is one task fewer.
  Future<void> saveSelf(SelfReviewDraft draft) async {
    state = AsyncData(
      await ref.read(authProvider.notifier).saveSelfReview(reviewId, draft),
    );
    if (draft.submit) ref.invalidate(performanceMeProvider);
  }

  Future<void> acknowledge(AcknowledgementDraft draft) async {
    state = AsyncData(
      await ref.read(authProvider.notifier).acknowledgeReview(reviewId, draft),
    );
    ref.invalidate(performanceMeProvider);
  }
}

/// Feedback the login is asked for, and, for a manager, peers waiting for
/// their approval. A decision reloads it, and the Performance screen's
/// tasks.
final peerInboxProvider =
    AsyncNotifierProvider.autoDispose<PeerInboxController, PeerInbox>(
      PeerInboxController.new,
      retry: _noRetry,
    );

class PeerInboxController extends AsyncNotifier<PeerInbox> {
  @override
  Future<PeerInbox> build() {
    _requireSession(ref);
    return ref.read(authProvider.notifier).fetchPeerInbox();
  }

  Future<void> decide(String peerId, {required bool approve}) async {
    await ref.read(authProvider.notifier).decidePeer(peerId, approve: approve);
    ref
      ..invalidateSelf()
      ..invalidate(performanceMeProvider);
  }
}

/// One request for the login's feedback. Answering puts the API's answer in
/// place, and the inbox and the Performance screen reload.
final peerRequestProvider = AsyncNotifierProvider.autoDispose
    .family<PeerRequestController, PeerRequest, String>(
      PeerRequestController.new,
      retry: _noRetry,
    );

class PeerRequestController extends AsyncNotifier<PeerRequest> {
  PeerRequestController(this.peerId);

  final String peerId;

  @override
  Future<PeerRequest> build() {
    _requireSession(ref);
    return ref.read(authProvider.notifier).fetchPeerRequest(peerId);
  }

  Future<void> answer(PeerAnswerDraft draft) async {
    state = AsyncData(
      await ref.read(authProvider.notifier).answerPeerRequest(peerId, draft),
    );
    ref
      ..invalidate(peerInboxProvider)
      ..invalidate(performanceMeProvider);
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
