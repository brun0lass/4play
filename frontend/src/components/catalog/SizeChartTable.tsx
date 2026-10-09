import type { PublicSizeChartType } from '@/contracts/aeris/uniforms.ts'

/** "52.5" → "52,5". */
const cm = (value: string | null): string => (value === null ? '—' : value.replace('.', ','))

/**
 * Uma tabela de medidas (F259 do Aeris): cada parte (infantil, adulto…) com a
 * largura e a altura de cada tamanho, em centímetros.
 */
export const SizeChartTable = ({ chart }: { chart: PublicSizeChartType }) => (
  <div>
    <p className="text-sm font-extrabold tracking-wide uppercase">{chart.name}</p>
    <div className="mt-2 grid gap-3 sm:grid-cols-2">
      {chart.sections.map((section, index) => (
        <table key={`${section.title ?? ''}-${String(index)}`} className="w-full overflow-hidden rounded-xl text-center text-sm">
          <thead className="bg-ink text-[11px] tracking-wider text-white/80 uppercase">
            {section.title && (
              <tr>
                <th colSpan={3} className="px-2 pt-2 text-lime">
                  {section.title}
                </th>
              </tr>
            )}
            <tr>
              <th className="px-2 py-2 font-bold">Tamanho</th>
              <th className="px-2 py-2 font-bold">Largura</th>
              <th className="px-2 py-2 font-bold">Altura</th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row) => (
              <tr key={row.size} className="border-t border-line bg-white">
                <td className="px-2 py-1.5 font-extrabold">{row.size}</td>
                <td className="px-2 py-1.5">{cm(row.width)}</td>
                <td className="px-2 py-1.5">{cm(row.height)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
    {chart.note && <p className="mt-2 text-xs text-muted">{chart.note}</p>}
  </div>
)
