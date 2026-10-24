import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';

import '../api/api_models.dart';

/// Why no photo could be taken.
enum CameraProblem {
  /// The user refused camera access, or it is restricted; only the system
  /// settings can allow it now.
  permissionDenied,

  /// The phone has no camera the app can use.
  unavailable,

  /// Anything else the platform reported.
  failed,
}

/// Thrown by [CameraService.takeSelfie].
class CameraUnavailable implements Exception {
  const CameraUnavailable(this.problem);

  final CameraProblem problem;

  @override
  String toString() => 'CameraUnavailable(${problem.name})';
}

/// Why a punch that needs a photo was stopped before anything was sent.
enum SelfieProblem {
  /// The user backed out of the camera.
  skipped,

  /// The photo is over [PunchSelfie.maxBytes].
  tooLarge,
}

/// A punch that needs a photo, not sent; see [SelfieProblem].
class SelfieNotSent implements Exception {
  const SelfieNotSent(this.problem);

  final SelfieProblem problem;

  @override
  String toString() => 'SelfieNotSent(${problem.name})';
}

/// The front camera, for punches the workspace wants a photo with.
///
/// Widget tests replace it with a fake through [cameraServiceProvider],
/// since there is no camera under `flutter test`.
abstract interface class CameraService {
  /// Opens the camera for one photo, the front one where the phone lets the
  /// app choose. Returns `null` when the user backs out without a photo.
  /// Throws [CameraUnavailable].
  Future<PunchSelfie?> takeSelfie();

  /// Opens the app's page in the system settings, where camera access can
  /// be allowed again. Returns whether it opened.
  Future<bool> openSettings();
}

/// [CameraService] on the device, with the image_picker plugin.
///
/// The photo is scaled to at most 1024 px and saved as a JPEG at quality
/// 70, a few hundred kB: well under the API's 2 MB limit.
class ImagePickerCameraService implements CameraService {
  const ImagePickerCameraService();

  @override
  Future<PunchSelfie?> takeSelfie() async {
    final XFile? file;
    try {
      file = await ImagePicker().pickImage(
        source: ImageSource.camera,
        // A hint: some Android camera apps open the back camera anyway.
        preferredCameraDevice: CameraDevice.front,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 70,
        requestFullMetadata: false,
      );
    } on PlatformException catch (error) {
      throw CameraUnavailable(switch (error.code) {
        'camera_access_denied' ||
        'camera_access_restricted' => CameraProblem.permissionDenied,
        'no_available_camera' => CameraProblem.unavailable,
        _ => CameraProblem.failed,
      });
    }
    if (file == null) return null;
    try {
      return PunchSelfie(bytes: await file.readAsBytes());
    } on Object {
      throw const CameraUnavailable(CameraProblem.failed);
    }
  }

  // geolocator, already used for punching, can open the app's settings;
  // that saves a plugin only for this.
  @override
  Future<bool> openSettings() async {
    try {
      return await Geolocator.openAppSettings();
    } on Object {
      return false;
    }
  }
}

final cameraServiceProvider = Provider<CameraService>(
  (ref) => const ImagePickerCameraService(),
);
