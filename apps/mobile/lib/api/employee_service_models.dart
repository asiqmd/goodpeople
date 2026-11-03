part of 'api_models.dart';

class ServicePerson {
  ServicePerson.fromJson(Json j)
    : id = _read<String>(j, 'id'),
      code = _read<String>(j, 'employeeCode'),
      name = _read<String>(j, 'fullName'),
      nameBn = _read<String?>(j, 'fullNameBn');
  final String id, code, name;
  final String? nameBn;
}

class ServiceQuestion {
  ServiceQuestion.fromJson(Json j)
    : text = _read<String>(j, 'text'),
      textBn = _read<String>(j, 'textBn');
  final String text, textBn;
}

class EmployeeSurvey {
  EmployeeSurvey.fromJson(Json j)
    : id = _read<String>(j, 'id'),
      title = _read<String>(j, 'title'),
      titleBn = _read<String>(j, 'titleBn'),
      description = _read<String>(j, 'description'),
      descriptionBn = _read<String>(j, 'descriptionBn'),
      status = _read<String>(j, 'status'),
      closesAt = _readTimestamp(j, 'closesAt'),
      eligible = _read<bool>(j, 'eligible'),
      submitted = _read<bool>(j, 'submitted'),
      questions = _readList(j, 'questions', ServiceQuestion.fromJson);
  final String id, title, titleBn, description, descriptionBn, status;
  final DateTime closesAt;
  final bool eligible, submitted;
  final List<ServiceQuestion> questions;
}

class CompanyNotice {
  CompanyNotice.fromJson(Json j)
    : id = _read<String>(j, 'id'),
      title = _read<String>(j, 'title'),
      titleBn = _read<String>(j, 'titleBn'),
      body = _read<String>(j, 'body'),
      bodyBn = _read<String>(j, 'bodyBn'),
      status = _read<String>(j, 'status'),
      dueOn = _readOptionalDate(j, 'dueOn'),
      canAcknowledge = _read<bool>(j, 'canAcknowledge'),
      acknowledgedAt = _readOptionalTimestamp(j, 'acknowledgedAt');
  final String id, title, titleBn, body, bodyBn, status;
  final bool canAcknowledge;
  final DateTime? dueOn, acknowledgedAt;
}

class ColleagueRecognition {
  ColleagueRecognition.fromJson(Json j)
    : id = _read<String>(j, 'id'),
      sender = ServicePerson.fromJson(_read<Json>(j, 'sender')),
      recipient = ServicePerson.fromJson(_read<Json>(j, 'recipient')),
      value = _read<String>(j, 'value'),
      message = _read<String>(j, 'message'),
      canHide = _read<bool>(j, 'canHide');
  final String id, value, message;
  final ServicePerson sender, recipient;
  final bool canHide;
}

class EngagementOverview {
  EngagementOverview.fromJson(Json j)
    : employee = j['employee'] == null
          ? null
          : ServicePerson.fromJson(_read<Json>(j, 'employee')),
      manage = _read<bool>(j, 'manage'),
      surveys = _readList(j, 'surveys', EmployeeSurvey.fromJson),
      announcements = _readList(j, 'announcements', CompanyNotice.fromJson),
      recognition = _readList(j, 'recognition', ColleagueRecognition.fromJson);
  final ServicePerson? employee;
  final bool manage;
  final List<EmployeeSurvey> surveys;
  final List<CompanyNotice> announcements;
  final List<ColleagueRecognition> recognition;
}

class HrServiceMessage {
  HrServiceMessage.fromJson(Json j)
    : id = _read<String>(j, 'id'),
      authorName = _read<String>(j, 'authorName'),
      body = _read<String>(j, 'body'),
      internal = _read<bool>(j, 'internal');
  final String id, authorName, body;
  final bool internal;
}

class HrServiceRequest {
  HrServiceRequest.fromJson(Json j)
    : id = _read<String>(j, 'id'),
      subject = _read<String>(j, 'subject'),
      category = _read<String>(j, 'category'),
      priority = _read<String>(j, 'priority'),
      status = _read<String>(j, 'status'),
      employee = ServicePerson.fromJson(_read<Json>(j, 'employee')),
      messages = _readList(j, 'messages', HrServiceMessage.fromJson);
  final String id, subject, category, priority, status;
  final ServicePerson employee;
  final List<HrServiceMessage> messages;
}

class EmployeeAssetIssue {
  EmployeeAssetIssue.fromJson(Json j)
    : id = _read<String>(j, 'id'),
      tag = _read<String>(_read<Json>(j, 'asset'), 'tag'),
      name = _read<String>(_read<Json>(j, 'asset'), 'name'),
      nameBn = _read<String>(_read<Json>(j, 'asset'), 'nameBn'),
      issuedOn = _readDate(j, 'issuedOn'),
      dueOn = _readOptionalDate(j, 'dueOn'),
      returnedOn = _readOptionalDate(j, 'returnedOn'),
      condition = _read<String>(j, 'issueCondition'),
      overdue = _read<bool>(j, 'overdue'),
      canAcknowledge = _read<bool>(j, 'canAcknowledge'),
      acknowledgedAt = _readOptionalTimestamp(j, 'acknowledgedAt');
  final String id, tag, name, nameBn, condition;
  final DateTime issuedOn;
  final DateTime? dueOn, returnedOn, acknowledgedAt;
  final bool overdue, canAcknowledge;
}

class EmployeeServicesOverview {
  EmployeeServicesOverview.fromJson(Json j)
    : employee = j['employee'] == null
          ? null
          : ServicePerson.fromJson(_read<Json>(j, 'employee')),
      manage = _read<bool>(j, 'manage'),
      requests = _readList(j, 'requests', HrServiceRequest.fromJson),
      issues = _readList(j, 'issues', EmployeeAssetIssue.fromJson);
  final ServicePerson? employee;
  final bool manage;
  final List<HrServiceRequest> requests;
  final List<EmployeeAssetIssue> issues;
}
