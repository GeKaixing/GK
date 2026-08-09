import {getRequestConfig} from 'next-intl/server';
import {notFound} from 'next/navigation';
import { cookies } from 'next/headers';
import enMessages from '../messages/en.json';
import zhMessages from '../messages/zh-CN.json';

const allMessages = {
  en: enMessages,
  'zh-CN': zhMessages,
} as const;

export default getRequestConfig(async ({locale}) => {
  const validLocales = ['en', 'zh-CN'];
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
  const localeFromRequest = locale as string | undefined;

  const validLocale = (
    validLocales.includes(localeFromRequest || '')
      ? localeFromRequest
      : validLocales.includes(cookieLocale || '')
        ? cookieLocale
        : 'en'
  ) as string;

  if (!validLocales.includes(validLocale)) notFound();

  return {
    locale: validLocale,
    messages: allMessages[validLocale as keyof typeof allMessages]
  };
});
