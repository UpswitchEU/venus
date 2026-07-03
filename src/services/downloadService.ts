import { HTMLProcessor } from '../utils/htmlProcessor'
import { generalLogger } from '../utils/logger'

export interface DownloadOptions {
  format: 'html' | 'pdf'
  includeBranding?: boolean
  filename?: string
}

export interface ValuationData {
  companyName?: string
  valuationAmount?: number
  valuationDate?: Date
  method?: string
  confidenceScore?: number
  inputs?: Record<string, unknown>
  assumptions?: Record<string, unknown>
  htmlContent?: string
}

export class DownloadService {
  /**
   * Download valuation report as HTML
   */
  static async downloadHTML(
    data: ValuationData,
    options: DownloadOptions = { format: 'html' }
  ): Promise<void> {
    const filename = options.filename || `valuation-report-${Date.now()}.html`

    // Create standalone HTML with embedded styles
    const htmlContent = this.generateStandaloneHTML(data, options)

    // Create blob and download
    const blob = new Blob([htmlContent], { type: 'text/html' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    URL.revokeObjectURL(url)
  }

  /**
   * Download valuation report as PDF
   */
  static async downloadPDF(
    data: ValuationData,
    options: DownloadOptions = { format: 'pdf' }
  ): Promise<void> {
    try {
      // Dynamic import for html2pdf
      const html2pdf = await import('html2pdf.js')

      const filename = options.filename || `valuation-report-${Date.now()}.pdf`

      // Generate HTML content
      const htmlContent = this.generateStandaloneHTML(data, options)

      // Create temporary element
      const tempDiv = document.createElement('div')
      tempDiv.replaceChildren(HTMLProcessor.sanitizeToFragment(htmlContent, document))
      tempDiv.style.position = 'absolute'
      tempDiv.style.left = '-9999px'
      document.body.appendChild(tempDiv)

      // Configure PDF options
      const pdfOptions = {
        margin: [0.5, 0.5, 0.5, 0.5] as [number, number, number, number],
        filename: filename,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
        },
        jsPDF: {
          unit: 'in' as const,
          format: 'a4' as const,
          orientation: 'portrait' as const,
        },
      }

      // Generate and download PDF
      await html2pdf.default().set(pdfOptions).from(tempDiv).save()

      // Clean up
      document.body.removeChild(tempDiv)
    } catch (error) {
      generalLogger.error('PDF generation failed', { error })
      // Fallback to HTML download
      await this.downloadHTML(data, { ...options, format: 'html' })
    }
  }

  /**
   * Generate standalone HTML content with embedded styles
   */
  private static generateStandaloneHTML(data: ValuationData, _options: DownloadOptions): string {
    const currentDate = new Date().toLocaleDateString()
    const companyName = data.companyName || 'Company'
    const safeCompanyName = escapeHtml(companyName)
    const valuationAmount = data.valuationAmount ? data.valuationAmount.toLocaleString() : 'N/A'
    const method = data.method || 'DCF Analysis'
    const safeMethod = escapeHtml(method)
    const confidenceScore = data.confidenceScore ? Math.round(data.confidenceScore * 100) : 'N/A'

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Valuation Report - ${safeCompanyName}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #fff;
        }
        
        .header {
            background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
            color: white;
            padding: 2rem;
            text-align: center;
            margin-bottom: 2rem;
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
            font-weight: 700;
        }
        
        .header .subtitle {
            font-size: 1.2rem;
            opacity: 0.9;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 2rem;
        }
        
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }
        
        .summary-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 1.5rem;
            text-align: center;
        }
        
        .summary-card h3 {
            color: #64748b;
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 0.5rem;
        }
        
        .summary-card .value {
            font-size: 2rem;
            font-weight: 700;
            color: #1e293b;
        }
        
        .content-section {
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 2rem;
            margin-bottom: 2rem;
        }
        
        .content-section h2 {
            color: #1e293b;
            font-size: 1.5rem;
            margin-bottom: 1rem;
            padding-bottom: 0.5rem;
            border-bottom: 2px solid #3b82f6;
        }
        
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
        }
        
        .metric {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem;
            background: #f1f5f9;
            border-radius: 6px;
        }
        
        .metric-label {
            color: #64748b;
            font-weight: 500;
        }
        
        .metric-value {
            color: #1e293b;
            font-weight: 600;
        }
        
        .confidence-bar {
            width: 100%;
            height: 8px;
            background: #e2e8f0;
            border-radius: 4px;
            overflow: hidden;
            margin-top: 0.5rem;
        }
        
        .confidence-fill {
            height: 100%;
            background: linear-gradient(90deg, #3b82f6, #8b5cf6);
            border-radius: 4px;
            transition: width 0.3s ease;
        }
        
        .footer {
            margin-top: 3rem;
            padding: 2rem;
            background: #f8fafc;
            border-top: 1px solid #e2e8f0;
            text-align: center;
            color: #64748b;
        }
        
        .branding {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            margin-top: 1rem;
        }
        
        .branding .logo {
            width: 24px;
            height: 24px;
            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
            border-radius: 4px;
        }
        
        @media print {
            .header {
                background: #1e293b !important;
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
            }
            
            .summary-card {
                border: 1px solid #e2e8f0 !important;
            }
            
            .content-section {
                border: 1px solid #e2e8f0 !important;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Valuation Report</h1>
        <div class="subtitle">${safeCompanyName} • ${currentDate}</div>
    </div>
    
    <div class="container">
        <div class="summary-grid">
            <div class="summary-card">
                <h3>Valuation Amount</h3>
                <div class="value">$${valuationAmount}</div>
            </div>
            <div class="summary-card">
                <h3>Method</h3>
                <div class="value">${safeMethod}</div>
            </div>
            <div class="summary-card">
                <h3>Confidence</h3>
                <div class="value">${confidenceScore}%</div>
            </div>
        </div>
        
        <div class="content-section">
            <h2>Valuation Details</h2>
            <div class="metrics-grid">
                <div class="metric">
                    <span class="metric-label">Company</span>
                    <span class="metric-value">${safeCompanyName}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Method</span>
                    <span class="metric-value">${safeMethod}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Date</span>
                    <span class="metric-value">${currentDate}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Confidence Score</span>
                    <span class="metric-value">${confidenceScore}%</span>
                </div>
            </div>
        </div>
        
        ${
          data.htmlContent
            ? `
        <div class="content-section">
            <h2>Detailed Analysis</h2>
            <div style="margin-top: 1rem;">
                ${HTMLProcessor.sanitize(data.htmlContent)}
            </div>
        </div>
        `
            : ''
        }
    </div>
    
    <div class="footer">
        <p>Generated by Upswitch Valuation Engine</p>
        <div class="branding">
            <div class="logo"></div>
            <span>Upswitch</span>
        </div>
    </div>
</body>
</html>`
  }

  /**
   * Get default filename based on company and date
   */
  static getDefaultFilename(companyName?: string, format: 'html' | 'pdf' = 'html'): string {
    const date = new Date().toISOString().split('T')[0]
    const company: string = companyName
      ? companyName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
      : 'company'
    return `${company}-valuation-${date}.${format}`
  }
}

function escapeHtml(value: string): string {
  const replacements: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return value.replace(/[&<>"']/g, (character) => replacements[character])
}
