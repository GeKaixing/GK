'use client'
import ArrowLeftBack from './ArrowLeftBack';
import { useTranslations } from 'next-intl';

export default function PostRetreatClient() {
    const t = useTranslations("ImitationX.StatusHeader")
    return (
        <ArrowLeftBack name={t("back")}></ArrowLeftBack>
    )
}
