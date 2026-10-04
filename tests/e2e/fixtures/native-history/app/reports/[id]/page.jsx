import Workspace from './workspace'
export default async function Page({ params }) {
  const { id } = await params
  return <Workspace key={id} id={id} />
}
