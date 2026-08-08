"use client"
import ArrowLeftBack from '@/components/gekaixing/ArrowLeftBack'
import SettingEmail from '@/components/gekaixing/SettingEmail'
import SettingAccountLi from '@/components/gekaixing/SettingAccountLi'
import { userStore } from '@/store/user'
import { Mail, ShieldCheck } from 'lucide-react'
import React from 'react'
import SettingPassword from '@/components/gekaixing/SettingPassword'
import SettingDeleteAccount from '@/components/gekaixing/SettingDeleteAccount'
import SettingAI from '@/components/gekaixing/SettingAI'


export default function page() {
  const { email } = userStore()
  return (
    <div>
      <ArrowLeftBack href="/gekaixing/settings"></ArrowLeftBack>
      <ul className='flex flex-col gap-6'>
        <SettingAccountLi icon={<Mail></Mail>} text={email} icon2={<ShieldCheck className="text-blue-400" ></ShieldCheck>}></SettingAccountLi>
        <SettingEmail></SettingEmail>
        <SettingAI />
        <SettingPassword></SettingPassword>
        <SettingDeleteAccount></SettingDeleteAccount>
      </ul>
    </div>
  )
}
