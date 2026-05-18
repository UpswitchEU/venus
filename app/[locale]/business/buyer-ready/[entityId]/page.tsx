import type { Metadata } from 'next'
import { BuyerReadyRoomClient } from '@/features/buyer-ready/readiness-room/BuyerReadyRoomClient'

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
