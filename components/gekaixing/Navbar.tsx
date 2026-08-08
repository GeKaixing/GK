'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { IconBrandGithub } from '@tabler/icons-react'
import { usePathname } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import LanguageSwitcher from './LanguageSwitcher'

interface NavbarProps {
    user?: User | null;
}

export default function Navbar({ user }: NavbarProps) {
    const [scrolled, setScrolled] = useState(false)
    const [isActive, setACtive] = useState(false)
    const pathname = usePathname()
    const router = useRouter()
    const t = useTranslations('Navbar')

    useEffect(() => {
        if (pathname !== '/') {
            setACtive(true)
        }
        return () => {
            setACtive(false)
        }
    }, [pathname])

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 10)
        }
        window.addEventListener('scroll', handleScroll)
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    const avatarUrl = user?.user_metadata?.user_avatar || user?.user_metadata?.avatar_url || ''
    const userName = user?.user_metadata?.name || ''
    const userEmail = user?.email || ''
    const fallbackInitial = userName?.charAt(0)?.toUpperCase() || userEmail?.charAt(0)?.toUpperCase() || 'U'
    const userId = user?.id || ''

    return (
        <>
            <div
                className={`fixed top-0 w-full h-20 z-50 transition-colors duration-300 px-6 py-2 flex justify-between items-center ${scrolled ? 'bg-background/95 backdrop-blur shadow text-foreground border-b border-border' : 'bg-transparent text-foreground'
                    }`}
            >
                <div className='flex items-center gap-6'>
                    <Link href={'/'}>
                        <>
                            <Image alt='logo' src={'/logo.svg'} width={64} height={64} className='dark:hidden' />
                            <Image alt='logo white' src={'/logo-white.svg'} width={64} height={64} className='hidden dark:block' />
                        </>
                    </Link>
                </div>
                <div className='flex items-center gap-6 '>
                    <LanguageSwitcher />
                    {!user?.id ? (
                        <Link className='text-foreground' href={'/account'}>{t('login')}</Link>
                    ) : (
                        <div 
                            className='flex items-center gap-2 cursor-pointer hover:bg-muted/70 rounded-full px-2 py-1 transition-colors'
                            onClick={() => router.push(`/gekaixing/user/${userId}`)}
                        >
                            <Avatar className='w-8 h-8'>
                                <AvatarImage src={avatarUrl} />
                                <AvatarFallback>{fallbackInitial}</AvatarFallback>
                            </Avatar>
                            <span className='text-sm font-medium text-foreground'>{userName || userEmail}</span>
                        </div>
                    )}
                    <Link href={'https://github.com/GeKaixing/gekaixing'}>
                        <IconBrandGithub className='text-foreground' />
                    </Link>
                </div>
            </div>
            <div className='w-full h-20'></div>
        </>
    )
}
