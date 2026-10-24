import 'dart:math';

final _secure = Random.secure();

/// A random UUID version 4 (RFC 9562), lower case, for example
/// `3b241101-e2bb-4255-8caf-4136c566a962`.
///
/// Uses a cryptographically secure generator unless [random] is given, so
/// ids the app picks (such as an offline punch's `clientId`) do not collide.
String uuidV4([Random? random]) {
  final source = random ?? _secure;
  final bytes = List<int>.generate(16, (_) => source.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC variant
  final hex = [for (final byte in bytes) byte.toRadixString(16).padLeft(2, '0')]
      .join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

/// What [uuidV4] makes: a version 4, RFC-variant UUID.
final uuidV4Pattern = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
);
