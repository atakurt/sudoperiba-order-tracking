import * as XLSX from 'xlsx'
import { Order, OrderStatus } from '../api/client'

const STATUS_LABELS: Record<string, Record<OrderStatus, string>> = {
  en: { pending: 'Pending', packaging: 'Packaging', packaged: 'Packaged', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' },
  tr: { pending: 'Beklemede', packaging: 'Paketleniyor', packaged: 'Paketlendi', shipped: 'Kargoya Verildi', delivered: 'Teslim Edildi', cancelled: 'İptal Edildi' },
  bs: { pending: 'Na čekanju', packaging: 'Pakovanje', packaged: 'Zapakovano', shipped: 'Poslano', delivered: 'Dostavljeno', cancelled: 'Otkazano' },
}

const HEADERS: Record<string, Record<string, string>> = {
  en: { id: 'Order ID', customer_name: 'Customer Name', customer_email: 'Customer Email', customer_phone: 'Phone', description: 'Description', status: 'Status', created_at: 'Created At', updated_at: 'Updated At' },
  tr: { id: 'Sipariş ID', customer_name: 'Müşteri Adı', customer_email: 'Müşteri E-postası', customer_phone: 'Telefon', description: 'Açıklama', status: 'Durum', created_at: 'Oluşturuldu', updated_at: 'Güncellendi' },
  bs: { id: 'ID narudžbe', customer_name: 'Ime kupca', customer_email: 'E-pošta kupca', customer_phone: 'Telefon', description: 'Opis', status: 'Status', created_at: 'Kreirano', updated_at: 'Ažurirano' },
}

export function exportOrdersToXlsx(orders: Order[], lang: string, filename?: string) {
  const h = HEADERS[lang] ?? HEADERS.en
  const s = STATUS_LABELS[lang] ?? STATUS_LABELS.en

  const rows = orders.map((o) => ({
    [h.id]: o.id,
    [h.customer_name]: o.customer_name,
    [h.customer_email]: o.customer_email,
    [h.customer_phone]: o.customer_phone ?? '',
    [h.description]: o.description ?? '',
    [h.status]: s[o.status] ?? o.status,
    [h.created_at]: new Date(o.created_at).toLocaleString(),
    [h.updated_at]: new Date(o.updated_at).toLocaleString(),
  }))

  const ws = XLSX.utils.json_to_sheet(rows)

  // Auto column widths
  const colWidths = Object.keys(rows[0] ?? {}).map((key) => ({
    wch: Math.max(key.length, ...rows.map((r) => String(r[key] ?? '').length)) + 2,
  }))
  ws['!cols'] = colWidths

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Orders')

  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, filename ?? `orders-${date}.xlsx`)
}
