"use client"
import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function ArrowLeftBack({ className, children, name='返回', href = '/gekaixing' }: {
    name?: string,
    href?: string,
    className?: string,
    children?: React.ReactNode
}) {
    const router = useRouter()
    const handleBack = () => {
        // 优先返回上一页；无浏览历史（如直接打开链接）时兜底跳到 href
        if (typeof window !== 'undefined' && window.history.length > 1) {
            router.back()
        } else {
            router.replace(href)
        }
    }
    return (
        <div className="flex items-center gap-4 px-4 py-3">
            <div
                className="p-2 hover:bg-muted/70 rounded-full transition-colors"
            >
                <ArrowLeft
                    className={className}
                    onClick={handleBack} />
            </div>
            <div>
                <h1 className="text-xl font-bold">{name}</h1>
                {children}
            </div>
        </div>

    )
}
