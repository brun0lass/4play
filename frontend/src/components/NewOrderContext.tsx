import { createContext, useContext } from 'react'

/** Abre o "Novo pedido" de qualquer tela (o menu, o quadro, o painel vazio). */
/** `null` para quem não pode criar pedido: a tela esconde o botão. */
export const NewOrderContext = createContext<(() => void) | null>(null)

export const useNewOrder = () => useContext(NewOrderContext)
