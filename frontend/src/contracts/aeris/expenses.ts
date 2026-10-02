import { z } from 'zod'

/**
 * A folha dos funcionários e o caderno de gastos (F146).
 *
 * Dinheiro como string (ADR-0016). Os enums são repetidos aqui, e não
 * importados de `@aeris/expense`, porque este pacote depende só de
 * `@aeris/domain`.
 */

/** Até doze dígitos inteiros e dois decimais — `numeric(18, 2)`. */
const AMOUNT_PATTERN = /^\d{1,12}(\.\d{1,2})?$/

const amountInput = z
  .string()
  .trim()
  .regex(AMOUNT_PATTERN, 'O valor vem com ponto decimal, por exemplo 10.00')

const money = z.string()

/** `2026-09`. */
export const ExpensePeriod = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'O mês vem como AAAA-MM.')

export const ExpenseKindSchema = z.enum(['expense', 'salary'])
export const ExpensePaymentSourceSchema = z.enum(['cash', 'other'])
export const ExpenseStatusSchema = z.enum(['active', 'voided'])
export const ExpenseRecordStatusSchema = z.enum(['active', 'archived'])
export const PayrollStatusSchema = z.enum([
  'pending',
  'partial',
  'paid',
  /**
   * Saiu mais dinheiro do que a loja deve naquele mês — F186.
   *
   * Existia desde sempre e se chamava "Pago": o crachá verde ao lado de um
   * "falta −R$ 500,00". A partir da F186 o servidor recusa criar o caso novo
   * (desconto sobre o que já foi pago), mas o que já está gravado continua, e
   * precisa de nome.
   */
  'overpaid',
])

/** O que a loja deve a alguém todo mês, por tipo (F157). */
export const EmployeeEarningKindSchema = z.enum([
  'salary',
  'bonus',
  'transport',
  'meal',
])
export type EmployeeEarningKind = z.infer<typeof EmployeeEarningKindSchema>

/** O que é só daquele mês: a meta batida, o dia que faltou (F157). */
export const PayrollAdjustmentKindSchema = z.enum(['bonus', 'discount'])
export type PayrollAdjustmentKind = z.infer<typeof PayrollAdjustmentKindSchema>

/**
 * Um ganho recorrente do cadastro.
 *
 * O valor é sempre positivo, inclusive o zero — que quer dizer "tinha e
 * perdeu", e é o que preserva a folha dos meses em que ainda tinha.
 */
const EarningValue = z.object({
  kind: EmployeeEarningKindSchema,
  amount: amountInput,
})

// ---------------------------------------------------------------------------
// Funcionários
// ---------------------------------------------------------------------------

export const EmployeeSummary = z.object({
  id: z.string(),
  branchId: z.string(),
  name: z.string(),
  note: z.string().nullable(),
  status: ExpenseRecordStatusSchema,
  /**
   * O valor vigente de cada tipo neste mês (F157). Tipo ausente é tipo que a
   * pessoa não tem; lista vazia é quem ainda não começou.
   */
  earnings: z.array(
    z.object({
      kind: EmployeeEarningKindSchema,
      amount: money,
      validFrom: ExpensePeriod,
    })
  ),
  history: z.array(
    z.object({
      kind: EmployeeEarningKindSchema,
      amount: money,
      validFrom: ExpensePeriod,
      actorName: z.string().nullable(),
      createdAt: z.string(),
    })
  ),
  version: z.number().int(),
})
export type EmployeeSummary = z.infer<typeof EmployeeSummary>

export const EmployeesQuery = z.object({
  branchId: z.uuid().optional(),
  /** O mês em que os ganhos valem. Sem ele, o último de cada tipo. */
  period: ExpensePeriod.optional(),
})
export type EmployeesQuery = z.input<typeof EmployeesQuery>

export const EmployeesResponse = z.object({
  employees: z.array(EmployeeSummary),
})
export type EmployeesResponse = z.infer<typeof EmployeesResponse>

const EmployeeName = z
  .string()
  .trim()
  .min(1, 'Diga o nome.')
  .max(120, 'O nome vai até 120 letras.')

const EmployeeNote = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .default(null)
  .transform((value) => (value === null || value === '' ? null : value))

export const CreateEmployeeRequest = z.object({
  branchId: z.uuid().optional(),
  name: EmployeeName,
  note: EmployeeNote,
  /** Salário e o que mais a pessoa recebe todo mês (F157). */
  earnings: z.array(EarningValue).min(1, 'Diga pelo menos o salário.'),
  /** O mês a partir do qual eles valem. */
  validFrom: ExpensePeriod,
})
export type CreateEmployeeRequest = z.input<typeof CreateEmployeeRequest>
export type CreateEmployeeBody = z.output<typeof CreateEmployeeRequest>

export const UpdateEmployeeRequest = z.object({
  version: z.number().int().nonnegative(),
  name: EmployeeName,
  note: EmployeeNote,
  status: ExpenseRecordStatusSchema,
  /**
   * Nulo: os ganhos não mudam — é o que acontece quando alguém abre o cadastro
   * só para corrigir o nome. Um `validFrom` para o conjunto, porque é assim
   * que a loja pensa: "a partir de março ele passa a ganhar isto".
   */
  earnings: z
    .object({
      validFrom: ExpensePeriod,
      values: z.array(EarningValue),
    })
    .nullable()
    .default(null),
})
export type UpdateEmployeeRequest = z.input<typeof UpdateEmployeeRequest>
export type UpdateEmployeeBody = z.output<typeof UpdateEmployeeRequest>

export const EmployeeResponse = z.object({ employee: EmployeeSummary })
export type EmployeeResponse = z.infer<typeof EmployeeResponse>

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

export const ExpenseCategorySummary = z.object({
  id: z.string(),
  name: z.string(),
  status: ExpenseRecordStatusSchema,
  version: z.number().int(),
})
export type ExpenseCategorySummary = z.infer<typeof ExpenseCategorySummary>

export const ExpenseCategoriesResponse = z.object({
  categories: z.array(ExpenseCategorySummary),
})
export type ExpenseCategoriesResponse = z.infer<
  typeof ExpenseCategoriesResponse
>

const CategoryName = z
  .string()
  .trim()
  .min(1, 'Diga o nome da categoria.')
  .max(60, 'O nome vai até 60 letras.')

export const CreateExpenseCategoryRequest = z.object({ name: CategoryName })
export type CreateExpenseCategoryRequest = z.infer<
  typeof CreateExpenseCategoryRequest
>

export const UpdateExpenseCategoryRequest = z.object({
  version: z.number().int().nonnegative(),
  name: CategoryName,
  status: ExpenseRecordStatusSchema,
})
export type UpdateExpenseCategoryRequest = z.infer<
  typeof UpdateExpenseCategoryRequest
>

export const ExpenseCategoryResponse = z.object({
  category: ExpenseCategorySummary,
})
export type ExpenseCategoryResponse = z.infer<typeof ExpenseCategoryResponse>

// ---------------------------------------------------------------------------
// O caderno
// ---------------------------------------------------------------------------

export const ExpenseEntry = z.object({
  id: z.string(),
  branchId: z.string(),
  kind: ExpenseKindSchema,
  categoryId: z.string().nullable(),
  categoryName: z.string().nullable(),
  employeeId: z.string().nullable(),
  employeeName: z.string().nullable(),
  deductsSalary: z.boolean(),
  period: ExpensePeriod.nullable(),
  description: z.string(),
  amount: money,
  /** `2026-09-14`. */
  spentOn: z.string(),
  paymentSource: ExpensePaymentSourceSchema,
  status: ExpenseStatusSchema,
  voidReason: z.string().nullable(),
  voidedAt: z.string().nullable(),
  voidedByName: z.string().nullable(),
  actorName: z.string().nullable(),
  createdAt: z.string(),
  version: z.number().int(),
})
export type ExpenseEntry = z.infer<typeof ExpenseEntry>

/**
 * Por onde o caderno de gastos se ordena — F187.
 *
 * Todas saem na mesma consulta da página: `spent_on`, `description`, `amount`,
 * `payment_source` são colunas da própria tabela e `category` é a junção que a
 * lista já faz. Nenhuma custa leitura nova.
 */
export const ExpenseSortSchema = z.enum([
  'spentOn',
  'description',
  'category',
  'employee',
  'paymentSource',
  'amount',
])
export type ExpenseSort = z.infer<typeof ExpenseSortSchema>

export const ExpensesQuery = z.object({
  branchId: z.uuid().optional(),
  period: ExpensePeriod,
  /** Procura na descrição. O molde é o do Estoque: `ilike` com curinga. */
  search: z.string().trim().min(1).max(200).optional(),
  categoryId: z.uuid().optional(),
  employeeId: z.uuid().optional(),
  paymentSource: ExpensePaymentSourceSchema.optional(),
  /**
   * Ativo ou desfeito.
   *
   * O padrão é **não filtrar**, porque o desfeito riscado na lista é o que
   * conta a história do mês — foi decisão da F146 e continua. O filtro existe
   * para o dia em que metade do caderno é lixo riscado e alguém precisa ler só
   * o que valeu.
   */
  status: ExpenseStatusSchema.optional(),
  /** "Só a folha" ou "só os gastos": a aba mostra os dois juntos. */
  kind: ExpenseKindSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  // Com teto, como em toda lista: uma página sem limite é uma requisição que
  // lê a tabela inteira.
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: ExpenseSortSchema.default('spentOn'),
  direction: z.enum(['asc', 'desc']).default('desc'),
})
export type ExpensesParams = z.output<typeof ExpensesQuery>

/**
 * O que o cliente passa. Número é número.
 *
 * Escrito à mão pelo mesmo motivo de `StockBalanceListRequest`: `z.coerce`
 * apaga o tipo de entrada (vira `unknown`), e um `page` sem tipo é um `page`
 * que ninguém confere.
 */
export type ExpensesRequest = {
  branchId?: string | undefined
  period: string
  search?: string | undefined
  categoryId?: string | undefined
  employeeId?: string | undefined
  paymentSource?: 'cash' | 'other' | undefined
  status?: 'active' | 'voided' | undefined
  kind?: 'expense' | 'salary' | undefined
  page?: number | undefined
  pageSize?: number | undefined
  sort?: ExpenseSort | undefined
  direction?: 'asc' | 'desc' | undefined
}

export const ExpenseMonthSummary = z.object({
  totalAmount: money,
  payrollAmount: money,
  expensesAmount: money,
  cashAmount: money,
  otherAmount: money,
  byCategory: z.array(
    z.object({
      categoryId: z.string(),
      name: z.string(),
      amount: money,
      count: z.number().int().nonnegative(),
    })
  ),
})
export type ExpenseMonthSummary = z.infer<typeof ExpenseMonthSummary>

export const ExpensesResponse = z.object({
  period: ExpensePeriod,
  entries: z.array(ExpenseEntry),
  /** Quantos lançamentos o filtro achou no mês — não quantos vieram. */
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  /**
   * O que os lançamentos ATIVOS do filtro somam — F187.
   *
   * É a resposta de "quanto eu gastei com marmita?": o total do mês não serve,
   * porque ele é do mês inteiro de propósito (ver `summary`).
   */
  filteredAmount: money,
  /**
   * O resumo do MÊS INTEIRO, que **não** obedece ao filtro.
   *
   * De propósito: "Total do mês" tem de continuar sendo o total do mês quando
   * alguém filtra por "Alimentação", senão o número muda de significado sem
   * mudar de nome. Quem responde pelo recorte é `filteredAmount`.
   */
  summary: ExpenseMonthSummary,
})
export type ExpensesResponse = z.infer<typeof ExpensesResponse>

export const RecordExpenseRequest = z.object({
  branchId: z.uuid().optional(),
  kind: ExpenseKindSchema,
  categoryId: z.uuid().nullable().default(null),
  employeeId: z.uuid().nullable().default(null),
  /** Só no gasto; o pagamento de salário sempre desconta. */
  deductsSalary: z.boolean().default(false),
  /** O mês da folha em que desconta. */
  period: ExpensePeriod.nullable().default(null),
  description: z
    .string()
    .trim()
    .min(1, 'Diga o que foi.')
    .max(200, 'A descrição vai até 200 letras.'),
  amount: amountInput,
  spentOn: z.iso.date(),
  paymentSource: ExpensePaymentSourceSchema,
  /** O caixa aberto de onde o dinheiro saiu, quando `cash`. */
  cashSessionId: z.uuid().nullable().default(null),
})
export type RecordExpenseRequest = z.input<typeof RecordExpenseRequest>
export type RecordExpenseBody = z.output<typeof RecordExpenseRequest>

export const ExpenseEntryResponse = z.object({ entry: ExpenseEntry })
export type ExpenseEntryResponse = z.infer<typeof ExpenseEntryResponse>

export const VoidExpenseRequest = z.object({
  version: z.number().int().nonnegative(),
  reason: z.string().trim().min(3, 'Diga por que está desfazendo.').max(500),
})
export type VoidExpenseRequest = z.infer<typeof VoidExpenseRequest>

export const VoidExpenseResponse = z.object({
  entry: ExpenseEntry,
  /**
   * O dinheiro voltou para a gaveta de onde saiu. Falso num lançamento em
   * dinheiro quando aquele caixa já fechou: o lançamento foi desfeito e a
   * gaveta não mudou — quem desfez acerta no caixa atual, se o dinheiro voltou.
   */
  cashReturned: z.boolean(),
})
export type VoidExpenseResponse = z.infer<typeof VoidExpenseResponse>

// ---------------------------------------------------------------------------
// A folha do mês
// ---------------------------------------------------------------------------

/**
 * A folha não pagina nem filtra: ela é a lista dos funcionários da loja.
 *
 * Deixou de ser `ExpensesQuery` na F187, quando o caderno ganhou filtro e
 * página — reaproveitar o mesmo schema faria a folha aceitar `page` e
 * `categoryId` e ignorá-los em silêncio.
 */
export const PayrollQuery = z.object({
  branchId: z.uuid().optional(),
  period: ExpensePeriod,
})
export type PayrollQuery = z.input<typeof PayrollQuery>

export const PayrollRow = z.object({
  employeeId: z.string(),
  name: z.string(),
  employeeStatus: ExpenseRecordStatusSchema,
  employeeVersion: z.number().int(),
  /** Os recorrentes do cadastro vigentes no mês (F157). */
  earnings: z.array(
    z.object({ kind: EmployeeEarningKindSchema, amount: money })
  ),
  /** Os bônus e descontos lançados só neste mês (F157). */
  adjustments: z.array(
    z.object({
      id: z.string(),
      employeeId: z.string(),
      kind: PayrollAdjustmentKindSchema,
      description: z.string(),
      amount: money,
      actorName: z.string().nullable(),
      createdAt: z.string(),
      version: z.number().int(),
    })
  ),
  /**
   * O que a loja deve no mês: ganhos + bônus − descontos.
   *
   * Nulo é "não há nada cadastrado" — o "Sem salário" da tela —, e é diferente
   * de zero, que é "não há o que pagar".
   */
  dueAmount: money.nullable(),
  paidAmount: money,
  remainingAmount: money.nullable(),
  status: PayrollStatusSchema.nullable(),
  /** Os lançamentos que descontaram da folha neste mês. */
  entries: z.array(ExpenseEntry),
})
export type PayrollRow = z.infer<typeof PayrollRow>

export const PayrollResponse = z.object({
  period: ExpensePeriod,
  rows: z.array(PayrollRow),
  totals: z.object({
    dueAmount: money,
    paidAmount: money,
    /**
     * O que ainda falta sair, somando SÓ quem está devendo — F186.
     *
     * Somar com sinal fazia o mês com um a receber e outro pago a mais
     * escrever "Falta pagar: R$ 0,00".
     */
    remainingAmount: money,
    /** O que já saiu além do devido, positivo. Zero no mês normal — F186. */
    overpaidAmount: money,
  }),
})
export type PayrollResponse = z.infer<typeof PayrollResponse>

// ---------------------------------------------------------------------------
// Bônus e desconto do mês — F157
// ---------------------------------------------------------------------------

/**
 * Um bônus ou desconto que vale só naquele mês.
 *
 * **O valor é sempre positivo e quem diz o sinal é o `kind`.** Um `-500`
 * digitado no campo errado inverteria a folha em silêncio.
 *
 * Não tem `paymentSource`: isto não é dinheiro saindo, é o que a loja passa a
 * dever — ou a dever menos. O dinheiro sai depois, como pagamento de salário.
 */
export const RecordPayrollAdjustmentRequest = z.object({
  branchId: z.uuid().optional(),
  employeeId: z.uuid(),
  kind: PayrollAdjustmentKindSchema,
  period: ExpensePeriod,
  description: z
    .string()
    .trim()
    .min(1, 'Diga o que é.')
    .max(200, 'A descrição vai até 200 letras.'),
  amount: amountInput,
})
export type RecordPayrollAdjustmentRequest = z.input<
  typeof RecordPayrollAdjustmentRequest
>
export type RecordPayrollAdjustmentBody = z.output<
  typeof RecordPayrollAdjustmentRequest
>

export const VoidPayrollAdjustmentRequest = z.object({
  version: z.number().int().nonnegative(),
  reason: z.string().trim().min(3, 'Diga por que está desfazendo.').max(500),
})
export type VoidPayrollAdjustmentRequest = z.infer<
  typeof VoidPayrollAdjustmentRequest
>
