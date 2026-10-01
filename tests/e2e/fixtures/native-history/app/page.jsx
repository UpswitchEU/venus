import Link from 'next/link'
export default function Page() {
  return (
    <main>
      <h1>Local router fixture</h1>
      <Link href="/reports/a">Open report A</Link>
    </main>
  )
}
