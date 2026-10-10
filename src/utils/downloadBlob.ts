// Keep the URL alive while the browser asynchronously accepts the download.
// click() returning does not mean the download manager has consumed the blob.
const DOWNLOAD_HANDOFF_MS = 30_000

/** Starts a browser download; the browser owns delivery to the user's filesystem. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const cleanup = () => {
    link.remove()
    URL.revokeObjectURL(url)
  }

  try {
    link.href = url
    link.download = filename
    link.hidden = true
    document.body.appendChild(link)
    link.click()
  } catch (error) {
    cleanup()
    throw error
  }

  // Do not tie cleanup to React unmount: navigation may immediately follow a click.
  setTimeout(cleanup, DOWNLOAD_HANDOFF_MS)
}
