import type { FC, ReactNode } from 'react'

interface TableProps {
  children: ReactNode
  className?: string
}

export const Table: FC<TableProps> = ({ children, className = '' }) => {
  return (
    <div className={`overflow-x-auto rounded-xl ${className}`}>
      <table className="min-w-full divide-y divide-gray-200">
        {children}
      </table>
    </div>
  )
}

export const TableHeader: FC<TableProps> = ({ children }) => {
  return (
    <thead className="bg-gradient-to-r from-gray-50 to-blue-50">
      {children}
    </thead>
  )
}

export const TableBody: FC<TableProps> = ({ children }) => {
  return (
    <tbody className="bg-white divide-y divide-gray-100">
      {children}
    </tbody>
  )
}

export const TableRow: FC<TableProps> = ({ children, className = '' }) => {
  return (
    <tr className={`transition-colors duration-150 ${className}`}>
      {children}
    </tr>
  )
}

export const TableHead: FC<TableProps> = ({ children, className = '' }) => {
  return (
    <th className={`px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider ${className}`}>
      {children}
    </th>
  )
}

export const TableCell: FC<TableProps> = ({ children, className = '' }) => {
  return (
    <td className={`px-6 py-4 text-sm text-gray-900 ${className}`}>
      {children}
    </td>
  )
}
