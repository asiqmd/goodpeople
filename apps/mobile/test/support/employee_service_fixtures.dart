import 'package:good_people/api/api_models.dart';

Json servicePersonJson() => {
  'id': 'employee-1',
  'employeeCode': 'MG-0005',
  'fullName': 'Rahima Khatun',
  'fullNameBn': 'রহিমা খাতুন',
};
Json engagementJson() => {
  'employee': servicePersonJson(),
  'manage': false,
  'announcements': [
    {
      'id': 'notice-1',
      'title': 'Equipment policy',
      'titleBn': 'সরঞ্জামের নীতিমালা',
      'body': 'Read the equipment care policy.',
      'bodyBn': 'সরঞ্জামের যত্নের নীতিমালা পড়ুন।',
      'status': 'published',
      'dueOn': '2030-11-10',
      'canAcknowledge': true,
      'acknowledgedAt': null,
    },
  ],
  'surveys': [
    {
      'id': 'survey-1',
      'title': 'Anonymous pulse',
      'titleBn': 'বেনামি মতামত জরিপ',
      'description': 'Your answers are anonymous.',
      'descriptionBn': 'আপনার উত্তর বেনামি থাকবে।',
      'status': 'open',
      'closesAt': '2030-11-10T11:00:00Z',
      'eligible': true,
      'submitted': false,
      'questions': [
        {
          'text': 'I have the tools I need',
          'textBn': 'কাজের প্রয়োজনীয় সরঞ্জাম পাই',
        },
      ],
    },
  ],
  'recognition': [
    {
      'id': 'recognition-1',
      'sender': {
        ...servicePersonJson(),
        'id': 'employee-2',
        'employeeCode': 'MG-0004',
        'fullName': 'Shirin Akter',
      },
      'recipient': servicePersonJson(),
      'value': 'quality',
      'message': 'Thank you for the careful work.',
      'canHide': false,
    },
  ],
};
Json employeeServicesJson() => {
  'employee': servicePersonJson(),
  'manage': false,
  'requests': [
    {
      'id': 'request-1',
      'subject': 'Employment letter',
      'category': 'letters',
      'priority': 'normal',
      'status': 'resolved',
      'employee': servicePersonJson(),
      'messages': [
        {
          'id': 'first',
          'authorName': 'Rahima',
          'body': 'Please prepare my letter.',
          'internal': false,
        },
        {
          'id': 'private',
          'authorName': 'HR',
          'body': 'Internal confidential note',
          'internal': true,
        },
      ],
    },
  ],
  'issues': [
    {
      'id': 'issue-1',
      'asset': {
        'tag': 'GP-ID-01',
        'name': 'Staff ID card',
        'nameBn': 'কর্মী পরিচয়পত্র',
      },
      'issuedOn': '2026-11-01',
      'dueOn': '2030-11-01',
      'returnedOn': null,
      'issueCondition': 'New and intact',
      'overdue': false,
      'canAcknowledge': true,
      'acknowledgedAt': null,
    },
  ],
};
