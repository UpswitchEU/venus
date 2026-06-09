import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { KBOCompany } from './EntitySearchTypes'
import { KboConfirmedCard } from './KboConfirmedCard'

const fixture: KBOCompany = {
  id: '0631747439',
  name: 'Bakker Aldo',
  kboNumber: '0631747439',
  legalForm: 'Besloten vennootschap met beperkte aansprakelijkhe',
  address: 'Kerkstraat 1',
  postalCode: '2018',
  city: 'Antwerpen',
  naceCode: '47241',
  naceDescription: 'Detailhandel in brood, banketbakkerswerk, suikerwerk en chocolade',
  activityLabel: 'Detailhandel in brood, banketbakkerswerk, suikerwerk en chocolade',
  countryCode: 'BE',
}

describe('KboConfirmedCard', () => {
  it('stacks company metadata and shows full NACE description', () => {
    render(<KboConfirmedCard company={fixture} activityCodeLabel="NACE" />)

    expect(screen.getByText('Bakker Aldo')).toBeInTheDocument()
    expect(screen.getByText('0631.747.439')).toBeInTheDocument()
    expect(screen.getByTitle('Besloten vennootschap met beperkte aansprakelijkhe')).toHaveTextContent(
      'BV'
    )
    expect(screen.getByText('Kerkstraat 1, 2018 Antwerpen')).toBeInTheDocument()
    expect(screen.getByText('NACE 47241')).toBeInTheDocument()
    expect(
      screen.getByText('Detailhandel in brood, banketbakkerswerk, suikerwerk en chocolade')
    ).toBeInTheDocument()
  })

  it('hides the company name in detailsOnly mode for search-field embedding', () => {
    render(<KboConfirmedCard company={fixture} activityCodeLabel="NACE" variant="detailsOnly" />)

    expect(screen.queryByText('Bakker Aldo')).not.toBeInTheDocument()
    expect(screen.getByText('0631.747.439')).toBeInTheDocument()
    expect(screen.getByText('NACE 47241')).toBeInTheDocument()
  })
})
