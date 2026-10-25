import { downloadCsv, toCsv, type CsvColumn } from './csv'

interface Row {
  t: string
  mw: number | null
  note: string
}

const columns: CsvColumn<Row>[] = [
  { header: 'time_utc', value: (r) => r.t },
  { header: 'actual_mw', value: (r) => r.mw },
  { header: 'note', value: (r) => r.note },
]

describe('toCsv', () => {
  it('writes a header, CRLF rows and empty cells for missing values', () => {
    const csv = toCsv(columns, [
      { t: '2026-01-02T00:00:00Z', mw: 9800, note: 'ok' },
      { t: '2026-01-02T00:30:00Z', mw: null, note: '' },
    ])
    expect(csv).toBe(
      'time_utc,actual_mw,note\r\n2026-01-02T00:00:00Z,9800,ok\r\n2026-01-02T00:30:00Z,,\r\n',
    )
  })

  it('quotes commas, quotes and newlines', () => {
    const csv = toCsv(columns, [{ t: 'a,b', mw: 1, note: 'say "hi"\nthere' }])
    expect(csv.split('\r\n')[1]).toBe('"a,b",1,"say ""hi""\nthere"')
  })
})

describe('downloadCsv', () => {
  it('creates and revokes an object URL for the file', () => {
    const create = vi.fn(() => 'blob:x')
    const revoke = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL: create, revokeObjectURL: revoke })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    downloadCsv('monitor.csv', 'a\r\n')
    expect(create).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledWith('blob:x')
    vi.unstubAllGlobals()
    click.mockRestore()
  })
})
