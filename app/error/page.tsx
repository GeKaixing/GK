import Image from 'next/image'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function page() {
  const t = await getTranslations('ErrorPage')

  return (
    <div className='flex flex-col justify-center items-center h-screen gap-6'>
      <>
        <Image src={'/logo.svg'} width={200} height={200} alt='logo.svg' className='dark:hidden'></Image>
        <Image src={'/logo-white.svg'} width={200} height={200} alt='logo-white.svg' className='hidden dark:block'></Image>
      </>
      <span className='text-2xl text-red-500'>
        {t('title')}
      </span>
      <Link href='/account' replace className='h-9 border border-gray-300 rounded-2xl flex justify-center items-center w-2xs bg-black text-white'>{t('backButton')}</Link>
    </div>
  )
}
