import axios from 'axios'

export const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)

export type OrderStatus =
  | 'pending'
  | 'packaging'
  | 'packaged'
  | 'shipped'
  | 'delivered'
  | 'cancelled'

export interface Order {
  id: string
  customer_name: string
  customer_email: string
  customer_phone: string | null
  description: string | null
  status: OrderStatus
  created_at: string
  updated_at: string
}

export interface AuditEntry {
  id: string
  order_id: string
  changed_by: string
  changed_by_email: string
  from_status: OrderStatus | null
  to_status: OrderStatus
  changed_at: string
}

export interface OrderDetail extends Order {
  audit: AuditEntry[]
}

export interface UserInfo {
  id: string
  email: string
  role: string
  created_at?: string
}

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ token: string; user: UserInfo }>('/auth/login', { email, password }),
  me: () => api.get<UserInfo>('/auth/me'),
}

export interface OrdersPage {
  orders: Order[]
  total: number
  page: number
  per_page: number
}

export const ordersApi = {
  list: (status?: OrderStatus, page = 1, perPage = 20, q?: string) =>
    api.get<OrdersPage>('/orders', {
      params: {
        ...(status ? { status } : {}),
        ...(q ? { q } : {}),
        page,
        per_page: perPage,
      },
    }),
  get: (id: string) => api.get<OrderDetail>(`/orders/${id}`),
  changeStatus: (id: string, status: OrderStatus) =>
    api.patch<Order>(`/orders/${id}/status`, { status }),
  create: (data: { id: string; customer_name: string; customer_email: string; customer_phone?: string; description?: string }) =>
    api.post<Order>('/orders', data),
}

export const usersApi = {
  list: () => api.get<UserInfo[]>('/users'),
  create: (data: { email: string; password: string; role: string }) =>
    api.post<UserInfo>('/users', data),
  delete: (id: string) => api.delete(`/users/${id}`),
}

export type PermissionsMap = Record<string, OrderStatus[]>

export const permissionsApi = {
  get: () => api.get<{ permissions: PermissionsMap }>('/permissions'),
  update: (permissions: PermissionsMap) =>
    api.put<{ permissions: PermissionsMap }>('/permissions', { permissions }),
}
