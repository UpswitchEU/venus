/**
 * Video Assets Configuration
 * 
 * Centralized configuration for all video backgrounds used across the application.
 * Videos are stored in /public/videos/ directory.
 */

/**
 * All business background videos (business-1.mp4 through business-17.mp4)
 * These videos showcase diverse business owners and professional settings.
 * Used across landing pages and other pages with video backgrounds.
 */
export const ALL_BUSINESS_VIDEOS = [
	'/videos/business-1.mp4',
	'/videos/business-2.mp4',
	'/videos/business-3.mp4',
	'/videos/business-4.mp4',
	'/videos/business-5.mp4',
	'/videos/business-6.mp4',
	'/videos/business-7.mp4',
	'/videos/business-8.mp4',
	'/videos/business-9.mp4',
	'/videos/business-10.mp4',
	'/videos/business-11.mp4',
	'/videos/business-12.mp4',
	'/videos/business-13.mp4',
	'/videos/business-14.mp4',
	'/videos/business-15.mp4',
	'/videos/business-16.mp4',
	'/videos/business-17.mp4',
]

/**
 * Default video configuration for VideoBackground component
 */
export const DEFAULT_VIDEO_CONFIG = {
	opacity: 0.5,
	overlayGradient: 'from-black/40 via-black/30 to-black/60',
	disableAutoRotation: false,
	videoDuration: 8000, // 8 seconds per video
	transitionDuration: 1000, // 1 second transition
}





