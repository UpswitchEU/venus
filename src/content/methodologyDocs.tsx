export const METHODOLOGY_DOCS = {
  'valuation-approach': {
    title: 'Valuation Approach',
    content: (
      <>
        <div className="mb-6">
          <h3>How We Value Your Business</h3>
          <p>
            UpSwitch uses a hybrid approach combining two industry-standard methodologies to provide
            the most accurate valuation possible for your business.
          </p>
        </div>

        <div className="mb-6">
          <h4>Discounted Cash Flow (DCF)</h4>
          <p className="mb-3">
            The DCF method projects your company's future cash flows and discounts them to present
            value using a weighted average cost of capital (WACC). This method is particularly
            effective for businesses with:
          </p>
          <div className="bg-primary/10 rounded-lg p-4 border-l-4 border-primary transition-colors hover:bg-primary/20">
            <div className="space-y-2.5">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary mt-2"></div>
                <p className="text-sm text-muted-foreground">Predictable cash flow patterns</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary mt-2"></div>
                <p className="text-sm text-muted-foreground">Strong historical financial data</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary mt-2"></div>
                <p className="text-sm text-muted-foreground">Clear growth trajectories</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h4>Market Multiples</h4>
          <p className="mb-3">
            The market multiples approach compares your business to similar companies that have been
            sold or are publicly traded. We analyze:
          </p>
          <div className="bg-accent/10 rounded-lg p-4 border-l-4 border-accent transition-colors hover:bg-accent/20">
            <div className="space-y-2.5">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-2 h-2 rounded-full bg-accent mt-2"></div>
                <p className="text-sm text-muted-foreground">
                  <strong className="text-accent">Revenue multiples</strong> (Enterprise Value /
                  Revenue)
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-2 h-2 rounded-full bg-accent mt-2"></div>
                <p className="text-sm text-muted-foreground">
                  <strong className="text-accent">EBITDA multiples</strong> (Enterprise Value /
                  EBITDA)
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-2 h-2 rounded-full bg-accent mt-2"></div>
                <p className="text-sm text-muted-foreground">Industry-specific benchmarks</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h4>Weighted Combination</h4>
          <p className="mb-3">
            We don't just average the two methods. Instead, we dynamically weight them based on:
          </p>
          <div className="bg-moss-50 rounded-lg p-4 border-l-4 border-moss-500 transition-colors hover:bg-moss-100">
            <div className="space-y-2.5">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-2 h-2 rounded-full bg-moss-500 mt-2"></div>
                <p className="text-sm text-muted-foreground">Quality of your financial data</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-2 h-2 rounded-full bg-moss-500 mt-2"></div>
                <p className="text-sm text-muted-foreground">Availability of comparable companies</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-2 h-2 rounded-full bg-moss-500 mt-2"></div>
                <p className="text-sm text-muted-foreground">Business model characteristics</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-2 h-2 rounded-full bg-moss-500 mt-2"></div>
                <p className="text-sm text-muted-foreground">Market conditions</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 bg-gradient-to-r from-primary/10 to-primary/20 rounded-lg border-l-4 border-primary">
          <p className="text-sm text-foreground leading-relaxed">
            <strong className="text-primary">Result:</strong> This approach ensures your valuation
            reflects the most reliable methodology for your specific business profile.
          </p>
        </div>
      </>
    ),
  },

  'confidence-score': {
    title: 'Understanding Your Confidence Score',
    content: (
      <>
        <div className="mb-6">
          <h3>What is the Confidence Score?</h3>
          <p>
            The confidence score indicates how reliable we believe your valuation is, based on the
            quality and completeness of your data and current market conditions.
          </p>
        </div>

        <div className="mb-6">
          <h4>How We Calculate Confidence</h4>
          <p className="mb-4 text-muted-foreground">We evaluate eight key factors:</p>

          <div className="space-y-2.5">
            <div className="bg-primary/10 rounded-lg p-4 border-l-4 border-primary transition-colors hover:bg-primary/20">
              <h5 className="text-primary mb-1 font-semibold">Data Quality</h5>
              <p className="text-sm text-muted-foreground">
                Completeness and accuracy of your financial information
              </p>
            </div>

            <div className="bg-primary/10 rounded-lg p-4 border-l-4 border-primary transition-colors hover:bg-primary/20">
              <h5 className="text-primary mb-1 font-semibold">Historical Data</h5>
              <p className="text-sm text-muted-foreground">
                Years of historical financial data available for analysis
              </p>
            </div>

            <div className="bg-primary/10 rounded-lg p-4 border-l-4 border-primary transition-colors hover:bg-primary/20">
              <h5 className="text-primary mb-1 font-semibold">Methodology Agreement</h5>
              <p className="text-sm text-muted-foreground">
                How closely DCF and Multiples valuations agree with each other
              </p>
            </div>

            <div className="bg-primary/10 rounded-lg p-4 border-l-4 border-primary transition-colors hover:bg-primary/20">
              <h5 className="text-primary mb-1 font-semibold">Industry Benchmarks</h5>
              <p className="text-sm text-muted-foreground">
                Quality and quantity of comparable companies in your industry
              </p>
            </div>

            <div className="bg-primary/10 rounded-lg p-4 border-l-4 border-primary transition-colors hover:bg-primary/20">
              <h5 className="text-primary mb-1 font-semibold">Company Profile</h5>
              <p className="text-sm text-muted-foreground">
                Business stability, profitability, and growth characteristics
              </p>
            </div>

            <div className="bg-primary/10 rounded-lg p-4 border-l-4 border-primary transition-colors hover:bg-primary/20">
              <h5 className="text-primary mb-1 font-semibold">Market Conditions</h5>
              <p className="text-sm text-muted-foreground">
                Current market volatility and economic environment
              </p>
            </div>

            <div className="bg-primary/10 rounded-lg p-4 border-l-4 border-primary transition-colors hover:bg-primary/20">
              <h5 className="text-primary mb-1 font-semibold">Geographic Data</h5>
              <p className="text-sm text-muted-foreground">
                Quality of country-specific market data and benchmarks
              </p>
            </div>

            <div className="bg-primary/10 rounded-lg p-4 border-l-4 border-primary transition-colors hover:bg-primary/20">
              <h5 className="text-primary mb-1 font-semibold">Business Model Clarity</h5>
              <p className="text-sm text-muted-foreground">
                How well your business model fits standard valuation approaches
              </p>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h4>What the Score Means</h4>
          <div className="space-y-2 mt-3">
            <div className="flex items-start gap-3 p-3.5 bg-moss-50 rounded-lg border border-moss-200 transition-colors hover:bg-moss-100">
              <div className="flex-shrink-0 w-20 text-right">
                <span className="text-sm font-semibold text-moss-700">90-100%</span>
              </div>
              <div className="flex-1">
                <p className="text-sm text-moss-800 font-semibold">Very High Confidence</p>
                <p className="text-xs text-moss-700 mt-0.5">Valuation is highly reliable</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 bg-moss-50 rounded-lg border border-moss-200 transition-colors hover:bg-moss-100">
              <div className="flex-shrink-0 w-20 text-right">
                <span className="text-sm font-semibold text-moss-700">80-89%</span>
              </div>
              <div className="flex-1">
                <p className="text-sm text-moss-800 font-semibold">High Confidence</p>
                <p className="text-xs text-moss-700 mt-0.5">Valuation is very reliable</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 bg-primary/10 rounded-lg border border-primary/20 transition-colors hover:bg-primary/20">
              <div className="flex-shrink-0 w-20 text-right">
                <span className="text-sm font-semibold text-primary">70-79%</span>
              </div>
              <div className="flex-1">
                <p className="text-sm text-primary font-semibold">Good Confidence</p>
                <p className="text-xs text-primary mt-0.5">Valuation is reliable</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 bg-harvest-50 rounded-lg border border-harvest-200 transition-colors hover:bg-harvest-100">
              <div className="flex-shrink-0 w-20 text-right">
                <span className="text-sm font-semibold text-harvest-700">60-69%</span>
              </div>
              <div className="flex-1">
                <p className="text-sm text-harvest-800 font-semibold">Moderate Confidence</p>
                <p className="text-xs text-harvest-700 mt-0.5">Valuation is reasonably reliable</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 bg-orange-50 rounded-lg border border-orange-200 transition-colors hover:bg-orange-100">
              <div className="flex-shrink-0 w-20 text-right">
                <span className="text-sm font-semibold text-orange-700">&lt;60%</span>
              </div>
              <div className="flex-1">
                <p className="text-sm text-orange-800 font-semibold">Lower Confidence</p>
                <p className="text-xs text-orange-700 mt-0.5">Consider providing additional data</p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h4>How to Improve Your Score</h4>
          <div className="mt-3 space-y-2">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary mt-2"></div>
              <p className="text-sm">Provide complete financial statements</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary mt-2"></div>
              <p className="text-sm">Add 3+ years of historical data</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary mt-2"></div>
              <p className="text-sm">Ensure accurate revenue and EBITDA figures</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary mt-2"></div>
              <p className="text-sm">Provide detailed business model information</p>
            </div>
          </div>
        </div>
      </>
    ),
  },
} as const

export type DocumentationKey = keyof typeof METHODOLOGY_DOCS
