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
      <table className="min-w-full divide-y divide-slate-200 dark:divide-white/10">
        {children}
      </table>
    </div>
  )
}

export const TableHeader: FC<TableProps> = ({ children }) => {
  return (
    <thead className="bg-slate-50/90 dark:bg-slate-900/70">
      {children}
    </thead>
  )
}

export const TableBody: FC<TableProps> = ({ children }) => {
  return (
    <tbody className="bg-white/95 divide-y divide-slate-100 dark:bg-slate-950/40 dark:divide-white/10">
      {children}
    </tbody>
  )
}

export const TableFooter: FC<TableProps> = ({ children }) => {
  return (
    <tfoot className="border-t border-slate-200 bg-slate-50/90 dark:border-white/10 dark:bg-slate-900/70">
      {children}
    </tfoot>
  )
}

type TableRowProps = HTMLAttributes<HTMLTableRowElement> & {
  children: ReactNode
}

export const TableRow: FC<TableRowProps> = ({ children, className = '', ...props }) => {
  return (
    <tr className={`transition-colors duration-150 text-slate-700 dark:text-slate-200 ${className}`} {...props}>
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
      className={`px-3 py-2 text-left text-xs font-bold uppercase tracking-wider leading-tight text-slate-600 dark:text-slate-300 ${className}`}
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
    <td className={`px-3 py-2 text-sm leading-tight text-slate-900 dark:text-slate-100 ${className}`} {...props}>
      {children}
    </td>
  )
}
