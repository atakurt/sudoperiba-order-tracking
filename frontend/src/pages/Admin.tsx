import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { usersApi, permissionsApi, OrderStatus, PermissionsMap } from '../api/client'
import { useAuth } from '../context/AuthContext'
import LanguageSwitcher from '../components/LanguageSwitcher'
import ThemeToggle from '../components/ThemeToggle'

const ALL_STATUSES: OrderStatus[] = ['pending', 'packaging', 'packaged', 'shipped', 'delivered', 'cancelled']
const ROLES = ['user', 'admin']

type Tab = 'users' | 'permissions'

export default function Admin() {
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('users')

  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('user')
  const [createError, setCreateError] = useState('')

  const [localPerms, setLocalPerms] = useState<PermissionsMap | null>(null)
  const [permSaved, setPermSaved] = useState(false)

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then((r) => r.data),
  })

  const { data: permsData } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => permissionsApi.get().then((r) => r.data.permissions),
  })

  if (permsData && !localPerms) setLocalPerms(permsData)
  const displayPerms = localPerms ?? permsData ?? {}

  const createMutation = useMutation({
    mutationFn: () => usersApi.create({ email: newEmail, password: newPassword, role: newRole }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setNewEmail(''); setNewPassword(''); setNewRole('user'); setCreateError('')
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setCreateError(err.response?.data?.error ?? 'Error')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (err: { response?: { data?: { error?: string } } }) => {
      alert(err.response?.data?.error ?? 'Error')
    },
  })

  const permsMutation = useMutation({
    mutationFn: (perms: PermissionsMap) => permissionsApi.update(perms),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['permissions'] })
      setLocalPerms(res.data.permissions)
      setPermSaved(true)
      setTimeout(() => setPermSaved(false), 2000)
    },
  })

  const togglePerm = (role: string, status: OrderStatus) => {
    setPermSaved(false)
    setLocalPerms((prev) => {
      const current = prev ?? permsData ?? {}
      const statuses = current[role] ?? []
      const next = statuses.includes(status)
        ? statuses.filter((s) => s !== status)
        : [...statuses, status]
      return { ...current, [role]: next }
    })
  }

  const inputCls = "w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
  const roleBadge = (role: string) =>
    `inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
      role === 'admin'
        ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300'
        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
    }`

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button
            onClick={() => navigate('/orders')}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium whitespace-nowrap"
          >
            ←
            <span className="hidden sm:inline"> {t('orders.title')}</span>
          </button>
          <img src="/logo.png" alt="Logo" className="h-8 sm:h-9 object-contain shrink-0" />
          <h1 className="text-base sm:text-xl font-bold text-gray-800 dark:text-gray-100 truncate">{t('admin.title')}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <LanguageSwitcher />
          <ThemeToggle />
          <button
            onClick={logout}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <span className="hidden sm:inline">{t('common.signOut')}</span>
            <span className="sm:hidden">↩</span>
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
          {(['users', 'permissions'] as Tab[]).map((t_) => (
            <button
              key={t_}
              onClick={() => setTab(t_)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t_
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {t(`admin.tabs.${t_}`)}
            </button>
          ))}
        </div>

        {tab === 'users' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Create user form */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 sm:p-6">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">{t('admin.users.createUser')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="email"
                  placeholder={t('admin.users.email')}
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className={inputCls}
                />
                <input
                  type="password"
                  placeholder={t('admin.users.password')}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputCls}
                />
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className={inputCls}
                >
                  <option value="user">{t('admin.users.roleUser')}</option>
                  <option value="admin">{t('admin.users.roleAdmin')}</option>
                </select>
                <button
                  onClick={() => { setCreateError(''); createMutation.mutate() }}
                  disabled={!newEmail || !newPassword || createMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? t('admin.users.creating') : t('admin.users.createUser')}
                </button>
              </div>
              {createError && <p className="text-red-500 text-sm mt-2">{createError}</p>}
            </div>

            {/* Users — desktop table */}
            <div className="hidden sm:block bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('admin.users.columns.email')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('admin.users.columns.role')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('admin.users.columns.created')}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {(usersData ?? []).map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">
                        {u.email}
                        {u.id === user?.id && <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">({t('admin.users.you')})</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={roleBadge(u.role)}>
                          {u.role === 'admin' ? t('admin.users.roleAdmin') : t('admin.users.roleUser')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 dark:text-gray-500 text-xs">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {u.id !== user?.id && (
                          <button
                            onClick={() => { if (window.confirm(t('admin.users.deleteConfirm'))) deleteMutation.mutate(u.id) }}
                            className="text-red-500 hover:text-red-700 dark:hover:text-red-400 text-xs font-medium"
                          >
                            {t('admin.users.delete')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Users — mobile cards */}
            <div className="sm:hidden space-y-2">
              {(usersData ?? []).map((u) => (
                <div key={u.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                      {u.email}
                      {u.id === user?.id && <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">({t('admin.users.you')})</span>}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={roleBadge(u.role)}>
                        {u.role === 'admin' ? t('admin.users.roleAdmin') : t('admin.users.roleUser')}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </span>
                    </div>
                  </div>
                  {u.id !== user?.id && (
                    <button
                      onClick={() => { if (window.confirm(t('admin.users.deleteConfirm'))) deleteMutation.mutate(u.id) }}
                      className="text-red-500 hover:text-red-700 dark:hover:text-red-400 text-xs font-medium shrink-0"
                    >
                      {t('admin.users.delete')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'permissions' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('admin.permissions.title')}</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">{t('admin.permissions.subtitle')}</p>
            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
              <table className="text-sm min-w-max">
                <thead>
                  <tr>
                    <th className="text-left pr-8 pb-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('admin.users.columns.role')}</th>
                    {ALL_STATUSES.map((s) => (
                      <th key={s} className="px-3 pb-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">
                        {t(`status.${s}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {ROLES.map((role) => (
                    <tr key={role}>
                      <td className="pr-8 py-3">
                        <span className={roleBadge(role)}>
                          {role === 'admin' ? t('admin.users.roleAdmin') : t('admin.users.roleUser')}
                        </span>
                      </td>
                      {ALL_STATUSES.map((status) => {
                        const checked = (displayPerms[role] ?? []).includes(status)
                        return (
                          <td key={status} className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePerm(role, status)}
                              className="w-4 h-4 text-blue-600 rounded border-gray-300 dark:border-gray-600 cursor-pointer accent-blue-600"
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={() => permsMutation.mutate(displayPerms)}
                disabled={permsMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {permsMutation.isPending ? t('admin.permissions.saving') : t('admin.permissions.save')}
              </button>
              {permSaved && <span className="text-green-600 dark:text-green-400 text-sm font-medium">{t('admin.permissions.saved')}</span>}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
