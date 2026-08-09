
import { ShieldCheck } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import { SidebarDropdownMenu } from './Sidebar'
import { userStore } from '@/store/user'
import { useRouter } from 'next/navigation'

export default function SidebarAvatar() {
    const router = useRouter()
    const { user_avatar, name, email, userid, id, isPremium } = userStore()
    const avatarUrl = user_avatar || ''
    const fallbackInitial = name?.charAt(0)?.toUpperCase() || email?.charAt(0)?.toUpperCase() || 'U'
    return (
        <li className="flex gap-2 text-xl font-bold hover:bg-muted/70 rounded-full p-2 items-center justify-center cursor-pointer w-full transition-colors">
            <Avatar onClick={() => router.push(`/gekaixing/user/${id}`)} className="w-10 h-10 shrink-0">
                <AvatarImage src={avatarUrl} />
                <AvatarFallback>{fallbackInitial}</AvatarFallback>
            </Avatar>
            <div className="hidden xl:flex flex-col flex-1 min-w-0">
                {name && <span className="text-sm font-bold text-foreground truncate flex items-center" onClick={() => router.push(`/gekaixing/user/${id}`)}>
                    {name}
                    {isPremium && <ShieldCheck className="w-4 h-4 text-blue-500" />}
                </span>}
                <span className="text-sm text-muted-foreground truncate" onClick={() => router.push(`/gekaixing/user/${id}`)}>@{userid}</span>
            </div>
            <div className="hidden xl:block">
                <SidebarDropdownMenu />
            </div>
        </li>
    )
}
