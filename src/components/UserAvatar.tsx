import { User } from 'lucide-react'
import React, { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

interface UserAvatarProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const UserAvatar: React.FC<UserAvatarProps> = React.memo(({ size = 'md', className = '' }) => {
  const { user, isLoading } = useAuth()
  const [imageError, setImageError] = useState(false)

  // Size configurations
  const sizeConfig = {
    sm: {
      container: 'w-6 h-6',
      text: 'text-xs',
      icon: 'w-3 h-3',
    },
    md: {
      container: 'w-8 h-8',
      text: 'text-sm',
      icon: 'w-4 h-4',
    },
    lg: {
      container: 'w-10 h-10',
      text: 'text-base',
      icon: 'w-5 h-5',
    },
  }

  const config = sizeConfig[size]

  // Get user initials for fallback
  const getUserInitials = () => {
    if (!user?.name) return '?'
    const names = user.name.split(' ')
    if (names.length >= 2) {
      return `${names[0][0]}${names[1][0]}`.toUpperCase()
    }
    return user.name.substring(0, 2).toUpperCase()
  }

  // Get avatar URL (check both avatar_url and avatar fields)
  const avatarUrl = user?.avatar_url || user?.avatar
  const hasValidAvatar = avatarUrl && !imageError

  // Handle image load error
  const handleImageError = () => {
    setImageError(true)
  }

  return (
    <div className={`relative ${className}`}>
      {/* Avatar Button */}
      <div
        className={`
          ${config.container}
          rounded-full
          flex items-center justify-center
          transition-colors duration-200
          cursor-pointer
          bg-foreground/10 hover:bg-foreground/15
          focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2
        `}
        aria-label={user ? `${user.name || 'User'}` : 'Guest'}
        role="button"
        tabIndex={0}
      >
        {isLoading ? (
          // Loading state
          <div className="animate-pulse bg-foreground/15 rounded-full w-full h-full" />
        ) : user && hasValidAvatar ? (
          // User with avatar image
          <img
            src={avatarUrl}
            alt={user.name || 'User avatar'}
            className="w-full h-full rounded-full object-cover"
            onError={handleImageError}
            loading="lazy"
          />
        ) : user ? (
          // User without avatar - show initials
          <span className={`${config.text} font-semibold text-foreground`} style={{ lineHeight: 1 }}>
            {getUserInitials()}
          </span>
        ) : (
          // Guest user - show User icon
          <User className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
    </div>
  )
})

export default UserAvatar
