import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import '../api/api_models.dart';

/// Why the phone's location could not be read.
enum LocationProblem {
  /// Location services are turned off on the phone.
  servicesOff,

  /// The user said no to the permission prompt. Asking again may work.
  permissionDenied,

  /// The permission is blocked; only the system settings can allow it.
  permissionDeniedForever,

  /// No fix arrived in time, for example indoors.
  timeout,

  /// Anything else the platform reported.
  failed,
}

/// Thrown by [LocationService.currentLocation].
class LocationUnavailable implements Exception {
  const LocationUnavailable(this.problem);

  final LocationProblem problem;

  @override
  String toString() => 'LocationUnavailable(${problem.name})';
}

/// The phone's location, for punching inside a geofence.
///
/// Widget tests replace it with a fake through [locationServiceProvider],
/// since there is no GPS or permission prompt under `flutter test`.
abstract interface class LocationService {
  /// Asks for the permission if it has not been answered yet, then reads
  /// one fix, waiting at most [timeLimit] for it. Throws
  /// [LocationUnavailable].
  Future<PunchLocation> currentLocation({required Duration timeLimit});

  /// Opens the system screen that fixes [problem]: the location settings
  /// when services are off, else the app's settings. Returns whether a
  /// screen opened.
  Future<bool> openSettings(LocationProblem problem);
}

/// [LocationService] on the device, with the geolocator plugin.
class GeolocatorLocationService implements LocationService {
  const GeolocatorLocationService();

  @override
  Future<PunchLocation> currentLocation({required Duration timeLimit}) async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        throw const LocationUnavailable(LocationProblem.servicesOff);
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      switch (permission) {
        case LocationPermission.denied:
          throw const LocationUnavailable(LocationProblem.permissionDenied);
        case LocationPermission.deniedForever:
          throw const LocationUnavailable(
            LocationProblem.permissionDeniedForever,
          );
        case LocationPermission.whileInUse ||
            LocationPermission.always ||
            LocationPermission.unableToDetermine:
          break;
      }
      final position = await Geolocator.getCurrentPosition(
        locationSettings: LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: timeLimit,
        ),
      );
      return PunchLocation(
        latitude: position.latitude,
        longitude: position.longitude,
        // Some platforms report 0 when they do not know.
        accuracyM: position.accuracy > 0 ? position.accuracy : null,
      );
    } on LocationUnavailable {
      rethrow;
    } on LocationServiceDisabledException {
      throw const LocationUnavailable(LocationProblem.servicesOff);
    } on PermissionDeniedException {
      throw const LocationUnavailable(LocationProblem.permissionDenied);
    } on TimeoutException {
      throw const LocationUnavailable(LocationProblem.timeout);
    } on Object {
      throw const LocationUnavailable(LocationProblem.failed);
    }
  }

  @override
  Future<bool> openSettings(LocationProblem problem) async {
    try {
      return problem == LocationProblem.servicesOff
          ? await Geolocator.openLocationSettings()
          : await Geolocator.openAppSettings();
    } on Object {
      return false;
    }
  }
}

final locationServiceProvider = Provider<LocationService>(
  (ref) => const GeolocatorLocationService(),
);
