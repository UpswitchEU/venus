import path from 'node:path'
import { readFileSync } from 'node:fs'
const source = JSON.parse(readFileSync(new URL('./source-root.json', import.meta.url), 'utf8'))
export default {
  devIndicators: false,
  experimental: { externalDir: true },
  webpack(config, { webpack }) {
    config.resolve.alias['@'] = path.join(source, 'src')
    config.resolve.alias['@venus'] = path.join(source, 'src')
    config.resolve.alias['@venus-messages'] = path.join(source, 'messages/en.json')
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /(?:^|\/)(?:useSessionStore|useManualFormStore|useNormalizationStore|useTaxLatencyStore|reportAccessScope|logger|ReportAssetService)$/,
        (resource) => {
          resource.request = path.join(process.cwd(), 'fixture.js')
        },
      ),
    )
    return config
  },
}
