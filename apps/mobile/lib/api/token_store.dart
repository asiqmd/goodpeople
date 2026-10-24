import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_models.dart';

/// Where the signed-in user's tokens live.
///
/// Phase 0 keeps them in memory only, so a restart signs the user out.
/// Phase 1 replaces [InMemoryTokenStore] with a `flutter_secure_storage`
/// implementation (Keychain on iOS, Keystore on Android). The interface is
/// already async so that swap does not change any caller.
abstract interface class TokenStore {
  Future<AuthTokens?> read();

  Future<void> write(AuthTokens tokens);

  Future<void> clear();
}

class InMemoryTokenStore implements TokenStore {
  AuthTokens? _tokens;

  @override
  Future<AuthTokens?> read() async => _tokens;

  @override
  Future<void> write(AuthTokens tokens) async => _tokens = tokens;

  @override
  Future<void> clear() async => _tokens = null;
}

final tokenStoreProvider = Provider<TokenStore>((ref) => InMemoryTokenStore());
