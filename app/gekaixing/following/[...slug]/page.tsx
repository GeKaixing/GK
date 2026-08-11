'use client'

import { use, useCallback, useEffect, useState, type ReactElement } from 'react'
import { ArrowLeft, Search, UserCheck, UserPlus, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { isLoggedIn } from '@/store/user'

interface UserProfile {
  id: string
  name: string
  handle: string
  avatar: string
  bio: string
  isFollowing: boolean
  isVerified?: boolean
}

type TabType = 'recommended' | 'followers' | 'following'

export default function Page({ params }: { params: Promise<{ slug: string[] }> }): ReactElement {
  const t = useTranslations('ImitationX.Following')
  const { slug } = use(params)
  const profileId = slug[0]

  const [activeTab, setActiveTab] = useState<TabType>('recommended')
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const router = useRouter()

  const fetchUsers = useCallback(
    async (tab: TabType): Promise<void> => {
      setLoading(true)
      try {
        const res = await fetch(`/api/user/${profileId}/relations?type=${tab}`)
        const data = (await res.json()) as { success?: boolean; users?: UserProfile[] }
        if (data.success && data.users) {
          setUsers(data.users)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    },
    [profileId]
  )

  useEffect(() => {
    void fetchUsers(activeTab)
  }, [activeTab, fetchUsers])

  const handleFollow = async (targetId: string): Promise<void> => {
    if (!isLoggedIn()) {
      router.push('/account')
      return
    }
    const targetUser = users.find((u: UserProfile) => u.id === targetId)
    if (!targetUser) {
      return
    }

    setUsers((prev: UserProfile[]) =>
      prev.map((user: UserProfile) =>
        user.id === targetId ? { ...user, isFollowing: !user.isFollowing } : user
      )
    )

    try {
      if (targetUser.isFollowing) {
        await fetch('/api/follow', {
          method: 'DELETE',
          body: JSON.stringify({ targetId }),
        })
      } else {
        await fetch('/api/follow', {
          method: 'POST',
          body: JSON.stringify({ targetId }),
        })
      }
    } catch (err) {
      console.error(err)
      void fetchUsers(activeTab)
    }
  }

  const filteredUsers = users.filter((user: UserProfile) => {
    const q = searchQuery.toLowerCase()
    return (
      user.name?.toLowerCase().includes(q) ||
      user.handle?.toLowerCase().includes(q) ||
      user.bio?.toLowerCase().includes(q)
    )
  })

  const tabs: { id: TabType; label: string }[] = [
    { id: 'recommended', label: t('tabs.recommended') },
    { id: 'followers', label: t('tabs.followers') },
    { id: 'following', label: t('tabs.following') },
  ]

  return (
    <div className='min-h-screen bg-background text-foreground'>
      <div className='sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-md'>
        <div className='flex items-center gap-4 px-4 py-3'>
          <button onClick={() => router.back()} className='rounded-full p-2 transition-colors hover:bg-muted/70'>
            <ArrowLeft className='h-5 w-5' />
          </button>

          <div>
            <h1 className='text-xl font-bold'>{t('title')}</h1>
            <p className='text-sm text-muted-foreground'>{t('userCount', { count: users.length })}</p>
          </div>
        </div>

        <div className='px-4 py-2'>
          <div className='relative'>
            <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
            <input
              type='text'
              placeholder={t('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className='w-full rounded-full bg-muted py-2 pl-10 pr-10 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500'
            />

            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className='absolute right-3 top-1/2 -translate-y-1/2'>
                <X className='h-4 w-4' />
              </button>
            )}
          </div>
        </div>

        <div className='flex border-b border-border'>
          {tabs.map((tab: { id: TabType; label: string }) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 py-3 text-sm font-medium',
                activeTab === tab.id ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className='divide-y divide-border'>
        {loading ? (
          <div className='p-8 text-center text-muted-foreground'>{t('loading')}</div>
        ) : (
          filteredUsers.map((user: UserProfile) => (
            <div key={user.id} className='flex gap-3 px-4 py-3 transition-colors hover:bg-muted/60'>
              <Avatar className='h-12 w-12'>
                <AvatarImage src={user.avatar} />
                <AvatarFallback>{user.name?.slice(0, 2)}</AvatarFallback>
              </Avatar>

              <div className='flex-1'>
                <div className='flex justify-between'>
                  <div>
                    <p className='font-bold'>{user.name}</p>
                    <p className='text-sm text-muted-foreground'>{user.handle}</p>
                  </div>

                  <Button onClick={() => void handleFollow(user.id)} variant={user.isFollowing ? 'outline' : 'default'}>
                    {user.isFollowing ? <UserCheck className='h-4 w-4' /> : <UserPlus className='h-4 w-4' />}
                  </Button>
                </div>

                <p className='mt-1 text-sm'>{user.bio}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
