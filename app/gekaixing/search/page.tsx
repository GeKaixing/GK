import SearchMain from "@/components/gekaixing/SearchMain"

export const dynamic = "force-dynamic"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { query = "" } = await searchParams
  const initialQuery = typeof query === "string" ? query : ""

  return <SearchMain initialQuery={initialQuery} />
}
