import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, CSSProperties } from 'react'
import {
  deletePropertyLoanLedgerRow,
  generatePropertyLoanLedgerProjection,
  insertPropertyLoanLedgerRow,
  parseLoanLedgerFormValues,
  rowToFormValues,
  updatePropertyLoanLedgerRow,
  validateLedgerRow,
} from '@/services/propertyLoanLedgerService'
import {
  EMPTY_LOAN_LEDGER_FORM_VALUES,
  LOAN_LEDGER_SOURCE_OPTIONS,
} from '@/types/loanLedger'
import type { LoanLedgerFormValues, LoanLedgerRow } from '@/types/loanLedger'

type EditableLoanLedgerTableProps = {
  propertyId: string
  rows: LoanLedgerRow[]
  onChanged: () => Promise<void> | void
}

function formatCurrency(value: unknown): string {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number(value ?? NaN)

  if (!Number.isFinite(parsed)) return '—'

  try {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    }).format(parsed)
  } catch {
    return `${parsed.toFixed(2)} €`
  }
}

function formatPlain(value: unknown): string {
  if (value == null) return '—'
  const str = String(value).trim()
  return str || '—'
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  )

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [breakpoint])

  return isMobile
}

const styles: Record<string, CSSProperties> = {
  wrapper: {
    border: '1px solid #e5e7eb',
    borderRadius: 16,
    background: '#ffffff',
    padding: 20,
    minWidth: 0,
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    color: '#111827',
  },
  metaBox: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    background: '#f8fafc',
    border: '1px solid #e5e7eb',
    color: '#475569',
    fontSize: 13,
    lineHeight: 1.5,
    wordBreak: 'break-word',
  },
  primaryButton: {
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '10px 14px',
    background: '#ffffff',
    color: '#374151',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  dangerButton: {
    border: '1px solid #fecaca',
    borderRadius: 8,
    padding: '8px 12px',
    background: '#ffffff',
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  neutralButton: {
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '8px 12px',
    background: '#ffffff',
    color: '#374151',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  saveButton: {
    border: '1px solid #bbf7d0',
    borderRadius: 8,
    padding: '8px 12px',
    background: '#f0fdf4',
    color: '#166534',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
  disabledButton: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  errorBox: {
    border: '1px solid #fecaca',
    background: '#fef2f2',
    color: '#b91c1c',
    borderRadius: 12,
    padding: '12px 14px',
    fontSize: 14,
    marginBottom: 16,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  scroll: {
    overflowX: 'auto',
    width: '100%',
    WebkitOverflowScrolling: 'touch',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    tableLayout: 'fixed',
  },
  thead: {
    background: '#f8fafc',
  },
  th: {
    textAlign: 'left',
    padding: '12px 14px',
    borderBottom: '1px solid #e5e7eb',
    color: '#374151',
    fontSize: 13,
    fontWeight: 700,
    verticalAlign: 'middle',
  },
  td: {
    padding: '12px 14px',
    borderBottom: '1px solid #e5e7eb',
    color: '#111827',
    fontSize: 14,
    verticalAlign: 'top',
    wordBreak: 'break-word',
  },
  mutedText: {
    color: '#6b7280',
  },
  rowActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '10px 10px',
    fontSize: 14,
    color: '#111827',
    background: '#ffffff',
  },
  select: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '10px 10px',
    fontSize: 14,
    color: '#111827',
    background: '#ffffff',
  },
  fieldError: {
    marginTop: 6,
    fontSize: 12,
    color: '#dc2626',
    wordBreak: 'break-word',
  },
  emptyState: {
    textAlign: 'center',
    color: '#6b7280',
    padding: '20px 12px',
    fontSize: 14,
  },
  addRow: {
    background: '#f8fafc',
  },
  mobileList: {
    display: 'grid',
    gap: 12,
  },
  mobileCard: {
    border: '1px solid #e5e7eb',
    borderRadius: 14,
    padding: 14,
    background: '#ffffff',
  },
  mobileCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  mobileYearBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 10px',
    borderRadius: 999,
    background: '#eef2ff',
    color: '#3730a3',
    fontSize: 13,
    fontWeight: 800,
  },
  mobileGrid: {
    display: 'grid',
    gap: 10,
  },
  mobileField: {
    border: '1px solid #f1f5f9',
    borderRadius: 10,
    padding: 10,
    background: '#f8fafc',
  },
  mobileFieldLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    marginBottom: 4,
  },
  mobileFieldValue: {
    fontSize: 14,
    color: '#111827',
    wordBreak: 'break-word',
  },
  mobileActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 12,
  },
  mobileAddCard: {
    border: '1px solid #dbeafe',
    borderRadius: 14,
    padding: 14,
    background: '#f8fbff',
    marginBottom: 12,
  },
}

export default function EditableLoanLedgerTable({
  propertyId,
  rows,
  onChanged,
}: EditableLoanLedgerTableProps) {
  const isMobile = useIsMobile()

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingValues, setEditingValues] = useState<LoanLedgerFormValues | null>(null)
  const [isAddingRow, setIsAddingRow] = useState(false)
  const [newValues, setNewValues] = useState<LoanLedgerFormValues>({
    ...EMPTY_LOAN_LEDGER_FORM_VALUES,
  })
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof LoanLedgerFormValues, string>>
  >({})
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const yearA = Number.isFinite(a.year) ? a.year : 0
      const yearB = Number.isFinite(b.year) ? b.year : 0
      return yearA - yearB
    })
  }, [rows])

  const lastRow = sortedRows[sortedRows.length - 1]
  const [showAutoGenerator, setShowAutoGenerator] = useState(false)
  const [autoValues, setAutoValues] = useState({
    startYear: String((lastRow?.year ?? new Date().getFullYear()) + 1),
    endYear: String((lastRow?.year ?? new Date().getFullYear()) + 10),
    startBalance: String(lastRow?.balance ?? ''),
    interestRatePercent: '3.5',
    annualPrincipal: '',
  })

  function clearMessages() {
    setFieldErrors({})
    setErrorMessage(null)
  }

  function handleStartAdd() {
    setIsAddingRow(true)
    setEditingId(null)
    setEditingValues(null)
    setNewValues({ ...EMPTY_LOAN_LEDGER_FORM_VALUES })
    clearMessages()
  }

  function handleCancelAdd() {
    setIsAddingRow(false)
    setNewValues({ ...EMPTY_LOAN_LEDGER_FORM_VALUES })
    clearMessages()
  }

  function handleEdit(row: LoanLedgerRow) {
    setEditingId(row.id)
    setEditingValues(rowToFormValues(row))
    setIsAddingRow(false)
    clearMessages()
  }

  function handleCancelEdit() {
    setEditingId(null)
    setEditingValues(null)
    clearMessages()
  }

  function handleNewFieldChange(
    field: keyof LoanLedgerFormValues,
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const value = event.target.value

    setNewValues((prev) => ({
      ...prev,
      [field]: value,
    }))

    setFieldErrors((prev) => ({
      ...prev,
      [field]: undefined,
    }))
  }

  function handleEditFieldChange(
    field: keyof LoanLedgerFormValues,
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const value = event.target.value

    setEditingValues((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        [field]: value,
      }
    })

    setFieldErrors((prev) => ({
      ...prev,
      [field]: undefined,
    }))
  }

  async function handleSaveNewRow() {
    clearMessages()

    const validation = validateLedgerRow(newValues)
    if (!validation.valid) {
      setFieldErrors(validation.errors)
      return
    }

    try {
      setSaving(true)
      const payload = parseLoanLedgerFormValues(newValues)
      await insertPropertyLoanLedgerRow(propertyId, payload)
      setIsAddingRow(false)
      setNewValues({ ...EMPTY_LOAN_LEDGER_FORM_VALUES })
      await onChanged()
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Die neue Zeile konnte nicht gespeichert werden.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveEdit() {
    if (editingId == null || !editingValues) return

    clearMessages()

    const validation = validateLedgerRow(editingValues)
    if (!validation.valid) {
      setFieldErrors(validation.errors)
      return
    }

    try {
      setSaving(true)
      const payload = parseLoanLedgerFormValues(editingValues)
      await updatePropertyLoanLedgerRow(editingId, payload)
      setEditingId(null)
      setEditingValues(null)
      await onChanged()
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Die Änderung konnte nicht gespeichert werden.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(row: LoanLedgerRow) {
    const confirmed =
      typeof window !== 'undefined'
        ? window.confirm(`Möchtest du den Ledger-Eintrag für ${row.year} wirklich löschen?`)
        : false

    if (!confirmed) return

    try {
      setSaving(true)
      clearMessages()
      await deletePropertyLoanLedgerRow(row.id)
      await onChanged()
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Die Zeile konnte nicht gelöscht werden.'
      )
    } finally {
      setSaving(false)
    }
  }


  function handleOpenAutoGenerator() {
    const baseYear = lastRow?.year ?? new Date().getFullYear()
    setAutoValues({
      startYear: String(baseYear + 1),
      endYear: String(baseYear + 10),
      startBalance: String(lastRow?.balance ?? ''),
      interestRatePercent: autoValues.interestRatePercent || '3.5',
      annualPrincipal: autoValues.annualPrincipal || '',
    })
    setShowAutoGenerator((prev) => !prev)
    clearMessages()
  }

  async function handleGenerateProjection() {
    try {
      setSaving(true)
      clearMessages()
      const count = await generatePropertyLoanLedgerProjection(propertyId, {
        startYear: Number(autoValues.startYear),
        endYear: Number(autoValues.endYear),
        startBalance: Number(String(autoValues.startBalance).replace(',', '.')),
        interestRatePercent: Number(String(autoValues.interestRatePercent).replace(',', '.')),
        annualPrincipal: Number(String(autoValues.annualPrincipal).replace(',', '.')),
        source: 'auto_projection',
      })
      setShowAutoGenerator(false)
      await onChanged()
      setErrorMessage(`Automatische Darlehensfortschreibung gespeichert: ${count} Jahr(e).`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Automatische Darlehensfortschreibung fehlgeschlagen.')
    } finally {
      setSaving(false)
    }
  }

  function renderFieldError(field: keyof LoanLedgerFormValues) {
    if (!fieldErrors[field]) return null
    return <div style={styles.fieldError}>{fieldErrors[field]}</div>
  }

  function renderFormFields(values: LoanLedgerFormValues, mode: 'add' | 'edit') {
    const onChange = mode === 'add' ? handleNewFieldChange : handleEditFieldChange

    return (
      <>
        <div>
          <div style={styles.mobileFieldLabel}>Jahr</div>
          <input
            type="number"
            step="1"
            min="1900"
            max="2200"
            value={values.year}
            onChange={(event) => onChange('year', event)}
            disabled={saving}
            style={styles.input}
          />
          {renderFieldError('year')}
        </div>

        <div>
          <div style={styles.mobileFieldLabel}>Zinsen</div>
          <input
            type="number"
            step="0.01"
            min="0"
            value={values.interest}
            onChange={(event) => onChange('interest', event)}
            disabled={saving}
            style={styles.input}
          />
          {renderFieldError('interest')}
        </div>

        <div>
          <div style={styles.mobileFieldLabel}>Tilgung</div>
          <input
            type="number"
            step="0.01"
            min="0"
            value={values.principal}
            onChange={(event) => onChange('principal', event)}
            disabled={saving}
            style={styles.input}
          />
          {renderFieldError('principal')}
        </div>

        <div>
          <div style={styles.mobileFieldLabel}>Restschuld</div>
          <input
            type="number"
            step="0.01"
            min="0"
            value={values.balance}
            onChange={(event) => onChange('balance', event)}
            disabled={saving}
            style={styles.input}
          />
          {renderFieldError('balance')}
        </div>

        <div>
          <div style={styles.mobileFieldLabel}>Quelle</div>
          <select
            value={values.source}
            onChange={(event) => onChange('source', event)}
            disabled={saving}
            style={styles.select}
          >
            <option value="">Bitte wählen</option>
            {LOAN_LEDGER_SOURCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {renderFieldError('source')}
        </div>
      </>
    )
  }

  function renderDesktopFormCells(values: LoanLedgerFormValues, mode: 'add' | 'edit') {
    const onChange = mode === 'add' ? handleNewFieldChange : handleEditFieldChange

    return (
      <>
        <td style={styles.td}>
          <input
            type="number"
            step="1"
            min="1900"
            max="2200"
            value={values.year}
            onChange={(event) => onChange('year', event)}
            disabled={saving}
            style={styles.input}
          />
          {renderFieldError('year')}
        </td>

        <td style={styles.td}>
          <input
            type="number"
            step="0.01"
            min="0"
            value={values.interest}
            onChange={(event) => onChange('interest', event)}
            disabled={saving}
            style={styles.input}
          />
          {renderFieldError('interest')}
        </td>

        <td style={styles.td}>
          <input
            type="number"
            step="0.01"
            min="0"
            value={values.principal}
            onChange={(event) => onChange('principal', event)}
            disabled={saving}
            style={styles.input}
          />
          {renderFieldError('principal')}
        </td>

        <td style={styles.td}>
          <input
            type="number"
            step="0.01"
            min="0"
            value={values.balance}
            onChange={(event) => onChange('balance', event)}
            disabled={saving}
            style={styles.input}
          />
          {renderFieldError('balance')}
        </td>

        <td style={styles.td}>
          <select
            value={values.source}
            onChange={(event) => onChange('source', event)}
            disabled={saving}
            style={styles.select}
          >
            <option value="">Bitte wählen</option>
            {LOAN_LEDGER_SOURCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {renderFieldError('source')}
        </td>
      </>
    )
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.headerRow}>
        <h3 style={styles.title}>Darlehens-Ledger</h3>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={handleOpenAutoGenerator} disabled={saving || isAddingRow || editingId !== null} style={{ ...styles.primaryButton, ...(saving || isAddingRow || editingId !== null ? styles.disabledButton : {}) }}>Auto-Fortschreibung</button>
          <button type="button" onClick={handleStartAdd} disabled={saving || isAddingRow || editingId !== null} style={{ ...styles.primaryButton, ...(saving || isAddingRow || editingId !== null ? styles.disabledButton : {}) }}>Neue Zeile</button>
        </div>
      </div>

      <div style={styles.metaBox}>
        Restschuld-Quelle für Portfolio und Objektauswertungen. Letzter Eintrag: {lastRow ? `${lastRow.year} / ${formatCurrency(lastRow.balance)}` : 'noch keiner'}.
      </div>

      {showAutoGenerator ? (
        <div style={{ ...styles.metaBox, background: '#f8fbff', borderColor: '#bfdbfe' }}>
          <div style={{ fontWeight: 800, color: '#111827', marginBottom: 10 }}>Automatische Darlehensfortschreibung</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
            {[['startYear', 'Startjahr'], ['endYear', 'Bis Jahr'], ['startBalance', 'Start-Restschuld'], ['interestRatePercent', 'Zins %'], ['annualPrincipal', 'Jährliche Tilgung']].map(([key, label]) => (
              <label key={key} style={{ display: 'grid', gap: 4 }}>
                <span style={styles.mobileFieldLabel}>{label}</span>
                <input type="number" step={key.includes('Year') ? '1' : '0.01'} value={autoValues[key as keyof typeof autoValues]} onChange={(event) => setAutoValues((prev) => ({ ...prev, [key]: event.target.value }))} disabled={saving} style={styles.input} />
              </label>
            ))}
          </div>
          <div style={{ ...styles.rowActions, marginTop: 12 }}>
            <button type="button" onClick={handleGenerateProjection} disabled={saving} style={{ ...styles.saveButton, ...(saving ? styles.disabledButton : {}) }}>Generieren & speichern</button>
            <button type="button" onClick={() => setShowAutoGenerator(false)} disabled={saving} style={{ ...styles.neutralButton, ...(saving ? styles.disabledButton : {}) }}>Schließen</button>
          </div>
        </div>
      ) : null}

      {errorMessage ? <div style={styles.errorBox}>{errorMessage}</div> : null}

      {isMobile ? (
        <div style={styles.mobileList}>
          {isAddingRow ? (
            <div style={styles.mobileAddCard}>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  color: '#111827',
                  marginBottom: 12,
                }}
              >
                Neue Zeile
              </div>

              <div style={styles.mobileGrid}>{renderFormFields(newValues, 'add')}</div>

              <div style={styles.mobileActions}>
                <button
                  type="button"
                  onClick={handleSaveNewRow}
                  disabled={saving}
                  style={{
                    ...styles.saveButton,
                    ...(saving ? styles.disabledButton : {}),
                  }}
                >
                  Speichern
                </button>
                <button
                  type="button"
                  onClick={handleCancelAdd}
                  disabled={saving}
                  style={{
                    ...styles.neutralButton,
                    ...(saving ? styles.disabledButton : {}),
                  }}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          ) : null}

          {sortedRows.length === 0 && !isAddingRow ? (
            <div style={styles.emptyState}>Noch keine Ledger-Einträge vorhanden.</div>
          ) : null}

          {sortedRows.map((row) => {
            const isEditing = editingId === row.id && editingValues

            return (
              <div key={row.id} style={styles.mobileCard}>
                <div style={styles.mobileCardHeader}>
                  <div style={styles.mobileYearBadge}>{formatPlain(row.year)}</div>
                </div>

                {isEditing ? (
                  <>
                    <div style={styles.mobileGrid}>
                      {renderFormFields(editingValues, 'edit')}
                    </div>

                    <div style={styles.mobileActions}>
                      <button
                        type="button"
                        onClick={handleSaveEdit}
                        disabled={saving}
                        style={{
                          ...styles.saveButton,
                          ...(saving ? styles.disabledButton : {}),
                        }}
                      >
                        Speichern
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        disabled={saving}
                        style={{
                          ...styles.neutralButton,
                          ...(saving ? styles.disabledButton : {}),
                        }}
                      >
                        Abbrechen
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={styles.mobileGrid}>
                      <div style={styles.mobileField}>
                        <div style={styles.mobileFieldLabel}>Zinsen</div>
                        <div style={styles.mobileFieldValue}>
                          {formatCurrency(row.interest)}
                        </div>
                      </div>

                      <div style={styles.mobileField}>
                        <div style={styles.mobileFieldLabel}>Tilgung</div>
                        <div style={styles.mobileFieldValue}>
                          {formatCurrency(row.principal)}
                        </div>
                      </div>

                      <div style={styles.mobileField}>
                        <div style={styles.mobileFieldLabel}>Restschuld</div>
                        <div style={styles.mobileFieldValue}>
                          {formatCurrency(row.balance)}
                        </div>
                      </div>

                      <div style={styles.mobileField}>
                        <div style={styles.mobileFieldLabel}>Quelle</div>
                        <div style={styles.mobileFieldValue}>
                          {formatPlain(row.source)}
                        </div>
                      </div>
                    </div>

                    <div style={styles.mobileActions}>
                      <button
                        type="button"
                        onClick={() => handleEdit(row)}
                        disabled={saving || isAddingRow || editingId !== null}
                        style={{
                          ...styles.neutralButton,
                          ...(saving || isAddingRow || editingId !== null
                            ? styles.disabledButton
                            : {}),
                        }}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(row)}
                        disabled={saving || isAddingRow || editingId !== null}
                        style={{
                          ...styles.dangerButton,
                          ...(saving || isAddingRow || editingId !== null
                            ? styles.disabledButton
                            : {}),
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div style={styles.scroll}>
          <table style={styles.table}>
            <thead style={styles.thead}>
              <tr>
                <th style={{ ...styles.th, width: '12%' }}>Jahr</th>
                <th style={{ ...styles.th, width: '18%' }}>Zinsen</th>
                <th style={{ ...styles.th, width: '18%' }}>Tilgung</th>
                <th style={{ ...styles.th, width: '20%' }}>Restschuld</th>
                <th style={{ ...styles.th, width: '16%' }}>Quelle</th>
                <th style={{ ...styles.th, width: '16%' }}>Aktionen</th>
              </tr>
            </thead>

            <tbody>
              {isAddingRow ? (
                <tr style={styles.addRow}>
                  {renderDesktopFormCells(newValues, 'add')}
                  <td style={styles.td}>
                    <div style={styles.rowActions}>
                      <button
                        type="button"
                        onClick={handleSaveNewRow}
                        disabled={saving}
                        style={{
                          ...styles.saveButton,
                          ...(saving ? styles.disabledButton : {}),
                        }}
                      >
                        Speichern
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelAdd}
                        disabled={saving}
                        style={{
                          ...styles.neutralButton,
                          ...(saving ? styles.disabledButton : {}),
                        }}
                      >
                        Abbrechen
                      </button>
                    </div>
                  </td>
                </tr>
              ) : null}

              {sortedRows.length === 0 && !isAddingRow ? (
                <tr>
                  <td colSpan={6} style={styles.emptyState}>
                    Noch keine Ledger-Einträge vorhanden.
                  </td>
                </tr>
              ) : null}

              {sortedRows.map((row) => {
                const isEditing = editingId === row.id && editingValues

                return (
                  <tr key={row.id}>
                    {isEditing ? (
                      <>
                        {renderDesktopFormCells(editingValues, 'edit')}
                        <td style={styles.td}>
                          <div style={styles.rowActions}>
                            <button
                              type="button"
                              onClick={handleSaveEdit}
                              disabled={saving}
                              style={{
                                ...styles.saveButton,
                                ...(saving ? styles.disabledButton : {}),
                              }}
                            >
                              Speichern
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              disabled={saving}
                              style={{
                                ...styles.neutralButton,
                                ...(saving ? styles.disabledButton : {}),
                              }}
                            >
                              Abbrechen
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={styles.td}>{formatPlain(row.year)}</td>
                        <td style={styles.td}>{formatCurrency(row.interest)}</td>
                        <td style={styles.td}>{formatCurrency(row.principal)}</td>
                        <td style={styles.td}>{formatCurrency(row.balance)}</td>
                        <td style={{ ...styles.td, ...styles.mutedText }}>
                          {formatPlain(row.source)}
                        </td>
                        <td style={styles.td}>
                          <div style={styles.rowActions}>
                            <button
                              type="button"
                              onClick={() => handleEdit(row)}
                              disabled={saving || isAddingRow || editingId !== null}
                              style={{
                                ...styles.neutralButton,
                                ...(saving || isAddingRow || editingId !== null
                                  ? styles.disabledButton
                                  : {}),
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(row)}
                              disabled={saving || isAddingRow || editingId !== null}
                              style={{
                                ...styles.dangerButton,
                                ...(saving || isAddingRow || editingId !== null
                                  ? styles.disabledButton
                                  : {}),
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
