'use client'

import { Check, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactElement } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PlanConfig {
  id: 'basic' | 'premium' | 'premiumPlus'
  priceKey: 'plans.basic.price' | 'plans.premium.price' | 'plans.premiumPlus.price'
  priceId: string
  highlight?: boolean
  featureCount: number
}

const planConfigs: PlanConfig[] = [
  {
    id: 'basic',
    priceKey: 'plans.basic.price',
    priceId: 'price_1SJptU2Ms5Y6lijdJ9KLIrMU',
    featureCount: 7,
  },
  {
    id: 'premium',
    priceKey: 'plans.premium.price',
    priceId: 'price_1T1r3C2Ms5Y6lijd2jBbsj4g',
    highlight: true,
    featureCount: 7,
  },
  {
    id: 'premiumPlus',
    priceKey: 'plans.premiumPlus.price',
    priceId: 'price_1T1r432Ms5Y6lijdlNB8BcdO',
    featureCount: 7,
  },
]

async function subscribe(priceId: string): Promise<void> {
  try {
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ priceId }),
    })

    const text = await res.text()
    if (!res.ok) {
      throw new Error(text)
    }

    const data = JSON.parse(text) as { url: string }
    window.location.href = data.url
  } catch (err) {
    console.error('Stripe checkout failed:', err)
  }
}

export default function PremiumPage(): ReactElement {
  const t = useTranslations('ImitationX.Premium')

  return (
    <>
      <div className='mx-auto max-w-3xl px-4 pb-10 pt-16 text-center'>
        <h1 className='text-4xl font-bold'>{t('title')}</h1>
        <p className='mt-4 text-lg text-muted-foreground'>{t('subtitle')}</p>
      </div>

      <div className='mx-auto grid max-w-6xl gap-6 px-4 pb-20 md:grid-cols-3'>
        {planConfigs.map((plan: PlanConfig) => (
          <div
            key={plan.id}
            className={cn(
              'flex flex-col rounded-2xl border bg-card p-6',
              plan.highlight ? 'scale-105 border-primary shadow-xl' : 'border-border'
            )}
          >
            {plan.highlight && (
              <div className='mb-4 w-fit rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground'>
                {t('recommended')}
              </div>
            )}

            <h2 className='text-xl font-bold'>{t(`plans.${plan.id}.name`)}</h2>
            <div className='mt-3 text-3xl font-bold'>{t(plan.priceKey)}</div>
            <p className='mt-2 text-muted-foreground'>{t(`plans.${plan.id}.description`)}</p>

            <Button
              className={cn(
                'mt-6 rounded-full',
                plan.highlight ? 'bg-primary text-primary-foreground hover:opacity-90' : ''
              )}
              variant={plan.highlight ? 'default' : 'outline'}
              onClick={() => subscribe(plan.priceId)}
            >
              {t('subscribe')}
            </Button>

            <div className='mt-6 space-y-3'>
              {Array.from({ length: plan.featureCount }).map((_, index: number) => {
                const featurePrefix = `plans.${plan.id}.features.${index}`
                const included = t(`${featurePrefix}.included`) === 'true'

                return (
                  <div key={`${plan.id}-${index}`} className='flex items-center gap-3 text-sm'>
                    {included ? (
                      <Check className='h-4 w-4 text-green-500' />
                    ) : (
                      <X className='h-4 w-4 text-muted-foreground/40' />
                    )}
                    <span className={included ? 'text-foreground' : 'text-muted-foreground'}>
                      {t(`${featurePrefix}.text`)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className='bg-muted/40 py-20'>
        <div className='mx-auto max-w-4xl px-4 text-center'>
          <h2 className='text-2xl font-bold'>{t('whyTitle')}</h2>

          <div className='mt-10 grid gap-6 md:grid-cols-3'>
            <Feature title={t('whyCards.1.title')} desc={t('whyCards.1.desc')} />
            <Feature title={t('whyCards.2.title')} desc={t('whyCards.2.desc')} />
            <Feature title={t('whyCards.3.title')} desc={t('whyCards.3.desc')} />
          </div>
        </div>
      </div>
    </>
  )
}

function Feature({ title, desc }: { title: string; desc: string }): ReactElement {
  return (
    <div className='rounded-xl border border-border bg-card p-6'>
      <div className='text-lg font-bold'>{title}</div>
      <p className='mt-2 text-muted-foreground'>{desc}</p>
    </div>
  )
}
