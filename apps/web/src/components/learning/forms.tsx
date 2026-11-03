'use client';
import {
  LEARNING_CATEGORIES,
  type LearningCourseView,
  type LearningSessionView,
  type OrgSnapshot,
} from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { saveLearning, type LearningAction } from '@/app/actions/learning';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText, Form, SubmitButton } from '@/components/forms';
import { Banner, Field, inputClass } from '@/components/ui';
export function LearningForm({
  kind,
  id,
  children,
  label,
}: {
  kind: LearningAction;
  id?: string;
  children: React.ReactNode;
  label: string;
}) {
  const [state, action] = useActionState<ActionState<unknown>, FormData>(
    saveLearning.bind(null, kind, id),
    undefined,
  );
  const t = useTranslations('learning');
  return (
    <Form action={action} state={state} className="space-y-4">
      {state?.error && (
        <Banner tone="red">
          {state.code && t.has(`errors.${state.code}`) ? (
            t(`errors.${state.code}`)
          ) : (
            <ErrorText state={state} />
          )}{' '}
          {state.issues?.map((i) => (
            <p key={i.path}>
              {i.path}: {i.message}
            </p>
          ))}
        </Banner>
      )}
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      {children}
      <SubmitButton>{label}</SubmitButton>
    </Form>
  );
}
export function CourseForm() {
  const t = useTranslations('learning');
  return (
    <LearningForm kind="course" label={t('createCourse')}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('code')}>
          <input name="code" pattern="[A-Z0-9_-]{2,30}" required className={inputClass} />
        </Field>
        <Field label={t('nameEn')}>
          <input name="name" required minLength={2} maxLength={160} className={inputClass} />
        </Field>
        <Field label={t('nameBn')}>
          <input
            name="nameBn"
            required
            minLength={2}
            maxLength={160}
            lang="bn"
            className={inputClass}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('category')}>
          <select name="category" className={inputClass}>
            {LEARNING_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`categories.${c}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('validityMonths')} hint={t('validityHint')}>
          <input name="validityMonths" type="number" min="1" max="120" className={inputClass} />
        </Field>
        <Field label={t('descriptionEn')}>
          <textarea name="description" maxLength={4000} className={inputClass} />
        </Field>
        <Field label={t('descriptionBn')}>
          <textarea name="descriptionBn" lang="bn" maxLength={4000} className={inputClass} />
        </Field>
      </div>
    </LearningForm>
  );
}
export function CompanySite({
  org,
  siteRequired = false,
}: {
  org: OrgSnapshot;
  siteRequired?: boolean;
}) {
  const t = useTranslations('learning');
  const [company, setCompany] = useState(org.legalEntities.filter((e) => e.isActive)[0]?.id ?? '');
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('company')}>
        <select
          name="legalEntityId"
          required
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className={inputClass}
        >
          {org.legalEntities
            .filter((e) => e.isActive)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label={t('site')}>
        <select key={company} name="locationId" required={siteRequired} className={inputClass}>
          {!siteRequired && <option value="">{t('allSites')}</option>}
          {org.locations
            .filter((l) => l.legalEntityId === company && l.isActive)
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
        </select>
      </Field>
    </div>
  );
}
function CourseSelect({ courses }: { courses: LearningCourseView[] }) {
  const t = useTranslations('learning');
  return (
    <Field label={t('course')}>
      <select name="courseId" required className={inputClass}>
        {courses
          .filter((c) => c.isActive)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.nameBn}
            </option>
          ))}
      </select>
    </Field>
  );
}
export function SessionForm({ org, courses }: { org: OrgSnapshot; courses: LearningCourseView[] }) {
  const t = useTranslations('learning');
  return (
    <LearningForm kind="session" label={t('createSession')}>
      <CourseSelect courses={courses} />
      <CompanySite org={org} />
      <p className="text-xs text-slate-500">{t('dhakaTime')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {['startsAt', 'endsAt'].map((k) => (
          <Field key={k} label={t(k)}>
            <input name={k} type="datetime-local" required className={inputClass} />
          </Field>
        ))}
        <Field label={t('trainer')}>
          <input name="trainer" required minLength={2} maxLength={160} className={inputClass} />
        </Field>
        <Field label={t('venue')}>
          <input name="venue" required minLength={2} maxLength={300} className={inputClass} />
        </Field>
        <Field label={t('capacity')}>
          <input name="capacity" type="number" min="1" max="5000" required className={inputClass} />
        </Field>
      </div>
    </LearningForm>
  );
}
export function RequirementForm({
  org,
  courses,
}: {
  org: OrgSnapshot;
  courses: LearningCourseView[];
}) {
  const t = useTranslations('learning');
  return (
    <LearningForm kind="requirement" label={t('createRequirement')}>
      <CourseSelect courses={courses} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('company')}>
          <select name="legalEntityId" required className={inputClass}>
            {org.legalEntities
              .filter((e) => e.isActive)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label={t('designation')}>
          <select name="designationId" required className={inputClass}>
            {org.designations
              .filter((d) => d.isActive)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label={t('effectiveFrom')}>
          <input name="effectiveFrom" type="date" required className={inputClass} />
        </Field>
        <Field label={t('effectiveTo')}>
          <input name="effectiveTo" type="date" className={inputClass} />
        </Field>
        <Field label={t('graceDays')} hint={t('graceHint')}>
          <input
            name="graceDays"
            type="number"
            min="0"
            max="365"
            defaultValue="30"
            required
            className={inputClass}
          />
        </Field>
      </div>
    </LearningForm>
  );
}
export function DrillForm({ org }: { org: OrgSnapshot }) {
  const t = useTranslations('learning');
  return (
    <LearningForm kind="drill" label={t('recordDrill')}>
      <CompanySite org={org} siteRequired />
      <div className="grid gap-4 sm:grid-cols-2">
        {['heldOn', 'nextDueOn'].map((k) => (
          <Field key={k} label={t(k)}>
            <input name={k} type="date" required className={inputClass} />
          </Field>
        ))}
        {['participants', 'evacuationSeconds'].map((k) => (
          <Field key={k} label={t(k)}>
            <input
              name={k}
              type="number"
              min="1"
              max={k === 'participants' ? 100000 : 86400}
              required
              className={inputClass}
            />
          </Field>
        ))}
      </div>
      <Field label={t('conductor')}>
        <input name="conductor" required minLength={2} maxLength={160} className={inputClass} />
      </Field>
      {['findings', 'actions'].map((k) => (
        <Field key={k} label={t(k)}>
          <textarea name={k} minLength={5} maxLength={4000} required className={inputClass} />
        </Field>
      ))}
    </LearningForm>
  );
}
export function AttendanceForm({ session }: { session: LearningSessionView }) {
  const t = useTranslations('learning');
  return (
    <LearningForm kind="attendance" id={session.id} label={t('completeSession')}>
      <p className="text-sm text-slate-600">{t('completeHint')}</p>
      {session.attendance
        .filter((a) => a.status === 'enrolled')
        .map((a, i) => (
          <Field key={a.employee.id} label={`${a.employee.employeeCode} · ${a.employee.fullName}`}>
            <input type="hidden" name={`attendance.${i}.employeeId`} value={a.employee.id} />
            <select name={`attendance.${i}.status`} required defaultValue="" className={inputClass}>
              <option value="" disabled>
                {t('chooseAttendance')}
              </option>
              <option value="attended">{t('attendance.attended')}</option>
              <option value="absent">{t('attendance.absent')}</option>
            </select>
          </Field>
        ))}
      <Field label={t('attendanceNote')}>
        <textarea name="note" required minLength={5} maxLength={500} className={inputClass} />
      </Field>
    </LearningForm>
  );
}
export function ReasonForm({
  kind,
  id,
}: {
  kind: 'cancel' | 'revoke' | 'void' | 'retire';
  id: string;
}) {
  const t = useTranslations('learning');
  return (
    <LearningForm kind={kind} id={id} label={t(kind)}>
      {kind === 'retire' && (
        <Field label={t('effectiveTo')}>
          <input name="effectiveTo" type="date" required className={inputClass} />
        </Field>
      )}
      <Field label={t('reason')}>
        <input name="reason" required minLength={5} maxLength={500} className={inputClass} />
      </Field>
    </LearningForm>
  );
}
export function EnrolForm({ id, staff = false }: { id: string; staff?: boolean }) {
  const t = useTranslations('learning');
  return (
    <LearningForm kind="enrol" id={id} label={t(staff ? 'enrolEmployee' : 'enrol')}>
      {staff && (
        <Field label={t('employeeCode')}>
          <input name="employeeCode" maxLength={40} required className={inputClass} />
        </Field>
      )}
    </LearningForm>
  );
}
