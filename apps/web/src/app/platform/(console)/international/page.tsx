import { getTranslations } from 'next-intl/server';
import { load } from '@/lib/api';
import { Card, Banner } from '@/components/ui';
import { CommercialPriceForm } from '@/components/commercial-price-form';
export default async function InternationalPriceBook() {
  const t = await getTranslations('international.priceBook');
  const data = await load<{
    prices: {
      id: string;
      planCode: string;
      currency: string;
      seatPrice: string;
      effectiveFrom: string;
      merchantProduct: string;
      merchantPrice: string;
    }[];
  }>('platform', '/platform/international/prices');
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <Banner tone="amber">{t('gate')}</Banner>
      <Card>
        <CommercialPriceForm />
      </Card>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {[
                  'plan',
                  'currency',
                  'seatPrice',
                  'effectiveFrom',
                  'merchantProduct',
                  'merchantPrice',
                ].map((key) => (
                  <th key={key} className="p-2 text-start">
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.prices.map((p) => (
                <tr className="border-t" key={p.id}>
                  {[
                    p.planCode,
                    p.currency,
                    p.seatPrice,
                    p.effectiveFrom,
                    p.merchantProduct,
                    p.merchantPrice,
                  ].map((value, index) => (
                    <td key={index} className="p-2">
                      <bdi>{value}</bdi>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
