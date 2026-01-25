interface TableProps {
  children: React.ReactNode
  className?: string
}

export function Table({ children, className = '' }: TableProps) {
  return (
    <div className={`overflow-x-auto rounded-xl ${className}`}>
      <table className="min-w-full divide-y divide-gray-200">
        {children}
      </table>
    </div>
  )
}

export function TableHeader({ children }: TableProps) {
  return (
    <thead className="bg-gradient-to-r from-gray-50 to-blue-50">
      {children}
    </thead>
  )
}

export function TableBody({ children }: TableProps) {
  return (
    <tbody className="bg-white divide-y divide-gray-100">
      {children}
    </tbody>
  )
}

export function TableRow({ children, className = '' }: TableProps) {
  return (
    <tr className={`transition-colors duration-150 ${className}`}>
      {children}
    </tr>
  )
}

export function TableHead({ children, className = '' }: TableProps) {
  return (
    <th className={`px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider ${className}`}>
      {children}
    </th>
  )
}

export function TableCell({ children, className = '' }: TableProps) {
  return (
    <td className={`px-6 py-4 text-sm text-gray-900 ${className}`}>
      {children}
    </td>
  )
}
