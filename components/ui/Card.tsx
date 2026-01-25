interface CardProps {
  children: React.ReactNode
  className?: string
  variant?: 'default' | 'gradient' | 'bordered'
  hover?: boolean
}

export function Card({ children, className = '', variant = 'default', hover = false }: CardProps) {
  const baseClasses = 'rounded-xl p-6 transition-all duration-300'
  
  const variantClasses = {
    default: 'bg-white shadow-md border border-gray-100',
    gradient: 'bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg',
    bordered: 'bg-white border-2 border-gray-200 shadow-sm',
  }
  
  const hoverClass = hover ? 'hover:shadow-xl hover:-translate-y-1 cursor-pointer' : ''
  
  return (
    <div className={`${baseClasses} ${variantClasses[variant]} ${hoverClass} ${className}`}>
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '' }: CardProps) {
  return (
    <div className={`mb-4 ${className}`}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className = '' }: CardProps) {
  return (
    <h3 className={`text-lg font-semibold ${className}`}>
      {children}
    </h3>
  )
}

export function CardContent({ children, className = '' }: CardProps) {
  return (
    <div className={className}>
      {children}
    </div>
  )
}
