import 'package:flutter/material.dart';

import '../api/api_exception.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../ui/error_text.dart';

String serviceStatus(AppLocalizations l, String status) => switch (status) {
  'draft' => l.serviceStatesDraft,
  'open' => l.serviceStatesOpen,
  'in_progress' => l.serviceStatesInProgress,
  'resolved' => l.serviceStatesResolved,
  'closed' => l.serviceStatesClosed,
  'published' => l.serviceStatesPublished,
  'retired' => l.serviceStatesRetired,
  _ => l.serviceUnknown,
};
String serviceError(AppLocalizations l, Object error) => switch (error) {
  ApiException(code: 'survey_closed') => l.serviceErrorsSurveyClosed,
  ApiException(code: 'survey_submitted') => l.serviceErrorsSurveySubmitted,
  ApiException(code: 'survey_answers') => l.serviceErrorsSurveyAnswers,
  ApiException(code: 'recognition_self') => l.serviceErrorsRecognitionSelf,
  ApiException(code: 'announcement_fixed') => l.serviceErrorsAnnouncementFixed,
  ApiException(code: 'hr_request_closed') => l.serviceErrorsHrRequestClosed,
  ApiException(code: 'hr_request_transition') =>
    l.serviceErrorsHrRequestTransition,
  ApiException(code: 'asset_returned') => l.serviceErrorsAssetReturned,
  ApiException(code: 'service_employee_required') =>
    l.serviceErrorsServiceEmployeeRequired,
  _ => describeError(l, error),
};

class ServiceInput {
  const ServiceInput(
    this.name,
    this.label, {
    this.choices,
    this.long = false,
    this.maxLength = 160,
    this.minLength = 2,
  });
  final String name, label;
  final Map<String, String>? choices;
  final bool long;
  final int minLength, maxLength;
}

Future<bool?> showServiceForm(
  BuildContext context, {
  required String title,
  String? note,
  required List<ServiceInput> fields,
  required Future<void> Function(Map<String, String>) submit,
}) => showDialog<bool>(
  context: context,
  barrierDismissible: false,
  builder: (_) =>
      _ServiceForm(title: title, note: note, fields: fields, submit: submit),
);

class _ServiceForm extends StatefulWidget {
  const _ServiceForm({
    required this.title,
    this.note,
    required this.fields,
    required this.submit,
  });
  final String title;
  final String? note;
  final List<ServiceInput> fields;
  final Future<void> Function(Map<String, String>) submit;
  @override
  State<_ServiceForm> createState() => _ServiceFormState();
}

class _ServiceFormState extends State<_ServiceForm> {
  final _form = GlobalKey<FormState>();
  final _values = <String, String>{};
  final _controllers = <String, TextEditingController>{};
  @override
  void initState() {
    super.initState();
    for (final field in widget.fields) {
      if (field.choices == null) {
        _controllers[field.name] = TextEditingController();
      }
    }
  }

  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  bool _busy = false;
  Object? _error;
  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.submit(Map.unmodifiable(_values));
      if (mounted) Navigator.of(context).pop(true);
    } on SessionExpiredException {
      if (mounted) Navigator.of(context).pop(false);
    } on Object catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return PopScope(
      canPop: !_busy,
      child: AlertDialog(
        title: Text(widget.title),
        content: SizedBox(
          width: 380,
          child: SingleChildScrollView(
            child: Form(
              key: _form,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (widget.note != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: Text(widget.note!),
                    ),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(
                        serviceError(l, _error!),
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),
                  for (final field in widget.fields)
                    Padding(
                      key: ValueKey('service-container-${field.name}'),
                      padding: const EdgeInsets.only(bottom: 12),
                      child: field.choices != null
                          ? DropdownButtonFormField<String>(
                              key: ValueKey('service-field-${field.name}'),
                              initialValue: _values[field.name],
                              isExpanded: true,
                              decoration: InputDecoration(
                                labelText: field.label,
                              ),
                              items: field.choices!.entries
                                  .map(
                                    (v) => DropdownMenuItem(
                                      value: v.key,
                                      child: Text(v.value),
                                    ),
                                  )
                                  .toList(),
                              onChanged: _busy
                                  ? null
                                  : (value) =>
                                        _values[field.name] = value ?? '',
                              validator: (value) =>
                                  value == null || value.isEmpty
                                  ? l.serviceFieldRequired
                                  : null,
                            )
                          : TextFormField(
                              key: ValueKey('service-field-${field.name}'),
                              controller: _controllers[field.name],
                              decoration: InputDecoration(
                                labelText: field.label,
                              ),
                              enabled: !_busy,
                              minLines: field.long ? 3 : 1,
                              maxLines: field.long ? 6 : 1,
                              maxLength: field.maxLength,
                              onChanged: (value) =>
                                  _values[field.name] = value.trim(),
                              validator: (value) =>
                                  (value?.trim().length ?? 0) < field.minLength
                                  ? l.serviceFieldRequired
                                  : null,
                            ),
                    ),
                ],
              ),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: _busy ? null : () => Navigator.of(context).pop(false),
            child: Text(l.serviceCancel),
          ),
          FilledButton(
            onPressed: _busy ? null : _save,
            child: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(widget.title),
          ),
        ],
      ),
    );
  }
}
