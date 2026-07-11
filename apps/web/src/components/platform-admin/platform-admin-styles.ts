/** Platform Admin — tek TailAdmin/desk görünümü (eski glass admin-template yok). */
export const pa = {
  page: 'h-full overflow-y-auto bg-transparent px-4 py-8 pb-14 scrollbar-thin sm:px-6 lg:px-8',
  pageInner: 'relative mx-auto min-w-0 max-w-[1560px] space-y-6',

  textMuted: 'text-gray-500 dark:text-gray-400',
  textBody: 'text-gray-600 dark:text-gray-300',
  textStrong: 'text-gray-800 dark:text-white/90',

  field:
    'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90',
  fieldMono: 'font-mono text-xs',

  tableWrap: 'overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800',
  tableHead: 'bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 dark:bg-white/[0.03] dark:text-gray-400',
  tableRow: 'border-t border-gray-200 dark:border-gray-800',
  tableCell: 'px-4 py-3 text-gray-600 dark:text-gray-300',
  tableCellStrong: 'px-4 py-3 font-medium text-gray-800 dark:text-white/90',

  chip: 'rounded-full border border-gray-200 px-2.5 py-0.5 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300',
  inset: 'rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]',
  logLine: 'rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]',
  stickyBar:
    'sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900/95',
  listHover:
    'transition hover:bg-gray-50 dark:hover:bg-white/[0.03]',
  listSelected: 'border-l-2 border-l-brand-500 bg-brand-50 dark:bg-brand-500/10',
  actionBtn:
    'rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]',
} as const;
