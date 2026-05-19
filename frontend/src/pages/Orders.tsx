import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ordersApi, OrderStatus } from '../api/client'
import { useAuth } from '../context/AuthContext'
import StatusBadge from '../components/StatusBadge'
import OrderDetail from '../components/OrderDetail'
import LanguageSwitcher from '../components/LanguageSwitcher'
import ThemeToggle from '../components/ThemeToggle'
import CreateOrderModal from '../components/CreateOrderModal'
import { exportOrdersToXlsx } from '../utils/exportXlsx'

const PER_PAGE_OPTIONS = [10, 20, 50, 100]

const ADMIN_TABS: { key: string; value: OrderStatus | 'all' }[] = [
  { key: 'status.all', value: 'all' },
  { key: 'status.pending', value: 'pending' },
  { key: 'status.packaging', value: 'packaging' },
  { key: 'status.packaged', value: 'packaged' },
  { key: 'status.shipped', value: 'shipped' },
  { key: 'status.delivered', value: 'delivered' },
  { key: 'status.cancelled', value: 'cancelled' },
]

const USER_TABS: { key: string; value: OrderStatus | 'all' }[] = [
  { key: 'status.all', value: 'all' },
  { key: 'status.pending', value: 'pending' },
  { key: 'status.packaging', value: 'packaging' },
  { key: 'status.packaged', value: 'packaged' },
  { key: 'status.shipped', value: 'shipped' },
]

export default function Orders() {
  const { user, logout } = useAuth()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [menuOpen, setMenuOpen] = useState(false)

  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => { setPage(1) }, [debouncedSearch])

  const { data: pageData, isLoading, isError } = useQuery({
    queryKey: ['orders', statusFilter, page, perPage, debouncedSearch],
    queryFn: () =>
      ordersApi
        .list(
          statusFilter !== 'all' ? statusFilter : undefined,
          page,
          perPage,
          debouncedSearch || undefined,
        )
        .then((r) => r.data),
  })

  const orders = pageData?.orders
  const totalPages = pageData ? Math.ceil(pageData.total / pageData.per_page) : 1

  const handleStatusFilter = (val: OrderStatus | 'all') => {
    setStatusFilter(val)
    setPage(1)
  }

  const handlePerPage = (val: number) => {
    setPerPage(val)
    setPage(1)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          {/* Left: logo + title */}
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo.png" alt="Logo" className="h-8 sm:h-9 object-contain shrink-0" />
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-bold text-gray-800 dark:text-gray-100 leading-tight">{t('orders.title')}</h1>
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate hidden sm:block">
                {t('orders.loggedInAs')} <span className="font-medium">{user?.email}</span>
                {' · '}
                {user?.role === 'admin' ? t('admin.users.roleAdmin') : t('admin.users.roleUser')}
              </p>
            </div>
          </div>

          {/* Right: desktop actions */}
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <LanguageSwitcher />
            <ThemeToggle />
            {isAdmin && (
              <>
                <button
                  onClick={() => setShowCreate(true)}
                  className="text-sm bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700"
                >
                  + {t('createOrder.button')}
                </button>
                <button
                  onClick={() => pageData && exportOrdersToXlsx(pageData.orders, i18n.resolvedLanguage ?? 'en')}
                  disabled={!pageData?.orders.length}
                  className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
                >
                  {t('export.button')}
                </button>
                <button
                  onClick={() => navigate('/admin')}
                  className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  {t('admin.title')}
                </button>
              </>
            )}
            <button
              onClick={logout}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {t('common.signOut')}
            </button>
          </div>

          {/* Right: mobile actions */}
          <div className="flex sm:hidden items-center gap-1.5 shrink-0">
            <ThemeToggle />
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={menuOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {menuOpen && (
          <div className="sm:hidden mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex flex-col gap-2">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {t('orders.loggedInAs')} <span className="font-medium">{user?.email}</span>
              {' · '}
              {user?.role === 'admin' ? t('admin.users.roleAdmin') : t('admin.users.roleUser')}
            </p>
            <div className="flex flex-wrap gap-2">
              <LanguageSwitcher />
              {isAdmin && (
                <>
                  <button
                    onClick={() => { setShowCreate(true); setMenuOpen(false) }}
                    className="text-sm bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700"
                  >
                    + {t('createOrder.button')}
                  </button>
                  <button
                    onClick={() => { pageData && exportOrdersToXlsx(pageData.orders, i18n.resolvedLanguage ?? 'en'); setMenuOpen(false) }}
                    disabled={!pageData?.orders.length}
                    className="text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
                  >
                    {t('export.button')}
                  </button>
                  <button
                    onClick={() => navigate('/admin')}
                    className="text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    {t('admin.title')}
                  </button>
                </>
              )}
              <button
                onClick={logout}
                className="text-sm text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                {t('common.signOut')}
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {/* Status filter tabs */}
        <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
          {(isAdmin ? ADMIN_TABS : USER_TABS).map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleStatusFilter(tab.value)}
              className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                statusFilter === tab.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {t(tab.key)}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search.placeholder')}
            className="w-full pl-9 pr-9 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              ✕
            </button>
          )}
        </div>

        {isLoading && (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">{t('orders.loading')}</div>
        )}
        {isError && (
          <div className="text-center py-12 text-red-500">{t('orders.error')}</div>
        )}
        {!isLoading && orders && orders.length === 0 && (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            {debouncedSearch ? t('search.noResults') : t('orders.empty')}
          </div>
        )}

        {orders && orders.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('orders.columns.id')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('orders.columns.customer')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('orders.columns.description')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('orders.columns.status')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('orders.columns.updated')}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-400 dark:text-gray-500">{order.id}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 dark:text-gray-100">{order.customer_name}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">{order.customer_email}</p>
                        {order.customer_phone && (
                          <p className="text-xs text-gray-400 dark:text-gray-500">{order.customer_phone}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-xs truncate">
                        {order.description ?? '—'}
                        {order.package_count > 1 && <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">×{order.package_count}</span>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                      <td className="px-4 py-3 text-gray-400 dark:text-gray-500 text-xs">{new Date(order.updated_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setSelectedOrderId(order.id)}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-xs font-medium"
                        >
                          {t('common.view')} →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="sm:hidden space-y-2">
              {orders.map((order) => (
                <button
                  key={order.id}
                  onClick={() => setSelectedOrderId(order.id)}
                  className="w-full text-left bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-800 dark:text-gray-100 truncate">{order.customer_name}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{order.customer_email}</p>
                      {order.customer_phone && (
                        <p className="text-xs text-gray-400 dark:text-gray-500">{order.customer_phone}</p>
                      )}
                      <p className="text-xs font-mono text-gray-300 dark:text-gray-600 mt-1">{order.id}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <StatusBadge status={order.status} />
                      <p className="text-xs text-gray-400 dark:text-gray-500">{new Date(order.updated_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  {(order.description || order.package_count > 1) && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 truncate">
                      {order.description}
                      {order.package_count > 1 && <span className="ml-1 text-gray-400 dark:text-gray-500">×{order.package_count}</span>}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Pagination */}
        {pageData && pageData.total > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span className="text-xs">{t('pagination.showing', { from: (page - 1) * perPage + 1, to: Math.min(page * perPage, pageData.total), total: pageData.total })}</span>
              <select
                value={perPage}
                onChange={(e) => handlePerPage(Number(e.target.value))}
                className="border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                {PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{t('pagination.perPage', { n })}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40">«</button>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40">‹</button>
              <span className="px-3 py-1 text-xs text-gray-600 dark:text-gray-300">{t('pagination.pageOf', { page, total: totalPages })}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40">›</button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40">»</button>
            </div>
          </div>
        )}
      </main>

      {selectedOrderId && (
        <OrderDetail orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />
      )}
      {showCreate && <CreateOrderModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
