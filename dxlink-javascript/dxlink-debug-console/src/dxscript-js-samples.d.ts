// Ambient types for `@dxscript/js-samples` (ships JS only). The official dxScript
// indicator samples used by the dxScript editor in dxlink-docs.
declare module '@dxscript/js-samples' {
  export interface SampleMeta {
    name: string
    title: string
    docs?: string
  }
  export interface Sample extends SampleMeta {
    content: string
  }
  export function get(name: string): Sample | null
  export function list(): SampleMeta[]
  const Samples: { get: typeof get; list: typeof list }
  export default Samples
}
