'use client'
import React, { useEffect, useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import Button from '@/components/gekaixing/Button'
import { Input } from '../ui/input'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { useTranslations } from 'next-intl'
async function update_passwordFetch(password: string) {
    const result = await fetch('/api/update_password', {
        method: 'POST',
        body: JSON.stringify({
            password: password
        }),
        headers: {
            'Content-Type': 'application/json'
        }
    }
    )
    return result
}
export default function Update_passwordDialog() {
    const t = useTranslations('Account.UpdatePassword')
    const [open, setOpen] = useState(true)
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')
    const router = useRouter()

    useEffect(() => {
        if (open === false) {
            router.replace('/account')
        }
    }, [open, router])

    async function update_password() {
        setErrorMsg('')
        const result = await update_passwordFetch(password)
        if (result.ok) {
            router.replace('/account/login')
        } else {
            const data = await result.json().catch(() => null)
            setErrorMsg(data?.error || t('updateFailed'))
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}  >
            <DialogTrigger asChild>

            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t('title')}</DialogTitle>
                    <DialogDescription>{t('description')}</DialogDescription>
                </DialogHeader>
                <div className='mx-auto flex w-full max-w-sm flex-col items-stretch gap-4'>
                    <div className="relative">
                        <Input
                            type={showPassword ? 'text' : 'password'}
                            placeholder={t('placeholder')}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="pr-10"
                        ></Input>
                        <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>
                    <Button className='w-full'
                        onClick={ update_password}
                    >{t('confirm')}</Button>
                    {errorMsg && (
                        <p className="text-center text-sm text-red-500" role="alert">
                            {errorMsg}
                        </p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
