import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ordersApi, OrderStatus } from '../api/client'
import { useAuth } from '../context/AuthContext'
import StatusBadge from './StatusBadge'

const ALL_STATUSES: OrderStatus[] = ['pending', 'packaging', 'packaged', 'shipped', 'delivered', 'cancelled']
const USER_STATUSES: OrderStatus[] = ['packaging', 'packaged']

interface Props {
  orderId: string
  onClose: () => void
}

export default function OrderDetail({ orderId, onClose }: Props) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | ''>('')

  const { data, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => ordersApi.get(orderId).then((r) => r.data),
  })

  const mutation = useMutation({
    mutationFn: (status: OrderStatus) => ordersApi.changeStatus(orderId, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', orderId] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      setSelectedStatus('')
    },
  })

  const isAdmin = user?.role === 'admin'
  const availableStatuses = isAdmin ? ALL_STATUSES : USER_STATUSES
  const isLocked = !isAdmin && (data?.status === 'packaged' || data?.status === 'shipped')

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {isLoading || !data ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">{t('orderDetail.loading')}</div>
        ) : (
          <>
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mb-1">{data.id}</p>
                  <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{data.customer_name}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{data.customer_email}</p>
                  {data.customer_phone && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{data.customer_phone}</p>
                  )}
                  {data.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{data.description}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={data.status} />
                  <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-sm">
                    ✕ {t('common.close')}
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{t('orderDetail.changeStatus')}</h3>
              {isLocked ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 italic">{t('orderDetail.locked')}</p>
              ) : (
                <>
                  <div className="flex gap-2 flex-wrap">
                    {availableStatuses
                      .filter((s) => s !== data.status)
                      .map((s) => (
                        <button
                          key={s}
                          onClick={() => setSelectedStatus(s)}
                          className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                            selectedStatus === s
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                          }`}
                        >
                          {t(`status.${s}`)}
                        </button>
                      ))}
                  </div>
                  {selectedStatus && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => mutation.mutate(selectedStatus as OrderStatus)}
                        disabled={mutation.isPending}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                      >
                        {mutation.isPending
                          ? t('common.saving')
                          : t('orderDetail.setTo', { status: t(`status.${selectedStatus}`) })}
                      </button>
                      <button
                        onClick={() => setSelectedStatus('')}
                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  )}
                  {mutation.isError && (
                    <p className="text-red-500 text-sm mt-2">
                      {(mutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error
                        ?? t('orderDetail.statusError')}
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="p-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{t('orderDetail.auditLog')}</h3>
              {data.audit.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">{t('orderDetail.noChanges')}</p>
              ) : (
                <ol className="relative border-l border-gray-200 dark:border-gray-700 space-y-4 ml-2">
                  {data.audit.map((entry) => (
                    <li key={entry.id} className="ml-4">
                      <div className="absolute -left-1.5 w-3 h-3 rounded-full bg-blue-400 border-2 border-white dark:border-gray-800" />
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {new Date(entry.changed_at).toLocaleString()}
                        {' · '}
                        <span className="font-medium text-gray-600 dark:text-gray-400">{entry.changed_by_email}</span>
                      </p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">
                        {entry.from_status ? (
                          <>
                            <span>{t(`status.${entry.from_status}`)}</span>
                            {' → '}
                          </>
                        ) : `${t('orderDetail.initial')}: `}
                        <span className="font-medium">{t(`status.${entry.to_status}`)}</span>
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
