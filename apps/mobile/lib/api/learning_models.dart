part of 'api_models.dart';

class LearningSession {
  LearningSession.fromJson(Json j)
    : id = _read<String>(j, 'id'),
      courseName = _read<String>(_read<Json>(j, 'course'), 'name'),
      courseNameBn = _read<String>(_read<Json>(j, 'course'), 'nameBn'),
      startsAt = _readTimestamp(j, 'startsAt'),
      venue = _read<String>(j, 'venue'),
      status = _read<String>(j, 'status'),
      myStatus = _read<String?>(j, 'myStatus'),
      canEnrol = _read<bool>(j, 'canEnrol'),
      canWithdraw = _read<bool>(j, 'canWithdraw');
  final String id, courseName, courseNameBn, venue, status;
  final String? myStatus;
  final DateTime startsAt;
  final bool canEnrol, canWithdraw;
}

class LearningCertificate {
  LearningCertificate.fromJson(Json j)
    : id = _read<String>(j, 'id'),
      courseName = _read<String>(j, 'courseName'),
      courseNameBn = _read<String>(j, 'courseNameBn'),
      completedOn = _readDate(j, 'completedOn'),
      expiresOn = _readOptionalDate(j, 'expiresOn'),
      revokedAt = _readOptionalTimestamp(j, 'revokedAt');
  final String id, courseName, courseNameBn;
  final DateTime completedOn;
  final DateTime? expiresOn, revokedAt;
}

class LearningRequirement {
  LearningRequirement.fromJson(Json j)
    : courseName = _read<String>(_read<Json>(j, 'course'), 'name'),
      courseNameBn = _read<String>(_read<Json>(j, 'course'), 'nameBn'),
      state = _read<String>(j, 'state'),
      dueOn = _readDate(j, 'dueOn');
  final String courseName, courseNameBn, state;
  final DateTime dueOn;
}

class LearningMe {
  LearningMe.fromJson(Json j)
    : manage = _read<bool>(j, 'manage'),
      sessions = _readList(j, 'sessions', LearningSession.fromJson),
      certificates = _readList(j, 'certificates', LearningCertificate.fromJson),
      requirements = _readList(j, 'requirements', LearningRequirement.fromJson);
  final bool manage;
  final List<LearningSession> sessions;
  final List<LearningCertificate> certificates;
  final List<LearningRequirement> requirements;
}
