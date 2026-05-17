import { useTranslation } from 'react-i18next'
import { OrderStatus } from '../api/client'

const colors: Record<OrderStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  packaging: 'bg-blue-100 text-blue-800',
  packaged: 'bg-indigo-100 text-indigo-800',
  shipped: 'bg-purple-100 text-purple-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}

export default function StatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status]}`}>
      {t(`status.${status}`)}
    </span>
  )
}
