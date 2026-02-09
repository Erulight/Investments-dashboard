interface CardProps {
  children: React.ReactNode
  className?: string
  variant?: 'default' | 'gradient' | 'bordered'
  hover?: boolean
}

export function Card({ children, className = '', variant = 'default', hover = false }: CardProps) {
  const baseClasses = 'rounded-xl p-6 transition-all duration-300'
  
  const variantClasses = {
    default: 'bg-white shadow-sm border border-gray-200',
    gradient: 'bg-gradient-to-br from-slate-800 to-slate-900 text-white shadow-md',
    bordered: 'bg-white border border-gray-200 shadow-sm',
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
