
'use client'

import { useForm } from 'react-hook-form'
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import Button from './Button'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useState } from 'react'
import z from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import Spin from './Spin'
import { useTranslations } from 'next-intl'
import { Eye, EyeOff } from 'lucide-react'
async function SignupFetch(email: string, password: string) {
    const result = await fetch('/api/signup', {
        method: 'POST',
        body: JSON.stringify({
            email: email,
            password: password,
            name: null,
            avatar: null
        }),
        headers: {
            'Content-Type': 'application/json'
        }
    })
    return result
}
export default function SignupForm() {
    const t = useTranslations('Account.SignupForm')
    const [open, setOpen] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const [status, setStatus] = useState(false)
    const formSchema = z.object({
        email: z.string().email({
            message: t('validation.email'),
        }),
        password: z.string().min(6, {
            message: t('validation.passwordMin'),
        }),
    })
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: "",
            password: '',
        },
    })


    async function onSubmit(values: z.infer<typeof formSchema>) {
        setStatus(true)
        const result = await SignupFetch(values.email, values.password)
        const data = await result.json()
        if (data.success) {
            setStatus(false)
            setOpen(true);
        } else {
            setStatus(false)
            toast.error(t('signupFailed'))
        }
    }
    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-6">
                <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('emailLabel')}</FormLabel>
                            <FormControl>
                                <Input
                                    disabled={status}
                                    placeholder={t('emailPlaceholder')}
                                    type='email'
                                    {...field}
                                />
                            </FormControl>
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('passwordLabel')}</FormLabel>
                                        <FormControl>
                                            <div className="relative">
                                                <Input
                                                    disabled={status}
                                                    placeholder={t('passwordPlaceholder')}
                                                    {...field}
                                                    type={showPassword ? 'text' : 'password'}
                                                    className="pr-10"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword((prev) => !prev)}
                                                    aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                                >
                                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                </button>
                                            </div>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormDescription className='hidden'>

                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button type="submit"
                    className='w-full bg-black text-white'
                    disabled={status}
                >
                    {status ? <Spin></Spin> : t('submit')}
                </Button>
            </form>

            <EnterMsmAlertDialog
                open={open}
                setOpen={setOpen}
                t={t}
            ></EnterMsmAlertDialog>
        </Form>
    )
}

function EnterMsmAlertDialog({
    open,
    setOpen,
    t
}: {
    open: boolean;
    setOpen: (open: boolean) => void;
    t: ReturnType<typeof useTranslations>;
}) {
    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
                {/* <Button className='bg-blue-500 text-white'>Open Alert</Button> */}
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t('dialog.title')}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {t('dialog.description')}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>{t('dialog.cancel')}</AlertDialogCancel>
                    <AlertDialogAction>{t('dialog.confirm')}</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
