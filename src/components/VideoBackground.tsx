import React, { useEffect, useRef, useState } from 'react'
import { readMobileViewportFallback, useMobileViewport } from '@/hooks/useMobileViewport'

export interface VideoBackgroundProps {
  videos: string[]
  transitionDuration?: number
  videoDuration?: number
  opacity?: number
  overlayGradient?: string
  objectPosition?: 'center' | 'top' | 'bottom'
  disableOnMobile?: boolean
  fallbackGradient?: string
  disableAutoRotation?: boolean
}

export const VideoBackground: React.FC<VideoBackgroundProps> = ({
  videos,
  transitionDuration = 1000,
  videoDuration = 8000,
  opacity = 0.6,
  overlayGradient = 'from-black/40 via-black/30 to-black/60',
  objectPosition = 'center',
  disableOnMobile = true,
  fallbackGradient = 'from-neutral-900 via-neutral-800 to-neutral-900',
  disableAutoRotation = false,
}) => {
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0)
  const [nextVideoIndex, setNextVideoIndex] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [hasError, setHasError] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const mobileViewport = useMobileViewport()
  const isMobile = mobileViewport.hasMeasured
    ? mobileViewport.matches
    : readMobileViewportFallback()

  // Initialize with random video
  useEffect(() => {
    if (videos.length === 0) return

    const initialIndex = Math.floor(Math.random() * videos.length)
    setCurrentVideoIndex(initialIndex)
    setNextVideoIndex(initialIndex)
  }, [videos])

  // Auto-rotate videos (disabled if disableAutoRotation is true)
  useEffect(() => {
    if (videos.length <= 1 || hasError || disableAutoRotation) return

    let transitionTimer: ReturnType<typeof setTimeout> | null = null
    const interval = setInterval(() => {
      const newIndex = Math.floor(Math.random() * videos.length)
      setNextVideoIndex(newIndex)
      setIsTransitioning(true)

      if (transitionTimer) clearTimeout(transitionTimer)
      transitionTimer = setTimeout(() => {
        setCurrentVideoIndex(newIndex)
        setIsTransitioning(false)
        transitionTimer = null
      }, transitionDuration)
    }, videoDuration)

    return () => {
      clearInterval(interval)
      if (transitionTimer) clearTimeout(transitionTimer)
    }
  }, [videos, videoDuration, transitionDuration, hasError, disableAutoRotation])

  // Keyboard interaction completely disabled - only automatic rotation controls videos
  // This prevents any keyboard events (including typing in input fields) from affecting video rotation

  // Set video-background class on body
  useEffect(() => {
    document.body.classList.add('video-background')
    return () => {
      document.body.classList.remove('video-background')
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    const video = videoRef.current
    return () => {
      if (video) {
        video.pause()
        video.src = ''
      }
    }
  }, [])

  // Fallback if mobile, no videos, or error
  if ((disableOnMobile && isMobile) || videos.length === 0 || hasError) {
    return <div className={`fixed inset-0 bg-gradient-to-br ${fallbackGradient} -z-10`} />
  }

  const objectPositionClass = {
    center: 'object-center',
    top: 'object-top',
    bottom: 'object-bottom',
  }[objectPosition]

  const opacityValue = Math.round(opacity * 100)

  const handleVideoError = () => {
    setHasError(true)
  }

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden" style={{ zIndex: -10 }}>
      {/* Current Video */}
      <video
        key={`current-${currentVideoIndex}`}
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        onError={handleVideoError}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity ${
          isTransitioning ? 'opacity-0' : `opacity-${opacityValue}`
        } ${objectPositionClass}`}
        style={{
          transitionDuration: `${transitionDuration}ms`,
          opacity: isTransitioning ? 0 : opacity,
        }}
      >
        <source src={videos[currentVideoIndex]} type="video/mp4" />
      </video>

      {/* Next Video (for smooth transition) */}
      {isTransitioning && (
        <video
          key={`next-${nextVideoIndex}`}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onError={handleVideoError}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity opacity-${opacityValue} ${objectPositionClass}`}
          style={{
            transitionDuration: `${transitionDuration}ms`,
            opacity,
          }}
        >
          <source src={videos[nextVideoIndex]} type="video/mp4" />
        </video>
      )}

      {/* Overlay Gradient */}
      <div className={`absolute inset-0 bg-gradient-to-b ${overlayGradient}`} />
    </div>
  )
}

export default VideoBackground
