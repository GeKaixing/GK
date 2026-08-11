import { createClient } from "../supabase/client"

export async function uploadImageToSupabase(
    file: File,
    bucketName: string = 'images',
    pathPrefix?: string
): Promise<string | null> {
    
    const supabase = createClient()
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
    const filePath = `${pathPrefix ?? 'uploads'}/${fileName}`

    // 上传到 Supabase Storage
    const { error } = await supabase.storage.from(bucketName).upload(filePath, file)

    if (error) {
        console.error('上传失败:', error.message)
        return null
    }

    // 获取公共 URL
    const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath)
    return data.publicUrl
}