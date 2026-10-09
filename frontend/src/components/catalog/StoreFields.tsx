import type { ReactNode } from 'react'
export const StoreField = ({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) => (
  <label className="block">
    <span className="mb-1 block text-xs font-extrabold">{label}</span>
    {children}
  </label>
)
export const decimal = (value: string) => value.trim().replace(',', '.')
export const todayLocal = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
