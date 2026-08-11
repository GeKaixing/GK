'use client'

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { ArrowLeft, Search, UserCheck, UserPlus, X } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { userStore, isLoggedIn } from '@/store/user'
import { useRouter } from 'next/navigation'

interface UserProfile {
  id: string
  name: string
  handle: string
  avatar: string | null
  bio: string | null
  isFollowing: boolean
}

type TabType = 'recommended' | 'followers' | 'following'
type RelationsResponse = { success?: boolean; users?: UserProfile[]; error?: string }
type CurrentUserResponse = { success?: boolean; id?: string; userid?: string; error?: string }

export default function ConnectPeoplePage(): ReactElement {
  const t = useTranslations('ImitationX.ConnectPeople')
  const router = useRouter()
  const storeUserId = userStore((state) => state.id)
  const [activeTab, setActiveTab] = useState<TabType>('recommended')
  const [users, setUsers] = useState<UserProfile[]>([])
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [currentUserId, setCurrentUserId] = useState<string>(storeUserId)

  useEffect(() => {
    if (storeUserId) {
      setCurrentUserId(storeUserId)
    }
  }, [storeUserId])

  useEffect(() => {
    if (storeUserId) {
      return
    }

    const fetchCurrentUser = async (): Promise<void> => {
      try {
        const response = await fetch('/api/user')
        const data = (await response.json()) as CurrentUserResponse
        if (response.ok && data.success && data.id) {
          setCurrentUserId(data.id)
        }
      } catch (error) {
        console.error('Failed to fetch current user:', error)
      }
    }

    void fetchCurrentUser()
  }, [storeUserId])

  const fetchUsers = useCallback(async (): Promise<void> => {
    if (!currentUserId) {
      setUsers([])
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/user/${currentUserId}/relations?type=${activeTab}`)
      const data = (await response.json()) as RelationsResponse
      if (response.ok && data.success && data.users) {
        setUsers(data.users)
      } else {
        setUsers([])
      }
    } catch (error) {
      console.error('Failed to fetch relations:', error)
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [activeTab, currentUserId])

  useEffect(() => {
    void fetchUsers()
  }, [fetchUsers])

  const handleFollow = async (targetId: string): Promise<void> => {
    if (!isLoggedIn()) {
      router.push('/account')
      return
    }
    const targetUser = users.find((user: UserProfile) => user.id === targetId)
    if (!targetUser) {
      return
    }

    setUsers((prevUsers: UserProfile[]) =>
      prevUsers.map((user: UserProfile) =>
        user.id === targetId ? { ...user, isFollowing: !user.isFollowing } : user
      )
    )

    try {
      if (targetUser.isFollowing) {
        await fetch('/api/follow', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId }),
        })
      } else {
        await fetch('/api/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId }),
        })
      }
    } catch (error) {
      console.error('Failed to update follow status:', error)
      void fetchUsers()
    }
  }

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase()

    return users.filter((user: UserProfile) => {
      return (
        user.name.toLowerCase().includes(q) ||
        user.handle.toLowerCase().includes(q) ||
        (user.bio ?? '').toLowerCase().includes(q)
      )
    })
  }, [searchQuery, users])

  const tabs: { id: TabType; label: string }[] = [
    { id: 'recommended', label: t('tabs.recommended') },
    { id: 'followers', label: t('tabs.followers') },
    { id: 'following', label: t('tabs.following') },
  ]

  return (
    <div className='min-h-screen bg-background text-foreground'>
      <div className='sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-md'>
        <div className='flex items-center gap-4 px-4 py-3'>
          <Link href='/gekaixing' className='rounded-full p-2 transition-colors hover:bg-muted/70'>
            <ArrowLeft className='h-5 w-5' />
          </Link>
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
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className='w-full rounded-full bg-muted py-2 pl-10 pr-10 text-sm text-foreground transition-all focus:bg-background focus:outline-none focus:ring-2 focus:ring-blue-500'
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className='absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/70 p-0.5 transition-colors hover:bg-muted-foreground'
              >
                <X className='h-3 w-3 text-white' />
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
                'relative flex-1 px-4 py-3 text-sm font-medium transition-colors',
                activeTab === tab.id ? 'text-foreground' : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
              )}
            >
              {tab.label}
              {activeTab === tab.id && <div className='absolute bottom-0 left-1/2 h-1 w-12 -translate-x-1/2 rounded-full bg-blue-500' />}
            </button>
          ))}
        </div>
      </div>

      <div className='divide-y divide-border'>
        {loading ? (
          <div className='p-8 text-center text-muted-foreground'>{t('loading')}</div>
        ) : filteredUsers.length === 0 ? (
          <div className='py-12 text-center'>
            <div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted'>
              <Search className='h-8 w-8 text-muted-foreground' />
            </div>
            <p className='text-muted-foreground'>{t('empty')}</p>
          </div>
        ) : (
          filteredUsers.map((user: UserProfile) => (
            <div
              key={user.id}
              className='flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/60'
            >
              <Link href={`/gekaixing/user/${user.id}`}>
                <Avatar className='h-12 w-12'>
                  <AvatarImage src={user.avatar ?? ''} alt={user.name} />
                  <AvatarFallback className='bg-muted font-medium text-muted-foreground'>
                    {user.name.slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
              </Link>

              <div className='min-w-0 flex-1'>
                <div className='flex items-start justify-between gap-2'>
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-1'>
                      <Link href={`/gekaixing/user/${user.id}`} className='truncate text-sm font-bold hover:underline'>
                        {user.name}
                      </Link>
                    </div>
                    <p className='truncate text-sm text-muted-foreground'>{user.handle}</p>
                  </div>

                  <Button
                    onClick={(e: React.MouseEvent<HTMLButtonElement>): void => {
                      e.stopPropagation()
                      void handleFollow(user.id)
                    }}
                    variant={user.isFollowing ? 'outline' : 'default'}
                    size='sm'
                    className={cn(
                      'min-w-[80px] rounded-full text-sm font-bold transition-all',
                      user.isFollowing
                        ? 'border-border hover:border-red-400/50 hover:bg-red-500/10 hover:text-red-500'
                        : 'bg-primary text-primary-foreground hover:opacity-90'
                    )}
                  >
                    {user.isFollowing ? (
                      <span className='flex items-center gap-1'>
                        <UserCheck className='h-4 w-4' />
                        {t('following')}
                      </span>
                    ) : (
                      <span className='flex items-center gap-1'>
                        <UserPlus className='h-4 w-4' />
                        {t('follow')}
                      </span>
                    )}
                  </Button>
                </div>

                <Link href={`/gekaixing/user/${user.id}`}>
                  <p className='mt-1 line-clamp-2 text-sm text-foreground/85'>{user.bio ?? ''}</p>
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      {!loading && filteredUsers.length > 0 && (
        <div className='py-4 text-center'>
          <Button variant='ghost' className='text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300'>
            {t('loadMore')}
          </Button>
        </div>
      )}
    </div>
  )
}
