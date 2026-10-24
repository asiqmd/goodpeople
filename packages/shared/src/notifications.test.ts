import { describe, expect, it } from 'vitest';
import { userCreateSchema } from './account-schemas.js';
import { smsSegments } from './notifications.js';
import { can, ROLE_PERMISSIONS } from './permissions.js';

describe('smsSegments', () => {
  it('counts plain English as GSM-7: 160 in one message, 153 per part after that', () => {
    expect(smsSegments('')).toBe(0);
    expect(smsSegments('a'.repeat(160))).toBe(1);
    expect(smsSegments('a'.repeat(161))).toBe(2);
    expect(smsSegments('a'.repeat(306))).toBe(2);
    expect(smsSegments('a'.repeat(307))).toBe(3);
  });

  it('counts the extended characters twice', () => {
    expect(smsSegments('€'.repeat(80))).toBe(1);
    expect(smsSegments('€'.repeat(81))).toBe(2);
  });

  it('counts Bangla as Unicode: 70 in one message, 67 per part', () => {
    expect(smsSegments('ক'.repeat(70))).toBe(1);
    expect(smsSegments('ক'.repeat(71))).toBe(2);
    expect(smsSegments(`Code ${'ক'}`)).toBe(1);
  });
});

describe('role templates', () => {
  it('gives workspace admins everything and employees nothing extra', () => {
    expect(can('tenant_admin', 'users.manage')).toBe(true);
    expect(can('hr_admin', 'users.manage')).toBe(false);
    expect(can('hr_officer', 'employees.identity')).toBe(true);
    expect(can('attendance_officer', 'employees.identity')).toBe(false);
    expect(can('auditor', 'employees.write')).toBe(false);
    expect(ROLE_PERMISSIONS.employee).toEqual([]);
    expect(can(undefined, 'employees.read')).toBe(false);
  });
});

describe('userCreateSchema', () => {
  it('lets employees sign in with a mobile number only, but not staff', () => {
    const phoneOnly = { name: 'Rina Begum', phone: '01712345678' };
    expect(userCreateSchema.parse({ ...phoneOnly, role: 'employee' }).phone).toBe('+8801712345678');
    expect(userCreateSchema.safeParse({ ...phoneOnly, role: 'hr_officer' }).success).toBe(false);
    expect(userCreateSchema.safeParse({ name: 'Nobody', role: 'employee' }).success).toBe(false);
  });
});
