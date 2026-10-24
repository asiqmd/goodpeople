import 'package:dio/dio.dart';

enum ApiErrorKind {
  /// The server answered with a non-2xx status.
  server,

  /// No response: offline, DNS failure, timeout, refused connection.
  network,

  /// A 2xx response whose body does not match the API contract.
  badResponse,
}

/// One field-level validation problem from a 400 response.
class ApiIssue {
  const ApiIssue({required this.path, required this.message});

  final String path;
  final String message;
}

/// Error thrown by [GoodPeopleApi] for every failed call.
///
/// Error bodies follow the API's shape:
/// `{"statusCode":401,"error":"Unauthorized","message":"...","issues":[...]}`.
class ApiException implements Exception {
  const ApiException({
    required this.kind,
    required this.message,
    this.statusCode,
    this.issues = const [],
  });

  factory ApiException.fromDio(DioException error) {
    final response = error.response;
    if (response == null) {
      return ApiException(
        kind: ApiErrorKind.network,
        message: error.message ?? error.type.name,
      );
    }

    var message = response.statusMessage ?? 'HTTP ${response.statusCode}';
    var issues = const <ApiIssue>[];
    final body = response.data;
    if (body is Map<String, Object?>) {
      final bodyMessage = body['message'];
      if (bodyMessage is String && bodyMessage.isNotEmpty) {
        message = bodyMessage;
      } else if (bodyMessage is List && bodyMessage.isNotEmpty) {
        message = bodyMessage.join('\n');
      }
      final rawIssues = body['issues'];
      if (rawIssues is List) {
        issues = [
          for (final issue in rawIssues)
            if (issue is Map<String, Object?>)
              ApiIssue(
                path: switch (issue['path']) {
                  final List<Object?> parts => parts.join('.'),
                  final Object? path => '${path ?? ''}',
                },
                message: '${issue['message'] ?? ''}',
              ),
        ];
      }
    }
    return ApiException(
      kind: ApiErrorKind.server,
      statusCode: response.statusCode,
      message: message,
      issues: issues,
    );
  }

  final ApiErrorKind kind;
  final int? statusCode;

  /// Human-readable message from the server (English), or a technical
  /// description for network and parsing failures.
  final String message;
  final List<ApiIssue> issues;

  bool get isUnauthorized => statusCode == 401;

  @override
  String toString() => 'ApiException(${kind.name}, $statusCode): $message';
}
