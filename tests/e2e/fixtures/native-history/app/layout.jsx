import { ViewTransitions } from 'next-view-transitions'
import Providers from './providers'
export default function Layout({ children }) {
  return (
    <ViewTransitions>
      <html lang="en">
        <body>
          <Providers>{children}</Providers>
        </body>
      </html>
    </ViewTransitions>
  )
}
