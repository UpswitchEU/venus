/**
 * 🎬 Video Background Component
 *
 * Simplified video background for platform protection
 */

import React, { useEffect, useState } from 'react'

export interface VideoBackgroundProps {
  videos: string[]
  opacity?: number
  overlayGradient?: string
  disableAutoRotation?: boolean
}

const VideoBackground: React.FC<VideoBackgroundProps> = ({
  videos = [],
  opacity = 0.5,
  overlayGradient = 'from-black/40 via-black/30 to-black/60',
  disableAutoRotation = false,
}) => {
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0)

  useEffect(() => {
    if (disableAutoRotation || videos.length <= 1) return

    const interval = setInterval(() => {
      setCurrentVideoIndex((prev) => (prev + 1) % videos.length)
    }, 10000) // Change video every 10 seconds

    return () => clearInterval(interval)
  }, [videos.length, disableAutoRotation])

  if (videos.length === 0) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-background via-background/95 to-background" />
    )
  }

  return (
    <div className="fixed inset-0 overflow-hidden">
      <video
        key={currentVideoIndex}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        style={{ opacity }}
      >
        <source src={videos[currentVideoIndex]} type="video/mp4" />
      </video>

      {/* Overlay gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${overlayGradient}`} />
    </div>
  )
}

export default VideoBackground
