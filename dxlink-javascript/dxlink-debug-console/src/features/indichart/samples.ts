import { get, list } from '@dxscript/js-samples'
import type { SampleMeta } from '@dxscript/js-samples'

export type { SampleMeta }

/** The official dxScript indicator samples (same set as the dxlink-docs editor). */
export const listSamples = (): SampleMeta[] => list()

/** The dxScript source for a sample by name (empty string if unknown). */
export const getSampleContent = (name: string): string => get(name)?.content ?? ''

/** Default sample shown when opening an IndiChart channel. */
export const DEFAULT_INDICATOR_SAMPLE = 'simple_moving_average'

export const DEFAULT_INDICATOR_CODE = getSampleContent(DEFAULT_INDICATOR_SAMPLE)
