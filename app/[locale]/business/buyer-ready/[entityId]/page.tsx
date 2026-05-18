import nextDynamic from 'next/dynamic'
import type { Metadata } from 'next'

const BuyerReadyRoomClient = nextDynamic(
  () =>
    import('@/features/buyer-ready/readiness-room/BuyerReadyRoomClient').then(
      (mod) => mod.BuyerReadyRoomClient
    ),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen animate-pulse bg-background px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="h-24 rounded-lg bg-foreground/[0.06]" />
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-24 rounded-lg bg-foreground/[0.06]" />
            ))}
          </div>
        </div>
      </div>
    ),
  }
)

interface PageProps {
  params: Promise<{
    locale: string
    entityId: string
  }>
}

export const dynamic = 'force-dynamic'
export const dynamicParams = true

export const metadata: Metadata = {
  title: 'Buyer-ready room',
  description: 'Client-facing buyer-ready transaction package.',
}

export default async function BuyerReadyRoomPage({ params }: PageProps) {
  const { locale, entityId } = await params
  return <BuyerReadyRoomClient entityId={entityId} locale={locale} />
}
