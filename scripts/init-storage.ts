import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function initStorage() {
  console.log('🔍 checking buckets...')

  const { data: buckets, error } = await supabase.storage.listBuckets()

  if (error) {
    console.error('❌ list bucket error:', error.message)
    process.exit(1)
  }

  const exists = buckets?.some(b => b.name === 'images')

  if (exists) {
    console.log('✅ images bucket already exists')
    process.exit(0)
  }

  console.log('🚀 creating images bucket...')

  const { error: createError } = await supabase.storage.createBucket('images', {
    public: true,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    fileSizeLimit: 20 * 1024 * 1024,
  })

  if (createError) {
    console.error('❌ create bucket error:', createError.message)
    process.exit(1)
  }

  console.log('🎉 images bucket created!')
}

initStorage()
