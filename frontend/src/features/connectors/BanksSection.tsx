import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from '@/api/client'
import { ErrorState, Loading } from '@/components/ui'
import { label, LANG_LABELS } from '../catalog/labels'
import { visionApi, type VisionSite } from '../vision/api'
import { AccessionsPanel } from './AccessionsPanel'
import { fetchBanks, type BanksOut, type BankSourceOut, type CopyOut } from './api'
import { IdentityChips } from './IdentityChips'
import { CONNECTOR_STATUS_LABELS } from './labels'
import { PresenceMap, type GbifPayload } from './PresenceMap'
import { hasData, SourceBlock } from './SourceBlock'

interface CommonName {
  name: string
  lang: string
}

interface WikidataImage {
  file: string
  thumb_url: string
  page_url: string | null
  license: string
  license_url: string | null
  artist: string
}

interface WikidataPayload {
  qid?: string
  common_names?: Record<string, string[]>
  images?: WikidataImage[]
}

interface WfoPayload {
  wfo_id?: string
  name?: string | null
  authorship?: string | null
  synonyms?: { name: string | null; authorship: string | null }[]
  release?: string | null
}

const CONNECTED = new Set(['gbif', 'wfo', 'wikidata', 'genesys'])
const MAX_SYNONYMS_SHOWN = 12

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; banks: BanksOut }

function Tag({ children, tone = 'neutral' }: { children: string; tone?: 'team' | 'neutral' }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${
        tone === 'team' ? 'bg-lime text-ink' : 'bg-accent/15 text-accent'
      }`}
    >
      {children}
    </span>
  )
}

function NameList({ names }: { names: CommonName[] }) {
  const langs = Array.from(new Set(names.map((n) => n.lang)))
  if (langs.length === 0) return <p className="text-sm text-muted">Sin nombres comunes.</p>
  return (
    <dl className="space-y-2 text-sm">
      {langs.map((lang) => (
        <div key={lang}>
          <dt className="text-xs text-muted">{label(LANG_LABELS, lang)}</dt>
          <dd lang={lang} className="flex flex-wrap gap-x-1">
            {names
              .filter((n) => n.lang === lang)
              .map((n, i, all) => (
                <span key={n.name}>
                  {n.name}
                  {i < all.length - 1 && ','}
                </span>
              ))}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function CommonNames({ team, wikidata }: { team: CommonName[]; wikidata: BankSourceOut | undefined }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="min-w-0 space-y-3 rounded-2xl border border-border/70 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="text-sm font-semibold">Nombres comunes</h3>
          <Tag tone="team">Equipo HarvestT</Tag>
        </div>
        <NameList names={team} />
      </div>
      <div className="min-w-0 rounded-2xl border border-border/70 p-4">
        <SourceBlock source={wikidata} title="Nombres comunes" aside={<Tag>Wikidata · sourced</Tag>}>
          {(copy) => {
            const p = copy.payload as WikidataPayload
            const names = Object.entries(p.common_names ?? {}).flatMap(([lang, list]) =>
              list.map((name) => ({ name, lang })),
            )
            return <NameList names={names} />
          }}
        </SourceBlock>
      </div>
    </div>
  )
}

function WfoNames({ wfo }: { wfo: BankSourceOut | undefined }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border/70 p-4">
      <SourceBlock source={wfo} title="Nombre aceptado y sinónimos" aside={<Tag>World Flora Online · sourced</Tag>}>
        {(copy) => {
          const p = copy.payload as WfoPayload
          const synonyms = (p.synonyms ?? []).filter((s) => s.name)
          return (
            <div className="space-y-3">
              <p className="text-sm">
                <i>{p.name}</i> {p.authorship && <span className="text-muted">{p.authorship}</span>}
                <span className="ml-2 rounded-full bg-fg/5 px-2 py-0.5 text-[10px] font-semibold text-muted">Aceptado</span>
              </p>
              {p.wfo_id && (
                <p className="text-xs">
                  <a
                    href={`https://www.worldfloraonline.org/taxon/${p.wfo_id}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-mono text-accent hover:underline"
                  >
                    {p.wfo_id}
                  </a>
                  {p.release && <span className="text-muted"> · {p.release}</span>}
                </p>
              )}
              {synonyms.length === 0 ? (
                <p className="text-xs text-muted">Sin sinónimos registrados.</p>
              ) : (
                <div>
                  <h4 className="eyebrow mb-1.5">Sinónimos ({synonyms.length})</h4>
                  <ul className="grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
                    {synonyms.slice(0, MAX_SYNONYMS_SHOWN).map((s, i) => (
                      <li key={`${s.name}-${i}`} className="min-w-0 break-words">
                        <i>{s.name}</i> {s.authorship && <span className="text-muted">{s.authorship}</span>}
                      </li>
                    ))}
                  </ul>
                  {synonyms.length > MAX_SYNONYMS_SHOWN && (
                    <p className="mt-1 text-xs text-muted">y {synonyms.length - MAX_SYNONYMS_SHOWN} más</p>
                  )}
                </div>
              )}
            </div>
          )
        }}
      </SourceBlock>
    </div>
  )
}

function CommonsImages({ copy }: { copy: CopyOut }) {
  const images = (copy.payload as WikidataPayload).images ?? []
  if (images.length === 0) return null
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Imágenes de Wikimedia Commons</h3>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {images.map((img) => (
          <li key={img.file} className="min-w-0">
            <figure className="space-y-1.5">
              <a href={img.page_url ?? img.thumb_url} target="_blank" rel="noreferrer noopener" className="block">
                <img
                  src={img.thumb_url}
                  alt={img.file.replace(/\.[a-z]+$/i, '').replace(/_/g, ' ')}
                  loading="lazy"
                  className="aspect-[4/3] w-full rounded-xl border border-border/70 bg-fg/5 object-cover"
                />
              </a>
              <figcaption className="break-words text-[11px] leading-snug text-muted">
                <span>{img.artist}</span>
                {' · '}
                {img.license_url ? (
                  <a href={img.license_url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
                    {img.license}
                  </a>
                ) : (
                  <span>{img.license}</span>
                )}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Upcoming({ sources }: { sources: BankSourceOut[] }) {
  if (sources.length === 0) return null
  return (
    <p className="text-xs text-muted">
      Próximas fuentes:{' '}
      {sources.map((s, i) => (
        <span key={s.key}>
          {s.label} ({CONNECTOR_STATUS_LABELS[s.status] ?? s.status})
          {i < sources.length - 1 && ' · '}
        </span>
      ))}
    </p>
  )
}

/** Sección «Bancos de plantas y distribución»: lo importado de fuentes abiertas junto a lo capturado por el equipo. */
export function BanksSection({ speciesId, commonNames }: { speciesId: string; commonNames: CommonName[] }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [sites, setSites] = useState<VisionSite[]>([])

  const load = useCallback(() => {
    setState({ status: 'loading' })
    fetchBanks(speciesId)
      .then((banks) => setState({ status: 'ready', banks }))
      .catch((err) => setState({ status: 'error', message: errorMessage(err, 'No se pudieron cargar los bancos de datos') }))
  }, [speciesId])

  useEffect(load, [load])

  useEffect(() => {
    let alive = true
    visionApi
      .summary()
      .then((v) => alive && setSites(v.sites))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  if (state.status === 'loading') return <Loading label="Cargando bancos de datos…" />
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={load} />

  const { banks } = state
  const by = Object.fromEntries(banks.sources.map((s) => [s.key, s]))
  const wikidata = by.wikidata
  const genesys = by.genesys

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Identidad cruzada</h3>
        <IdentityChips identity={banks.identity} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <SourceBlock source={by.gbif} title="Distribución · GBIF">
            {(copy) => <PresenceMap payload={copy.payload as GbifPayload} sites={sites} />}
          </SourceBlock>
        </div>
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <CommonNames team={commonNames} wikidata={wikidata} />
          <WfoNames wfo={by.wfo} />
        </div>
      </div>

      {wikidata && hasData(wikidata.copy) && <CommonsImages copy={wikidata.copy} />}

      {genesys && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="text-sm font-semibold">Germoplasma · Genesys</h3>
            <span className="text-xs text-muted">{genesys.contribution}</span>
          </div>
          <AccessionsPanel speciesId={speciesId} source={genesys} />
        </div>
      )}

      <Upcoming sources={banks.sources.filter((s) => !CONNECTED.has(s.key))} />
    </div>
  )
}
