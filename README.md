# 🌟 Venus - UpSwitch Valuation Calculator Frontend

**Venus - The Oracle's wisdom for business insights**

Venus is the valuation calculator frontend application that provides an intuitive interface for business valuations powered by ValuationIQ. It offers real-time valuation calculations, detailed reports, and comprehensive business analysis tools.

Part of the **Upswitch Platform** alongside Mercury (Main Frontend), Titan API (Backend), and ValuationIQ (Valuation Engine).

## Readiness-case role

Venus is the polished readiness-room surface for the Upswitch Readiness Case. It
should present the valuation range, sellability score, EBITDA bridge, missing
docs, buyer FAQ, IM draft, vault, and handoff package as one client-facing room.
Venus should not grow integration or review chrome; Mercury remains the advisor
cockpit and Titan remains the workflow source of truth.

## ✨ Features

- 💰 **Instant Valuations** - Real-time business valuation calculations
- 📊 **Detailed Reports** - Comprehensive valuation reports with academic citations
- 🔄 **Conversational Flow** - AI-powered conversational data collection
- 📈 **Analytics** - Advanced analytics and visualization
- 🎯 **Multiple Methodologies** - DCF, multiples, and ML-powered valuations
- 🔒 **Privacy-First** - GDPR-compliant, zero financial data exposure

## 🚀 Quick Start

### Installation

```bash
cd apps/venus
nvm use
corepack enable
pnpm install
```

### Development

```bash
pnpm dev
```

The application will be available at `http://localhost:3001` (or the port specified in your configuration).

### Build

```bash
pnpm build
```

## 🏗️ Tech Stack

- **Next.js 15.5.x** - React framework
- **TypeScript** - Type safety
- **TailwindCSS** - Styling
- **Recharts** - Data visualization
- **Axios** - HTTP client

## Code Quality

```bash
pnpm type-check
pnpm lint
pnpm run guard:repo-hygiene
pnpm run guard:type-debt
pnpm audit --prod
pnpm build
pnpm run guard:bundle-budget
pnpm test:run
```

Venus uses Node 20.19.6 and pnpm 10.26.x. Do not commit generated output such as `.next/`, `dist/`, `playwright-report/`, `test-results/`, logs, or local env files. Explicit `any` and TypeScript/lint suppressions are frozen by `guard:type-debt`; reduce the baseline when paying debt down.

## 🔗 Integration

Venus integrates with:
- **ValuationIQ** (`apps/valuation-iq`) - Backend valuation engine API
- **Titan API** (`apps/titan-api`) - User authentication and session management

## 📚 Documentation

- [Valuation Calculator Documentation](../docs/product/valuation-tester/)
- [API Documentation](./docs/api/)
- [Architecture Documentation](./docs/architecture/)

## 🎯 Key Features

### Conversational Valuation
- AI-powered question flow
- Automatic data validation
- Real-time feedback
- Context-aware suggestions

### Valuation Reports
- Professional-grade PDF reports
- Academic citations and sources
- Multiple valuation methodologies
- Confidence intervals and sensitivity analysis

## 📝 License

UNLICENSED - Proprietary

## 👥 Team

Upswitch Team
