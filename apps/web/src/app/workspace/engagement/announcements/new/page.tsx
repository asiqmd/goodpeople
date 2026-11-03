import { getTranslations } from 'next-intl/server';
import { AnnouncementForm } from '@/components/employee-services/forms';
import { ServiceHead } from '@/components/employee-services/views';
import { Card } from '@/components/ui';
import { serviceOrg } from '@/lib/employee-services';
export default async function NewAnnouncementPage() {
  const org = await serviceOrg('engagement.manage'),
    t = await getTranslations('services');
  return (
    <>
      <ServiceHead area="engagement" title={t('newAnnouncement')} />
      <Card>
        <AnnouncementForm org={org} />
      </Card>
    </>
  );
}
