import type {
  FC,
  ReactNode,
  HTMLAttributes,
  TableHTMLAttributes,
  ThHTMLAttributes,
  TdHTMLAttributes,
} from 'react'

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
    <thead className="bg-gray-50">
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

type TableRowProps = HTMLAttributes<HTMLTableRowElement> & {
  children: ReactNode
}

export const TableRow: FC<TableRowProps> = ({ children, className = '', ...props }) => {
  return (
    <tr className={`transition-colors duration-150 ${className}`} {...props}>
      {children}
    </tr>
  )
}

type TableHeadProps = ThHTMLAttributes<HTMLTableCellElement> & {
  children: ReactNode
}

export const TableHead: FC<TableHeadProps> = ({ children, className = '', ...props }) => {
  return (
    <th
      className={`px-3 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider leading-tight ${className}`}
      {...props}
    >
      {children}
    </th>
  )
}

type TableCellProps = TdHTMLAttributes<HTMLTableCellElement> & {
  children: ReactNode
}

export const TableCell: FC<TableCellProps> = ({ children, className = '', ...props }) => {
  return (
    <td className={`px-3 py-2 text-sm text-gray-900 leading-tight ${className}`} {...props}>
      {children}
    </td>
  )
}
