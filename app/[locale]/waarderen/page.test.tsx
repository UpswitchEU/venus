import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import WaarderenLandingPage, { generateMetadata } from './page'

async function renderLanding(locale: 'en' | 'nl' | 'fr') {
  render(await WaarderenLandingPage({ params: Promise.resolve({ locale }) }))
}

describe('/[locale]/waarderen landing', () => {
  it('renders English copy for the English locale route', async () => {
    await renderLanding('en')

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Investor-ready startup valuation in 7 minutes.',
      })
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start free valuation' })).toHaveAttribute(
      'href',
      '/en/landing/startup'
    )
    expect(screen.queryByText(/Een investor-ready waardering/)).not.toBeInTheDocument()
  })

  it('keeps Dutch copy for the Dutch locale route', async () => {
    await renderLanding('nl')

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Een investor-ready waardering voor je startup — in 7 minuten.',
      })
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start gratis waardering' })).toHaveAttribute(
      'href',
      '/nl/landing/startup'
    )
  })

  it('renders French copy for the French locale route', async () => {
    await renderLanding('fr')

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Une valorisation de startup prête pour les investisseurs en 7 minutes.',
      })
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Démarrer la valorisation gratuite' })).toHaveAttribute(
      'href',
      '/fr/landing/startup'
    )
  })

  it('generates locale-specific metadata and canonicals', async () => {
    const enMeta = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) })
    const nlMeta = await generateMetadata({ params: Promise.resolve({ locale: 'nl' }) })
    const frMeta = await generateMetadata({ params: Promise.resolve({ locale: 'fr' }) })

    expect(enMeta.title).toBe('Startup Valuation — Upswitch · Free pre-revenue valuation')
    expect(enMeta.alternates?.canonical).toBe('/en/waarderen')
    expect(nlMeta.title).toBe('Startup waarderen — Upswitch · Gratis pre-revenue valuation')
    expect(nlMeta.alternates?.canonical).toBe('/nl/waarderen')
    expect(frMeta.title).toBe('Valoriser une startup — Upswitch · Valorisation pré-revenus gratuite')
    expect(frMeta.alternates?.canonical).toBe('/fr/waarderen')
  })
})
