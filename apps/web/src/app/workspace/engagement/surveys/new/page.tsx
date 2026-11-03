import { getTranslations } from 'next-intl/server';
import { SurveyForm } from '@/components/employee-services/forms';
import { ServiceHead } from '@/components/employee-services/views';
import { Card } from '@/components/ui';
import { serviceOrg } from '@/lib/employee-services';
export default async function NewSurveyPage() {
  const org = await serviceOrg('engagement.manage'),
    t = await getTranslations('services');
  return (
    <>
      <ServiceHead area="engagement" title={t('newSurvey')} />
      <Card>
        <SurveyForm org={org} />
      </Card>
    </>
  );
}
