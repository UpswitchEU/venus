'use client'

import { useTranslations } from 'next-intl'
import { useTransitionRouter } from 'next-view-transitions'
import React, { useEffect, useRef, useState } from 'react'
import { trackReportCreate, trackReportOpen, trackSessionStart } from '@/lib/analytics'
import { ALL_BUSINESS_VIDEOS } from '../../constants/videos'
import { RecentReportsSection } from '../../features/reports'
import { useAuth } from '../../hooks/useAuth'
// AUTH-FIRST: useSessionInitialization removed - session init handled by BootstrapProvider
import { type BusinessCardData, businessCardService } from '../../services/businessCard'
import UrlGeneratorService from '../../services/urlGenerator'
import { useReportsStore } from '../../store/useReportsStore'
import { useClientContext } from '../../stores/clientContext'
import { ScrollToTop } from '../../utils'
import { getApiUrl } from '../../utils/getMercuryUrl'
import { generalLogger } from '../../utils/logger'
import { generateReportId } from '../../utils/reportIdGenerator'
import { MinimalHeader } from '../MinimalHeader'
import { VideoBackground } from '../VideoBackground'

// Backend API URL
const API_URL = getApiUrl()

export const HomePage: React.FC = () => {
  const router = useTransitionRouter()
  const { user } = useAuth()
  const t = useTranslations()
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'manual' | 'conversational'>('manual')
  const [_businessCardData, setBusinessCardData] = useState<BusinessCardData | null>(null)
  const [businessCardToken, setBusinessCardToken] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Reports store
  const { reports, loading: reportsLoading, fetchReports, deleteReport } = useReportsStore()

  // AUTH-FIRST: Session initialization handled by BootstrapProvider
  // No guest session initialization needed - all users must authenticate

  // Get client context for headers
  const clientContext = useClientContext()

  // Fetch business card if token is present from main platform
  // SECURITY: Fetch prefilledQuery from session data instead of URL
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const fromMainPlatform = params.get('from') === 'upswitch'
    const clientToken = params.get('clientToken')

    // SECURITY: Fetch prefilledQuery from session data (not URL)
    // This prevents business names from appearing in browser history/logs
    if (clientToken && !query) {
      const fetchSessionData = async () => {
        try {
          // Get current session key from URL path
          const sessionKey = window.location.pathname.split('/').pop()
          if (!sessionKey?.startsWith('val_')) return

          const response = await fetch(`${API_URL}/api/v2/valuations/sessions/${sessionKey}`, {
            credentials: 'include',
            headers: {
              ...clientContext.getContextHeaders(), // X-Client-Context-* headers
            },
          })

          if (response.ok) {
            const session = await response.json()
            // SECURITY: Retrieve prefilled data from secure server-side storage
            const prefilledQuery = session.session_data?._prefilledQuery
            if (prefilledQuery) {
              setQuery(prefilledQuery)
              generalLogger.info('Query prefilled from session data', {
                length: prefilledQuery.length,
              })
            }
          }
        } catch (error) {
          generalLogger.error('Failed to fetch session data', {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      fetchSessionData()
    }

    if (token && fromMainPlatform) {
      generalLogger.info('Business card token detected from main platform', {
        token: token.substring(0, 8) + '...',
      })

      // Store token for later use
      setBusinessCardToken(token)

      // Fetch business card data to prefill query
      businessCardService
        .fetchBusinessCard(token)
        .then((data) => {
          setBusinessCardData(data)

          // Prefill query with company name (only if query is not already set)
          if (data.company_name && !query) {
            setQuery(data.company_name)
            generalLogger.info('Query prefilled from business card', {
              companyName: data.company_name,
            })
          }
        })
        .catch((error) => {
          generalLogger.error('Failed to fetch business card', {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        })
    } else if (token && !fromMainPlatform) {
      // Legacy behavior: auto-redirect for instant valuations
      generalLogger.info('Token detected on homepage - redirecting to new report')
      const newReportId = generateReportId()
      router.push(UrlGeneratorService.reportById(newReportId, { token }))
    }
  }, [router, query, clientContext.getContextHeaders])

  // Fetch recent reports on mount and when user changes
  useEffect(() => {
    // Backend uses JWT cookie for authentication
    fetchReports(user?.id)
  }, [fetchReports, user?.id])

  useEffect(() => {
    const source = document.referrer.includes('upswitch.app') ? 'mercury' : 'direct'
    trackSessionStart(source)
    // Note: `identifyUser` is wired centrally in `VenusIdentitySync` (mounted
    // in `app/layout.tsx`) so every Venus surface — not just `HomePage` —
    // attaches `user_id`, `is_internal`, `current_plan`, and `user_role` to
    // events. Calling it again here used to mean only the home page got a
    // proper identity, breaking cross-route GA4 stitching.
  }, [])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  // Remove body background for video visibility
  useEffect(() => {
    const originalBodyBg = document.body.style.backgroundColor
    document.body.style.backgroundColor = 'transparent'

    return () => {
      document.body.style.backgroundColor = originalBodyBg || 'black'
    }
  }, [])

  const handleQuerySubmit = () => {
    if (!query.trim()) return

    try {
      // Generate new report ID
      const newReportId = generateReportId()

      // Build URL with query params using centralized URL generator
      const url = UrlGeneratorService.reportById(newReportId, {
        flow: mode,
        prefilledQuery: query.trim(),
        autoSend: 'true',
        token: businessCardToken || undefined,
      })

      trackReportCreate()
      generalLogger.info('Starting new valuation', {
        reportId: newReportId,
        mode,
        hasBusinessCard: !!businessCardToken,
      })

      router.push(url)
    } catch (error) {
      generalLogger.error('Error submitting query', { error })
    }
  }

  const handleReportClick = (reportId: string) => {
    const report = reports.find((r) => r.reportId === reportId)
    const flow = report?.currentView || 'manual'

    trackReportOpen(reportId)
    generalLogger.info('Opening existing report', { reportId, flow })

    // Navigate with flow type preserved
    router.push(UrlGeneratorService.reportById(reportId, { flow }))
  }

  const handleReportDelete = async (reportId: string) => {
    try {
      await deleteReport(reportId)
      generalLogger.info('Report deleted successfully', { reportId })
    } catch (error) {
      generalLogger.error('Failed to delete report', {
        error: error instanceof Error ? error.message : 'Unknown error',
        reportId,
      })
      alert('Failed to delete report. Please try again.')
    }
  }

  // Business type focused examples aligned with AI-guided Q1
  const quickQueries = [
    'SaaS',
    'Restaurant',
    'E-commerce store',
    'Manufacturing business',
    'Consulting firm',
    'SaaS company',
  ]

  return (
    <>
      <ScrollToTop />
      <MinimalHeader />

      {/* Video Background */}
      <VideoBackground
        videos={ALL_BUSINESS_VIDEOS}
        opacity={0.5}
        overlayGradient="from-black/40 via-black/30 to-black/60"
        disableAutoRotation={false}
      />

      <div className="min-h-screen relative pt-8 md:pt-12">
        {/* Hero Section with Video Background */}
        <section className="relative z-10 pt-8 md:pt-12 pb-2 md:pb-4 flex items-center justify-center min-h-[70vh] md:min-h-[75vh]">
          <div className="w-full max-w-6xl mx-auto px-4">
            <div className="text-center space-y-3 md:space-y-4">
              {/* Hero Content */}
              <div className="space-y-3 md:space-y-4">
                <h1 className="text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold leading-tight tracking-tight text-[#F4F1EA]">
                  {t('home.hero.title')}
                  <br />
                  {t('home.hero.titleLine2')}
                </h1>
                <p className="text-lg md:text-xl text-[#F4F1EA] max-w-4xl mx-auto leading-relaxed opacity-90">
                  {t('home.hero.subtitle')}
                </p>
              </div>

              {/* Action Bridge */}
              <p className="text-[#F4F1EA] text-opacity-80 text-sm md:text-base mb-1 font-medium">
                {t('home.hero.cta')}
              </p>

              {/* Enhanced Query Interface - Ilara Style */}
              <div className="max-w-4xl mx-auto">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleQuerySubmit()
                  }}
                  className="focus-within:bg-background/30 group flex flex-col gap-2 p-3 md:p-4 duration-150 w-full rounded-3xl border border-foreground/10 bg-background/20 text-base shadow-xl transition-all ease-in-out focus-within:border-primary/40 hover:border-foreground/20 focus-within:hover:border-primary/40 backdrop-blur-sm"
                >
                  {/* Main textarea container */}
                  <div className="relative flex items-center">
                    <textarea
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t('home.hero.placeholder')}
                      className="textarea-seamless flex w-full rounded-md px-3 py-3 pr-24 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 resize-none text-base leading-snug placeholder-shown:text-ellipsis placeholder-shown:whitespace-nowrap md:text-base max-h-[200px] bg-transparent focus:bg-transparent flex-1 text-foreground"
                      style={{ minHeight: '80px', height: '80px' }}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleQuerySubmit()
                        }
                      }}
                      ref={textareaRef}
                      autoFocus
                      spellCheck="false"
                    />

                    {/* Mode Toggle - Grand Persona Style */}
                    <div className="absolute right-1 top-1 flex items-center gap-0.5 bg-background/60 backdrop-blur-md p-0.5 rounded-lg border border-foreground/10 shadow-lg z-10 scale-90 origin-top-right">
                      <div className="relative group/manual">
                        <button
                          type="button"
                          onClick={() => setMode('manual')}
                          className={`p-1.5 rounded-md transition-all duration-200 ${
                            mode === 'manual'
                              ? 'bg-muted text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground hover:bg-foreground/10'
                          }`}
                          aria-label="Manual Input"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-3.5 h-3.5"
                          >
                            <path d="M12 20h9"></path>
                            <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"></path>
                          </svg>
                        </button>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-[10px] text-foreground rounded opacity-0 group-hover/manual:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-foreground/10 shadow-xl">
                          {t('home.flows.manual')}
                        </div>
                      </div>

                      <div className="relative group/chat">
                        <button
                          type="button"
                          onClick={() => setMode('conversational')}
                          className={`p-1.5 rounded-md transition-all duration-200 ${
                            mode === 'conversational'
                              ? 'bg-muted text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground hover:bg-foreground/10'
                          }`}
                          aria-label="Conversational Mode"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-3.5 h-3.5"
                          >
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                          </svg>
                        </button>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-[10px] text-foreground rounded opacity-0 group-hover/chat:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-foreground/10 shadow-xl">
                          {t('home.flows.conversational')}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action buttons row - quick query suggestions */}
                  <div className="flex gap-2 flex-wrap items-center">
                    {quickQueries.map((quickQuery, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setQuery(quickQuery)}
                        className="px-3 py-1.5 bg-muted/50 hover:bg-foreground/10 border border-foreground/10 hover:border-foreground/20 rounded-full text-xs text-muted-foreground 
                                  hover:text-foreground transition-all duration-200 hover:shadow-md hover:shadow-black/20"
                      >
                        {quickQuery}
                      </button>
                    ))}

                    {/* Right side with send button */}
                    <div className="flex flex-grow items-center justify-end gap-2">
                      <div className="relative flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={!query.trim()}
                          className="submit-button-white flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="100%"
                            height="100%"
                            viewBox="0 -960 960 960"
                            className="shrink-0 h-5 w-5 text-black"
                            fill="currentColor"
                          >
                            <path d="M452-644 303-498q-9 9-21 8.5t-21-9.5-9-21 9-21l199-199q9-9 21-9t21 9l199 199q9 9 9 21t-9 21-21 9-21-9L512-646v372q0 13-8.5 21.5T482-244t-21.5-8.5T452-274z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </form>

                {/* Trust Signal */}
                <div className="mt-2 md:mt-3 text-center">
                  <p className="text-xs text-[#F4F1EA] text-opacity-60">
                    {t('home.hero.trustSignal')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Recent Reports Section - Lovable Style */}
        <RecentReportsSection
          reports={reports}
          loading={reportsLoading}
          onReportClick={handleReportClick}
          onReportDelete={handleReportDelete}
          user={user || null}
        />
      </div>
    </>
  )
}
