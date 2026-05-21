/**
 * Analytics Service
 *
 * Simple analytics tracking for EBITDA normalization interest
 */

interface AnalyticsEvent {
  event: string
  timestamp: string
  userId?: string
  metadata?: Record<string, unknown>
}

class AnalyticsService {
  private events: AnalyticsEvent[] = []

  // Track an event
  track(event: string, metadata?: Record<string, unknown>) {
    const analyticsEvent: AnalyticsEvent = {
      event,
      timestamp: new Date().toISOString(),
      metadata,
    }

    // Store in memory
    this.events.push(analyticsEvent)

    // Store in localStorage for persistence
    const storedEvents = JSON.parse(localStorage.getItem('upswitch-analytics') || '[]')
    storedEvents.push(analyticsEvent)
    localStorage.setItem('upswitch-analytics', JSON.stringify(storedEvents))

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Analytics Event:', analyticsEvent)
    }
  }

  // Track EBITDA normalization interest
  trackEbitdaInterest(action: 'learn_more_clicked' | 'waitlist_joined' | 'guide_viewed') {
    this.track('ebitda_normalization_interest', {
      action,
      feature: 'ebitda_normalization',
      phase: 'educational_foundation',
    })
  }

  // Get analytics data
  getAnalytics() {
    const storedEvents = JSON.parse(localStorage.getItem('upswitch-analytics') || '[]')
    return storedEvents
  }

  // Get EBITDA normalization metrics
  getEbitdaMetrics() {
    const events = this.getAnalytics()
    const ebitdaEvents = events.filter(
      (e: AnalyticsEvent) => e.event === 'ebitda_normalization_interest'
    )

    return {
      totalInterest: ebitdaEvents.length,
      learnMoreClicks: ebitdaEvents.filter(
        (e: AnalyticsEvent) => e.metadata?.action === 'learn_more_clicked'
      ).length,
      waitlistJoins: ebitdaEvents.filter(
        (e: AnalyticsEvent) => e.metadata?.action === 'waitlist_joined'
      ).length,
      guideViews: ebitdaEvents.filter((e: AnalyticsEvent) => e.metadata?.action === 'guide_viewed')
        .length,
    }
  }

  // Clear analytics (for testing)
  clear() {
    this.events = []
    localStorage.removeItem('upswitch-analytics')
  }
}

export const analytics = new AnalyticsService()
