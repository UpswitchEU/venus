'use client';

/**
 * Valuation Report Template
 * 
 * React component for rendering valuation reports.
 * Replaces server-side HTML generation with client-side React rendering.
 * 
 * Features:
 * - 5-page report structure (Cover, Summary, Normalization, Calibration, Disclaimers)
 * - Print-optimized CSS
 * - Responsive design
 * - Accountant co-branding support
 */

import { format } from 'date-fns';
import { nl, enUS } from 'date-fns/locale';
import { useTranslations, useLocale } from 'next-intl';
import type { ValuationReportData, EBITDAAdjustment } from './types';

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `€${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `€${Math.round(value / 1000)}K`;
  }
  return `€${value.toLocaleString('nl-BE')}`;
}

function formatCurrencyExact(value: number): string {
  return `€${value.toLocaleString('nl-BE')}`;
}

function formatDate(date: Date | string, locale: 'nl' | 'en' = 'nl'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'd MMMM yyyy', { locale: locale === 'nl' ? nl : enUS });
}

// ============================================
// COMPONENT PROPS
// ============================================

interface ValuationReportTemplateProps {
  data: ValuationReportData;
  showPrintButton?: boolean;
  className?: string;
}

// ============================================
// MAIN COMPONENT
// ============================================

export function ValuationReportTemplate({
  data,
  showPrintButton = false,
  className = '',
}: ValuationReportTemplateProps) {
  const t = useTranslations('valuationReport');
  const locale = useLocale() as 'nl' | 'en';
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={`valuation-report ${className}`}>
      {showPrintButton && (
        <div className="print:hidden mb-4 flex justify-end">
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            {t('printPdf')}
          </button>
        </div>
      )}

      {/* Cover Page */}
      <CoverPage data={data} t={t} locale={locale} />

      {/* Executive Summary */}
      <ExecutiveSummaryPage data={data} t={t} locale={locale} />

      {/* EBITDA Normalization */}
      {data.ebitdaAdjustments && data.ebitdaAdjustments.length > 0 && (
        <NormalizationPage data={data} t={t} locale={locale} />
      )}

      {/* Valuation Calibration */}
      <CalibrationPage data={data} t={t} locale={locale} />

      {/* Disclaimers */}
      <DisclaimersPage data={data} t={t} locale={locale} />

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          .valuation-report {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .page {
            page-break-after: always;
          }
          .page:last-child {
            page-break-after: avoid;
          }
        }
      `}</style>
    </div>
  );
}

// ============================================
// PAGE COMPONENTS
// ============================================

type ReportT = (key: string, values?: Record<string, string | number>) => string;

function CoverPage({ data, t, locale }: { data: ValuationReportData; t: ReportT; locale: 'nl' | 'en' }) {
  return (
    <div className="page min-h-screen bg-slate-900 text-white p-12 flex flex-col justify-center relative">
      {/* Logo */}
      <div className="mb-12">
        <span className="text-2xl font-bold text-teal-400">upswitch</span>
      </div>

      {/* Company Name */}
      <h1 className="text-5xl font-bold mb-2">{data.companyName}</h1>
      <p className="text-xl text-slate-400 mb-12">{t('businessValuation')}</p>

      {/* Valuation Card */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-8 mb-8">
        <p className="text-sm text-teal-400 uppercase tracking-wider mb-2">
          {t('indicativeValue')}
        </p>
        <p className="text-6xl font-bold">{formatCurrency(data.valuation)}</p>
        {data.valuationLow && data.valuationHigh && (
          <p className="text-slate-400 mt-2">
            {t('bandwidth', { low: formatCurrency(data.valuationLow), high: formatCurrency(data.valuationHigh) })}
          </p>
        )}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-8 pt-8 border-t border-white/10">
        <div>
          <p className="text-sm text-slate-500">EBITDA</p>
          <p className="text-lg">{formatCurrency(data.ebitda)}</p>
        </div>
        <div>
          <p className="text-sm text-slate-500">{t('multiple')}</p>
          <p className="text-lg">{data.multiple.toFixed(2)}x</p>
        </div>
        {data.revenue && (
          <div>
            <p className="text-sm text-slate-500">{t('revenue')}</p>
            <p className="text-lg">{formatCurrency(data.revenue)}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="absolute bottom-8 left-12 right-12 flex justify-between text-sm text-slate-500">
        <span>{t('reportId', { id: data.id })}</span>
        <span>{t('generated', { date: formatDate(data.generatedAt, locale) })}</span>
      </div>
    </div>
  );
}

function ExecutiveSummaryPage({ data, t, locale }: { data: ValuationReportData; t: ReportT; locale: 'nl' | 'en' }) {
  return (
    <div className="page min-h-screen bg-white p-12">
      <PageHeader data={data} pageNumber={2} />

      <h1 className="text-3xl font-bold text-slate-900 mb-8">{t('summary')}</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <StatCard label={t('sustainableEbitda')} value={formatCurrency(data.ebitda)} />
        <StatCard 
          label={t('multiple')} 
          value={`${data.multiple.toFixed(2)}x`} 
          highlight 
        />
        <StatCard label={t('enterpriseValue')} value={formatCurrency(data.valuation)} />
      </div>

      {/* Valuation Range */}
      <div className="bg-white border-l-4 border-teal-500 rounded-lg p-6 mb-8 shadow-sm">
        <h3 className="font-semibold text-slate-800 mb-4">{t('valuationRange')}</h3>
        <table className="w-full">
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="py-2 text-slate-600">{t('conservative')}</td>
              <td className="py-2 text-right font-medium">
                {data.valuationLow ? formatCurrencyExact(data.valuationLow) : 'N/A'}
              </td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-2 text-slate-600">{t('median')}</td>
              <td className="py-2 text-right font-bold text-teal-600">
                {formatCurrencyExact(data.valuation)}
              </td>
            </tr>
            <tr>
              <td className="py-2 text-slate-600">{t('optimistic')}</td>
              <td className="py-2 text-right font-medium">
                {data.valuationHigh ? formatCurrencyExact(data.valuationHigh) : 'N/A'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Key Metrics */}
      {data.metrics.length > 0 && (
        <>
          <h2 className="text-xl font-semibold text-slate-800 mb-4">{t('coreData')}</h2>
          <table className="w-full mb-8">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('metric')}</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('value')}</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('trend')}</th>
              </tr>
            </thead>
            <tbody>
              {data.metrics.map((metric, index) => (
                <tr key={index} className="border-b border-slate-100">
                  <td className="py-3 px-4 text-slate-600">{metric.label}</td>
                  <td className="py-3 px-4 text-right font-medium">{metric.value}</td>
                  <td className={`py-3 px-4 text-right ${metric.change && metric.change > 0 ? 'text-green-600' : ''}`}>
                    {metric.change != null && (
                      <span>{metric.change > 0 ? '+' : ''}{metric.change.toFixed(1)}%</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <PageFooter companyName={data.companyName} pageNumber={2} t={t} />
    </div>
  );
}

function NormalizationPage({ data, t, locale }: { data: ValuationReportData; t: ReportT; locale: 'nl' | 'en' }) {
  return (
    <div className="page min-h-screen bg-white p-12">
      <PageHeader data={data} pageNumber={3} />

      <h1 className="text-3xl font-bold text-slate-900 mb-4">{t('ebitdaNormalization')}</h1>
      <p className="text-slate-600 mb-8">
        {t('normalizationIntro')}
      </p>

      {/* Adjustments Table */}
      <h2 className="text-xl font-semibold text-slate-800 mb-4">{t('normalizationAdjustments')}</h2>
      <table className="w-full mb-8">
        <thead>
          <tr className="bg-slate-50">
            <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('description')}</th>
            <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('category')}</th>
            <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('source')}</th>
            <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('amount')}</th>
          </tr>
        </thead>
        <tbody>
          {data.ebitdaAdjustments?.map((adj) => (
            <tr key={adj.id} className="border-b border-slate-100">
              <td className="py-3 px-4">
                <span className="text-slate-700">{adj.label}</span>
                {adj.description && (
                  <span className="block text-xs text-slate-500">{adj.description}</span>
                )}
              </td>
              <td className="py-3 px-4">
                <CategoryBadge category={adj.category} />
              </td>
              <td className="py-3 px-4 text-slate-500 text-sm">
                {adj.source && <span className="capitalize">{adj.source}</span>}
                {adj.sourceRef && <span className="block text-xs">{adj.sourceRef}</span>}
              </td>
              <td className={`py-3 px-4 text-right font-medium ${
                adj.type === 'add' ? 'text-green-600' : 
                adj.type === 'result' ? 'font-bold text-slate-900' : ''
              }`}>
                {adj.type === 'add' ? '+' : ''}{formatCurrencyExact(adj.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Multi-Year EBITDA */}
      {data.multiYearEbitda && data.multiYearEbitda.length > 0 && (
        <>
          <h2 className="text-xl font-semibold text-slate-800 mb-4">{t('multiYearEbitda')}</h2>
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('year')}</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('reported')}</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('normalized')}</th>
                <th className="text-center py-3 px-4 font-semibold text-slate-700">{t('weight')}</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('contribution')}</th>
              </tr>
            </thead>
            <tbody>
              {data.multiYearEbitda.map((year) => (
                <tr key={year.year} className="border-b border-slate-100">
                  <td className="py-3 px-4 font-medium">{year.year}</td>
                  <td className="py-3 px-4 text-right">{formatCurrencyExact(year.reportedEbitda)}</td>
                  <td className="py-3 px-4 text-right font-medium">{formatCurrencyExact(year.normalizedEbitda)}</td>
                  <td className="py-3 px-4 text-center">{Math.round(year.weight * 100)}%</td>
                  <td className="py-3 px-4 text-right text-teal-600 font-medium">
                    {formatCurrencyExact(year.normalizedEbitda * year.weight)}
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50">
                <td colSpan={4} className="py-3 px-4 font-bold">{t('sustainableEbitdaWeighted')}</td>
                <td className="py-3 px-4 text-right font-bold text-teal-600">
                  {formatCurrencyExact(data.ebitda)}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <PageFooter companyName={data.companyName} pageNumber={3} t={t} />
    </div>
  );
}

function CalibrationPage({ data, t, locale }: { data: ValuationReportData; t: ReportT; locale: 'nl' | 'en' }) {
  return (
    <div className="page min-h-screen bg-white p-12">
      <PageHeader data={data} pageNumber={4} />

      <h1 className="text-3xl font-bold text-slate-900 mb-4">{t('valuationCalibration')}</h1>
      <p className="text-slate-600 mb-8">
        {t('calibrationIntro')}
      </p>

      {/* Calculation */}
      <div className="bg-white border-l-4 border-teal-500 rounded-lg p-6 mb-8 shadow-sm">
        <h3 className="font-semibold text-slate-800 mb-4">{t('calculation')}</h3>
        <table className="w-full">
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="py-3 text-slate-600">{t('sustainableEbitda')}</td>
              <td className="py-3 text-right font-medium">{formatCurrencyExact(data.ebitda)}</td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-3 text-slate-600">× {t('multiple')}</td>
              <td className="py-3 text-right font-medium text-teal-600">{data.multiple.toFixed(2)}x</td>
            </tr>
            <tr className="bg-slate-50">
              <td className="py-3 font-bold text-slate-900">= {t('enterpriseValue')}</td>
              <td className="py-3 text-right font-bold text-slate-900">
                {formatCurrencyExact(data.valuation)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Methodology */}
      <div className="bg-slate-50 rounded-lg p-6 mb-8">
        <p className="text-slate-700">
          <strong>{t('appliedMethod')}</strong> {data.methodology || 'EBITDA Multiple'}
        </p>
        {data.methodologyNotes && (
          <p className="text-slate-600 mt-4">{data.methodologyNotes}</p>
        )}
      </div>

      {/* Comparables */}
      {data.comparables && data.comparables.length > 0 && (
        <>
          <h2 className="text-xl font-semibold text-slate-800 mb-4">{t('comparableTransactions')}</h2>
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('company')}</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('multiple')}</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('revenue')}</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-700">{t('date')}</th>
              </tr>
            </thead>
            <tbody>
              {data.comparables.map((comp, index) => (
                <tr key={index} className="border-b border-slate-100">
                  <td className="py-3 px-4 text-slate-700">{comp.company}</td>
                  <td className="py-3 px-4 text-right font-medium">{comp.multiple.toFixed(2)}x</td>
                  <td className="py-3 px-4 text-right">
                    {comp.revenue ? formatCurrencyExact(comp.revenue) : ''}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-500">{comp.date || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Confidence */}
      {data.confidenceScore != null && (
        <div className="bg-slate-50 rounded-lg p-6 mt-8">
          <div className="flex justify-between items-center">
            <span className="text-slate-700">{t('confidenceScore')}</span>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              data.confidenceScore >= 80 ? 'bg-green-100 text-green-700' :
              data.confidenceScore >= 60 ? 'bg-teal-100 text-teal-700' :
              'bg-yellow-100 text-yellow-700'
            }`}>
              {data.confidenceScore}%
            </span>
          </div>
        </div>
      )}

      <PageFooter companyName={data.companyName} pageNumber={4} t={t} />
    </div>
  );
}

function DisclaimersPage({ data, t, locale }: { data: ValuationReportData; t: ReportT; locale: 'nl' | 'en' }) {
  return (
    <div className="page min-h-screen bg-white p-12">
      <PageHeader data={data} pageNumber={5} />

      <h1 className="text-3xl font-bold text-slate-900 mb-8">{t('disclaimers')}</h1>

      <DisclaimerBox
        title="Indicatieve Waardering"
        text="Dit rapport bevat een indicatieve waardering gebaseerd op de verstrekte financiële gegevens en marktstandaarden. De uitkomst is geen garantie voor een definitieve transactieprijs en kan afwijken op basis van verdere due diligence, onderhandelingen en marktomstandigheden."
      />

      <DisclaimerBox
        title="Gegevensbronnen"
        text="De waardering is gebaseerd op door de gebruiker aangeleverde financiële data. Upswitch heeft de nauwkeurigheid van deze gegevens niet onafhankelijk geverifieerd. De betrouwbaarheid van de waardering is direct afhankelijk van de kwaliteit en volledigheid van de aangeleverde informatie."
      />

      <DisclaimerBox
        title="Geen Financieel Advies"
        text="Dit rapport vormt geen financieel, juridisch of fiscaal advies. Wij raden aan om voor belangrijke zakelijke beslissingen onafhankelijk advies in te winnen bij een gekwalificeerde adviseur."
      />

      <DisclaimerBox
        title="Intellectueel Eigendom"
        text="Dit rapport en de onderliggende methodologie zijn eigendom van Upswitch BV. Reproductie of distributie zonder schriftelijke toestemming is niet toegestaan."
      />

      {/* Accountant Branding */}
      {data.accountant && (
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-6 mt-8">
          <h3 className="font-semibold text-teal-800 mb-2">Opgesteld in samenwerking met</h3>
          <p className="text-xl font-semibold text-slate-800">{data.accountant.firmName}</p>
          {(data.accountant.website || data.accountant.email) && (
            <p className="text-sm text-slate-500 mt-2">
              {data.accountant.website}
              {data.accountant.website && data.accountant.email && ' | '}
              {data.accountant.email}
            </p>
          )}
        </div>
      )}

      <PageFooter companyName={data.companyName} pageNumber={5} t={t} />
    </div>
  );
}

// ============================================
// HELPER COMPONENTS
// ============================================

function PageHeader({ data, pageNumber }: { data: ValuationReportData; pageNumber: number }) {
  return (
    <div className="flex justify-between items-center pb-4 border-b border-slate-200 mb-8 print:mb-6">
      <span className="font-semibold text-teal-500">upswitch</span>
      <div className="text-right text-sm text-slate-500">
        <div>{data.companyName}</div>
        <div>{data.id}</div>
      </div>
    </div>
  );
}

function PageFooter({ companyName, pageNumber, t }: { companyName: string; pageNumber: number; t: ReportT }) {
  return (
    <div className="absolute bottom-8 left-12 right-12 flex justify-between text-sm text-slate-400 pt-4 border-t border-slate-200">
      <span>{companyName}</span>
      <span>{t('page', { number: pageNumber })}</span>
    </div>
  );
}

function StatCard({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
      <p className="text-sm text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-teal-600' : 'text-slate-900'}`}>
        {value}
      </p>
    </div>
  );
}

function CategoryBadge({ category }: { category: EBITDAAdjustment['category'] }) {
  const styles: Record<string, string> = {
    owner: 'bg-teal-100 text-teal-700',
    nonRecurring: 'bg-yellow-100 text-yellow-700',
    base: 'bg-slate-100 text-slate-600',
    result: 'bg-slate-100 text-slate-600',
    accounting: 'bg-blue-100 text-blue-700',
    normalization: 'bg-purple-100 text-purple-700',
  };

  const labels: Record<string, string> = {
    owner: 'Eigenaar',
    nonRecurring: 'Eenmalig',
    base: 'Basis',
    result: 'Resultaat',
    accounting: 'Boekhoudkundig',
    normalization: 'Normalisatie',
  };

  return (
    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${styles[category] || styles.normalization}`}>
      {labels[category] || category}
    </span>
  );
}

function DisclaimerBox({ title, text }: { title: string; text: string }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 mb-4">
      <h3 className="font-semibold text-slate-700 mb-2">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{text}</p>
    </div>
  );
}

export default ValuationReportTemplate;
