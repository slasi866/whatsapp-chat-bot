import { h } from '../core/dom.js';

/**
 * Table builder.
 *
 * @param {{key?: string, label: string, align?: 'right', wrap?: boolean}[]} columns
 * @param {any[]} rows
 * @param {(row: any) => (Node|string|null)[]} renderRow cells in column order
 */
export function dataTable(columns, rows, renderRow) {
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      {},
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          columns.map((column) =>
            h('th', { class: [column.align === 'right' && 'right', column.wrap && 'wrap'] }, column.label),
          ),
        ),
      ),
      h(
        'tbody',
        { class: 'stagger' },
        rows.map((row, rowIndex) =>
          h(
            'tr',
            { style: { '--i': rowIndex } },
            renderRow(row).map((cell, index) => {
              const column = columns[index] ?? {};
              return h(
                'td',
                {
                  class: [
                    column.align === 'right' && 'right',
                    column.wrap && 'wrap',
                    column.actions && 'actions',
                  ],
                },
                cell,
              );
            }),
          ),
        ),
      ),
    ),
  );
}
