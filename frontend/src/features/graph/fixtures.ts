import type { GraphData } from './api'

export const FIXTURE: GraphData = {
  truncated: false,
  nodes: [
    { id: 'species:sp1', type: 'species', label: 'Lechuga', origin: null, meta: { scientific_name: 'Lactuca sativa L.' } },
    { id: 'trait:photoperiod', type: 'trait', label: 'Fotoperiodo', origin: 'missing', meta: { variable: 'photoperiod' } },
    {
      id: 'source:gbif',
      type: 'source',
      label: 'GBIF Backbone Taxonomy',
      origin: null,
      meta: { url: 'https://www.gbif.org/', license: 'CC BY 4.0' },
    },
    { id: 'project:p1', type: 'project', label: 'Invernadero norte', origin: null, meta: { system: 'hydroponic' } },
    { id: 'crop_cycle:c1', type: 'crop_cycle', label: 'Ciclo · Lechuga', origin: null, meta: { project_id: 'p1', status: 'active' } },
    { id: 'prototype:pr1', type: 'prototype', label: 'Germinador G1', origin: null, meta: { status: 'testing' } },
  ],
  edges: [
    {
      src: 'species:sp1',
      dst: 'trait:photoperiod',
      relation: 'has_trait',
      provenance: [
        {
          kind: 'assertion',
          assertion_id: 'a1',
          origin: 'missing',
          review_status: 'unreviewed',
          growth_stage: 'unknown',
          cultivation_system: 'unknown',
        },
      ],
    },
    {
      src: 'species:sp1',
      dst: 'source:gbif',
      relation: 'cites',
      provenance: [{ kind: 'external_id', system: 'gbif', external_id: '7403263', url: 'https://www.gbif.org/species/7403263' }],
    },
    { src: 'crop_cycle:c1', dst: 'species:sp1', relation: 'grows', provenance: [{ kind: 'fk', field: 'crop_cycles.species_id' }] },
    { src: 'project:p1', dst: 'crop_cycle:c1', relation: 'has_cycle', provenance: [{ kind: 'fk', field: 'crop_cycles.project_id' }] },
  ],
}
