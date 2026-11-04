import { useEffect, type ReactNode } from 'react'
import { useParams } from 'react-router'

import { Logo } from '@/components/Logo'
import { ErrorBox, Spinner } from '@/components/ui'
import type { QuoteSummaryType } from '@/contracts/aeris/uniforms.ts'
import { int, money } from '@/lib/format'
import { errorMessage } from '@/lib/http'
import { useQuote } from '@/lib/queries'
import { PrintBar } from '@/pages/FichaImpressao'

/**
 * O orçamento para mandar ao cliente: o mesmo papel da planilha da loja (o
 * cliente na coluna da esquerda, os itens, o frete, o total e o Pix) na
 * identidade nova da 4Play. "Imprimir / salvar PDF" já sugere o nome do arquivo
 * do jeito que a loja salva: "LEANDRO COTRIM - ORÇAMENTO 4PLAY".
 */

const COMPANY = {
  address: 'Rua Dr. Campos Sales, 297 - Centro - São Vicente',
  document: '35.776.002/0001-51',
  phone: '19 - 99603-7763',
  pix: '4PLAYUNIFORMES@GMAIL.COM',
}

/** `AAAA-MM-DD` → `dd/mm/aaaa`: no papel, a data vai sempre completa. */
const fullDate = (day: string) => day.split('-').reverse().join('/')

/** Uma informação da coluna do cliente. A vazia não ocupa lugar no papel. */
const Fact = ({ label, children }: { label: string; children: ReactNode }) =>
  children ? (
    <div>
      <dt className="text-[9px] font-extrabold tracking-wider text-ink/60 uppercase">{label}</dt>
      <dd className="mt-0.5 text-[11px] leading-snug font-semibold break-words">{children}</dd>
    </div>
  ) : null

const TotalLine = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4 border-b border-line px-3 py-1.5 text-[11px] font-bold">
    <span className="tracking-wide uppercase">{label}</span>
    <span>{money(value)}</span>
  </div>
)

export const QuoteSheet = ({ quote }: { quote: QuoteSummaryType }) => (
  <article className="mx-auto flex w-[190mm] flex-col gap-3 text-ink">
    <header className="brush-bg flex items-center justify-between gap-6 rounded-2xl px-6 py-5 text-white">
      <div className="min-w-0">
        <Logo className="h-12" />
        <p className="mt-3 text-[10px] leading-relaxed text-white/80">
          {COMPANY.address}
          <br />
          CNPJ {COMPANY.document} · Telefone {COMPANY.phone}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <h1 className="display text-4xl text-lime">Orçamento</h1>
        <p className="mt-2 text-xs font-bold">
          Nº {int(quote.number)} · {fullDate(quote.date)}
        </p>
        <p className="mt-1 text-[10px] text-white/80">
          Válido por {int(quote.validDays)} {quote.validDays === 1 ? 'dia' : 'dias'}, até {fullDate(quote.validUntil)}
        </p>
      </div>
    </header>

    <div className="grid grid-cols-[50mm_1fr] items-start gap-3">
      <dl className="space-y-3 rounded-2xl bg-paper p-4">
        <div>
          <dt className="text-[9px] font-extrabold tracking-wider text-ink/60 uppercase">Cliente</dt>
          <dd className="display mt-1 text-base break-words">{quote.customerName}</dd>
        </div>
        <Fact label="Endereço">{quote.customerAddress}</Fact>
        <Fact label="Cidade/Estado/CEP">{quote.customerCity}</Fact>
        <Fact label="Contato/Telefone">{quote.customerPhone}</Fact>
        <Fact label="Email">{quote.customerEmail}</Fact>
        <Fact label="Vendedor">{quote.salespersonName}</Fact>
        <Fact label="Projeto">{quote.project}</Fact>
        <Fact label="Termos de pagamento">{quote.paymentTerms}</Fact>
        <Fact label="Data de pagamento">{quote.paymentDate && fullDate(quote.paymentDate)}</Fact>
      </dl>

      <div className="min-w-0">
        <table className="w-full overflow-hidden rounded-t-2xl text-[11px]">
          <thead>
            {/* A borda da mesma cor tampa o fio que o PDF deixa entre as células. */}
            <tr className="bg-ink text-left text-[9px] font-extrabold tracking-wider text-lime uppercase [&>th]:border [&>th]:border-ink">
              <th className="px-2 py-2 text-center">Qtd.</th>
              <th className="px-2 py-2">Descrição</th>
              <th className="px-2 py-2 text-center">Tamanho</th>
              <th className="px-2 py-2 text-right whitespace-nowrap">Preço unit.</th>
              <th className="px-3 py-2 text-right">Montante</th>
            </tr>
          </thead>
          <tbody>
            {quote.lines.map((line, index) => (
              <tr key={index} className="border-b border-line align-top break-inside-avoid">
                <td className="px-2 py-2 text-center font-extrabold">{int(line.quantity)}</td>
                <td className="px-2 py-2 break-words uppercase">{line.description}</td>
                <td className="px-2 py-2 text-center uppercase">{line.size ?? '—'}</td>
                <td className="px-2 py-2 text-right whitespace-nowrap">{money(line.unitPrice)}</td>
                <td className="px-3 py-2 text-right font-extrabold whitespace-nowrap">{money(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 ml-auto w-[70mm] break-inside-avoid">
          <TotalLine label="Subtotal" value={quote.subtotal} />
          {Number(quote.otherAmount) > 0 && <TotalLine label="Outros" value={quote.otherAmount} />}
          {Number(quote.freightAmount) > 0 && <TotalLine label="Frete" value={quote.freightAmount} />}
          <div className="mt-2 flex items-center justify-between gap-4 rounded-xl border-2 border-ink bg-lime px-3 py-2.5">
            <span className="display text-sm">Total</span>
            <span className="display text-xl">{money(quote.total)}</span>
          </div>
        </div>
      </div>
    </div>

    <footer className="grid grid-cols-[1fr_auto] items-stretch gap-3 break-inside-avoid">
      <section className="rounded-2xl border border-line p-3">
        <h2 className="text-[9px] font-extrabold tracking-wider uppercase">
          Esta proposta inclui as seguintes condições:
        </h2>
        <p className="mt-1 min-h-6 text-[11px] whitespace-pre-line">{quote.conditions}</p>
      </section>
      <section className="rounded-2xl bg-ink p-3 text-white">
        <h2 className="text-[9px] font-extrabold tracking-wider text-lime uppercase">Dados bancários</h2>
        <p className="mt-1 text-[11px] font-bold whitespace-nowrap">PIX: {COMPANY.pix}</p>
      </section>
    </footer>
  </article>
)

export const OrcamentoImpressaoPage = () => {
  const { id = '' } = useParams()
  const quote = useQuote(id)
  const customer = quote.data?.customerName

  // O nome que o navegador sugere ao salvar o PDF.
  useEffect(() => {
    if (!customer) return
    const before = document.title
    document.title = `${customer.toUpperCase()} - ORÇAMENTO 4PLAY`
    return () => {
      document.title = before
    }
  }, [customer])

  return (
    <div className="min-h-full bg-white p-6 text-ink print:p-0">
      {/* O orçamento é em pé; a Planilha e a ficha continuam deitadas. */}
      <style>{'@media print { @page { size: A4 portrait; margin: 10mm } }'}</style>
      <PrintBar back="/orcamentos" backLabel="Voltar para os orçamentos" />
      {quote.isPending && <Spinner />}
      {quote.isError && <ErrorBox message={errorMessage(quote.error)} />}
      {/* A folha tem tamanho de papel: no celular ela rola de lado em vez de se espremer. */}
      {quote.data && (
        <div className="scroll-thin overflow-x-auto print:overflow-visible">
          <QuoteSheet quote={quote.data} />
        </div>
      )}
    </div>
  )
}
