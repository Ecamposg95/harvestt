import { FormEvent, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { errorMessage, type ApiErrorBody } from '@/api/client'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { Dialog } from '@/features/catalog/Dialog'
import {
  DOMAINS,
  ontologyApi,
  type Domain,
  type EquivalenceIn,
  type MatchType,
  type Scheme,
  type SuggestionOut,
  type TermDetail,
  type TermSummary,
} from './api'
import { DOMAIN_LABELS, labelOf, MATCH_LABELS, SCHEME_LABELS } from './labels'
import { buildTree, type TreeNode } from './tree'

export const CREDIT_NOTICE = 'Si se publica, tu nombre aparecerá como autor del término, también en la exportación pública'
export const DUPLICATE_MESSAGE = 'Ya existe un término con esa etiqueta en este dominio'

const SUGGEST_DEBOUNCE_MS = 300
const MAX_ALIASES = 10
const MAX_EQUIVALENCES = 10

type FieldName = 'domain' | 'parent_id' | 'label' | 'definition' | 'aliases' | 'unit' | 'equivalences'
const FIELD_NAMES: readonly string[] = ['domain', 'parent_id', 'label', 'definition', 'aliases', 'unit', 'equivalences']
type Errors = Partial<Record<FieldName, string>> & { form?: string }

const isField = (f: unknown): f is FieldName => typeof f === 'string' && FIELD_NAMES.includes(f)

/**
 * Traduce un error de la API a errores por campo.
 * 409 `term_exists` → mensaje de duplicado en la etiqueta; 422 → `details.field` (propio) o `loc` (validación).
 */
export function proposalErrors(err: unknown, fallback: string): Errors {
  if (axios.isAxiosError(err) && err.response) {
    const body = err.response.data as ApiErrorBody | undefined
    const code = body?.error?.code
    const details = (body?.error?.details ?? {}) as { field?: unknown; errors?: { loc?: unknown[]; msg?: string }[] }
    if (err.response.status === 409 && code === 'term_exists') return { label: DUPLICATE_MESSAGE }
    if (err.response.status === 422) {
      if (isField(details.field)) return { [details.field]: body?.error?.message ?? fallback }
      const out: Errors = {}
      for (const e of details.errors ?? []) {
        const field = e.loc?.[1]
        if (isField(field) && !out[field]) out[field] = e.msg ?? 'Valor inválido'
      }
      if (Object.keys(out).length) return out
    }
  }
  return { form: errorMessage(err, fallback) }
}

function splitAliases(text: string): string[] {
  const seen = new Set<string>()
  return text
    .split(',')
    .map((a) => a.trim())
    .filter((a) => a && !seen.has(a) && seen.add(a))
}

/** Aplana el árbol de un dominio para un `<select>`, con sangría por profundidad. */
function flatten(nodes: TreeNode[], depth = 0, out: { term: TreeNode; depth: number }[] = []) {
  for (const n of nodes) {
    out.push({ term: n, depth })
    flatten(n.children, depth + 1, out)
  }
  return out
}

const eqKey = (e: { scheme: string; external_id: string }) => `${e.scheme}:${e.external_id}`
const eqName = (e: { scheme: string; external_id: string }) => `${labelOf(SCHEME_LABELS, e.scheme)} ${e.external_id}`

interface Props {
  initialDomain: Domain
  /** Padre sugerido (p. ej., el término publicado que está abierto). */
  parent?: TermSummary | null
  /** Si se da, el diálogo edita esa propuesta en vez de crear una nueva. */
  term?: TermDetail
  onDone: (term: TermDetail) => void
  onClose: () => void
}

export function ProposeTermDialog({ initialDomain, parent, term, onDone, onClose }: Props) {
  const editing = !!term
  const [domain, setDomain] = useState<Domain>(
    term && (DOMAINS as readonly string[]).includes(term.domain) ? (term.domain as Domain) : initialDomain,
  )
  const [parentId, setParentId] = useState<string>(term ? term.parent_id ?? '' : parent?.id ?? '')
  const [label, setLabel] = useState(term?.label ?? '')
  const [definition, setDefinition] = useState(term?.definition ?? '')
  const [aliases, setAliases] = useState(term?.aliases.join(', ') ?? '')
  const [unit, setUnit] = useState(term?.unit ?? '')
  const [equivalences, setEquivalences] = useState<EquivalenceIn[]>(
    () =>
      term?.equivalences.map((e) => ({
        scheme: e.scheme as Scheme,
        external_id: e.external_id,
        url: e.url,
        external_label: e.external_label,
        match: e.match as MatchType,
      })) ?? [],
  )
  const [parents, setParents] = useState<TermSummary[] | null>(null)
  const [suggestions, setSuggestions] = useState<{ q: string; items: SuggestionOut[] } | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)

  // Padres posibles: solo términos publicados del dominio elegido.
  useEffect(() => {
    let alive = true
    setParents(null)
    ontologyApi
      .list({ domain, status: 'published' })
      .then((items) => alive && setParents(items))
      .catch(() => alive && setParents([]))
    return () => {
      alive = false
    }
  }, [domain])

  const parentOptions = useMemo(() => (parents ? flatten(buildTree(parents)[domain]) : []), [parents, domain])

  // Sugerencias de Cortex: búsqueda en el catálogo de conceptos externos verificados, con debounce.
  useEffect(() => {
    const q = label.trim()
    if (q.length < 2) {
      setSuggestions(null)
      return
    }
    let alive = true
    const timer = setTimeout(() => {
      ontologyApi
        .suggest(q)
        .then((items) => alive && setSuggestions({ q, items }))
        .catch(() => alive && setSuggestions({ q, items: [] }))
    }, SUGGEST_DEBOUNCE_MS)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [label])

  const added = new Set(equivalences.map(eqKey))
  const pending = suggestions?.items.filter((s) => !added.has(eqKey(s))) ?? []
  const full = equivalences.length >= MAX_EQUIVALENCES

  const addSuggestion = (s: SuggestionOut) => {
    if (full) return
    setEquivalences((list) => [
      ...list,
      { scheme: s.scheme as Scheme, external_id: s.external_id, url: s.url, external_label: s.label, match: 'close' },
    ])
    setErrors((e) => ({ ...e, equivalences: undefined }))
  }

  const changeDomain = (d: Domain) => {
    setDomain(d)
    setParentId('')
    if (d !== 'trait') setUnit('')
  }

  const validate = (): Errors => {
    const out: Errors = {}
    if (label.trim().length < 2) out.label = 'Escribe al menos 2 caracteres.'
    if (definition.trim().length < 10) out.definition = 'La definición necesita al menos 10 caracteres.'
    const list = splitAliases(aliases)
    if (list.length > MAX_ALIASES) out.aliases = `Máximo ${MAX_ALIASES} alias.`
    else if (list.some((a) => a.length > 60)) out.aliases = 'Cada alias admite hasta 60 caracteres.'
    if (unit.trim().length > 30) out.unit = 'La unidad admite hasta 30 caracteres.'
    return out
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const local = validate()
    setErrors(local)
    if (Object.keys(local).length) return
    const common = {
      parent_id: parentId || null,
      label: label.trim(),
      definition: definition.trim(),
      aliases: splitAliases(aliases),
      ...(domain === 'trait' ? { unit: unit.trim() || null } : {}),
      equivalences,
    }
    setBusy(true)
    try {
      const saved = term ? await ontologyApi.edit(term.id, common) : await ontologyApi.propose({ domain, ...common })
      onDone(saved)
    } catch (err) {
      setErrors(proposalErrors(err, editing ? 'No se pudieron guardar los cambios' : 'No se pudo enviar la propuesta'))
      setBusy(false)
    }
  }

  const invalid = (f: FieldName) => (errors[f] ? true : undefined)

  return (
    <Dialog title={editing ? 'Editar propuesta' : 'Proponer término'} onClose={onClose} size="lg">
      <form onSubmit={submit} noValidate className="space-y-4">
        <p className="text-sm text-muted">
          {editing
            ? 'Al guardar, la propuesta vuelve a la bandeja de revisión.'
            : 'Un superadministrador revisará tu propuesta. Al publicarse recibe un ID permanente HVT.'}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dominio" error={errors.domain}>
            {(id, describedBy) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid('domain')}
                value={domain}
                disabled={editing}
                onChange={(e) => changeDomain(e.target.value as Domain)}
              >
                {DOMAINS.map((d) => (
                  <option key={d} value={d}>
                    {DOMAIN_LABELS[d]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Término padre" error={errors.parent_id} hint="Solo términos publicados del mismo dominio.">
            {(id, describedBy) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid('parent_id')}
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">{parents === null ? 'Cargando…' : 'Sin padre (raíz del dominio)'}</option>
                {parentOptions.map(({ term: t, depth }) => (
                  <option key={t.id} value={t.id}>
                    {'  '.repeat(depth)}
                    {t.label}
                    {t.hvt_id ? ` · ${t.hvt_id}` : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <Field label="Etiqueta" error={errors.label} hint="Nombre en español, como lo usarías en una ficha.">
          {(id, describedBy) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid('label')}
              maxLength={120}
              autoComplete="off"
              data-autofocus
              value={label}
              onChange={(e) => {
                setLabel(e.target.value)
                if (errors.label) setErrors((x) => ({ ...x, label: undefined }))
              }}
            />
          )}
        </Field>

        <Field label="Definición" error={errors.definition} hint="Qué es y cómo se distingue de términos parecidos.">
          {(id, describedBy) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid('definition')}
              maxLength={2000}
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
            />
          )}
        </Field>

        <div className={domain === 'trait' ? 'grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]' : undefined}>
          <Field label="Alias" error={errors.aliases} hint="Separados por coma. Ayudan a enlazar datos existentes.">
            {(id, describedBy) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid('aliases')}
                autoComplete="off"
                value={aliases}
                onChange={(e) => setAliases(e.target.value)}
              />
            )}
          </Field>
          {domain === 'trait' && (
            <Field label="Unidad" error={errors.unit} hint="Código UCUM: cm, g, %…">
              {(id, describedBy) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid('unit')}
                  maxLength={30}
                  autoComplete="off"
                  className="font-mono"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                />
              )}
            </Field>
          )}
        </div>

        <section aria-labelledby="propose-eq-title" className="space-y-3 rounded-2xl border border-border/70 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="propose-eq-title" className="eyebrow">
              Equivalencias
            </h3>
            <span className="text-[11px] text-muted">
              {equivalences.length}/{MAX_EQUIVALENCES}
            </span>
          </div>
          {equivalences.length === 0 ? (
            <p className="text-sm text-muted">Agrega equivalencias desde las sugerencias de Cortex.</p>
          ) : (
            <ul aria-label="Equivalencias de la propuesta" className="space-y-2">
              {equivalences.map((e, i) => (
                <li key={eqKey(e)} className="flex flex-wrap items-center gap-2 rounded-xl bg-fg/5 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="break-all text-sm font-semibold text-fg">
                      {labelOf(SCHEME_LABELS, e.scheme)} <span className="font-mono text-xs">{e.external_id}</span>
                    </p>
                    {e.external_label && <p className="break-words text-xs text-muted">{e.external_label}</p>}
                  </div>
                  <Select
                    aria-label={`Correspondencia con ${eqName(e)}`}
                    className="!w-auto !py-1.5 text-xs"
                    value={e.match}
                    onChange={(ev) =>
                      setEquivalences((list) =>
                        list.map((x, j) => (j === i ? { ...x, match: ev.target.value as MatchType } : x)),
                      )
                    }
                  >
                    {(['exact', 'close', 'broad'] as const).map((m) => (
                      <option key={m} value={m}>
                        {MATCH_LABELS[m]}
                      </option>
                    ))}
                  </Select>
                  <button
                    type="button"
                    aria-label={`Quitar ${eqName(e)}`}
                    onClick={() => setEquivalences((list) => list.filter((_, j) => j !== i))}
                    className="rounded-full px-2 text-lg leading-none text-muted hover:bg-fg/5 hover:text-fg"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {errors.equivalences && <p className="text-xs text-danger">{errors.equivalences}</p>}

          <div className="border-t border-border/60 pt-3">
            <p className="text-xs font-semibold text-fg">Sugerencias de Cortex</p>
            <p className="text-[11px] text-muted">
              Conceptos verificados de ontologías abiertas que coinciden con la etiqueta. Se agregan como «Cercana»;
              ajusta la correspondencia si aplica.
            </p>
            {suggestions === null ? (
              <p className="mt-2 text-xs text-muted">Escribe la etiqueta para ver sugerencias.</p>
            ) : pending.length === 0 ? (
              <p className="mt-2 text-xs text-muted">
                {suggestions.items.length === 0 ? `Sin sugerencias para «${suggestions.q}».` : 'Ya agregaste todas las sugerencias.'}
              </p>
            ) : (
              <ul aria-label="Sugerencias de Cortex" className="mt-2 space-y-1.5">
                {pending.map((s) => (
                  <li key={eqKey(s)} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-fg" title={s.label}>
                        {s.label}
                      </p>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="break-all font-mono text-[11px] text-accent underline-offset-2 hover:underline"
                      >
                        {eqName(s)}
                      </a>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0 !px-3 !py-1.5 text-xs"
                      aria-label={`Agregar ${eqName(s)}`}
                      disabled={full}
                      onClick={() => addSuggestion(s)}
                    >
                      Agregar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <p role="note" className="rounded-2xl bg-accent/10 px-4 py-3 text-sm text-fg">
          {CREDIT_NOTICE}
        </p>

        {errors.form && (
          <p role="alert" className="text-sm text-danger">
            {errors.form}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={busy}>
            {editing ? 'Guardar cambios' : 'Enviar propuesta'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
