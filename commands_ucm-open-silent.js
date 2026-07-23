// Comando para abrir o UCM em background (sem mostrar nada na tela)
// Uso: CommandRegistry.register('ucm.openSilent', { execute: ({card: 12, autoClose: true, delay: 500}) })

import { cardManager } from "@systems/cards/card-manager.js";
import { notificationManager } from "@interface/notification-manager.js";
import { configManager } from "@core/config-manager.js";

async function openUcmSilentByCardNumber(cardNumber, opts = {}) {
  if (!window.universalCardModal) {
    console.warn("UCM não inicializado");
    if (notificationManager) {
      notificationManager.show({ type: "system", text: "⚠️ UCM não disponível", duration: 3000 });
    }
    return false;
  }

  try {
    const cardConfig = await cardManager.loader.loadConfig(cardNumber);
    if (!cardConfig) {
      console.warn("Config de carta não encontrada:", cardNumber);
      if (notificationManager) {
        notificationManager.show({ type: "system", text: `❌ Carta ${cardNumber} não encontrada`, duration: 3000 });
      }
      return false;
    }

    const assets = await cardManager.loader.resolveAssets(cardNumber, cardConfig);
    const imagePath = assets?.imagePath ?? "";

    // Prepara callbacks mínimos — a ação real fica por conta de quem chamar onUse/onHold ou de processos subsequentes.
    const onUse = opts.onUse || null;
    const onHold = opts.onHold || null;
    const onCancel = opts.onCancel || null;

    // Auto-close options (podem vir do configManager)
    const autoClose = typeof opts.autoClose === "boolean" ? opts.autoClose : (configManager.get("ucm.defaultAutoClose") ?? false);
    const autoCloseDelay = typeof opts.autoCloseDelay === "number" ? opts.autoCloseDelay : (configManager.get("ucm.defaultAutoCloseDelay") ?? 350);

    // Abre em silent mode
    await window.universalCardModal.open({
      cardImage: imagePath,
      config: cardConfig,
      onUse,
      onHold,
      onCancel,
      autoClose,
      autoCloseDelay,
      silent: true,
    });

    console.log(`ℹ️ UCM aberto em background para carta ${cardNumber}`);
    if (notificationManager) {
      notificationManager.show({
        type: "system",
        text: `ℹ️ UCM (background) carregado para carta ${cardNumber}`,
        duration: 2500,
      });
    }

    return true;
  } catch (err) {
    console.error("Erro ao abrir UCM em background:", err);
    if (notificationManager) {
      notificationManager.show({ type: "system", text: `❌ Falha ao abrir UCM: ${err.message}`, duration: 3000 });
    }
    return false;
  }
}

// Registro para o CommandRegistry, se existir
if (typeof CommandRegistry !== "undefined" && CommandRegistry.register) {
  CommandRegistry.register("ucm.openSilent", {
    description: "Abre o UCM em background (sem mostrar UI) para uma carta (id). Uso: { card: number, autoClose?: boolean, autoCloseDelay?: number }",
    execute: async (args = {}) => {
      const card = args.card ?? args.cardNumber ?? args[0];
      const autoClose = args.autoClose;
      const autoCloseDelay = args.autoCloseDelay;

      if (!card) {
        console.warn("ucm.openSilent: parâmetro 'card' faltando");
        return false;
      }

      return openUcmSilentByCardNumber(Number(card), { autoClose, autoCloseDelay });
    },
  });
}

// Também exporta o helper para import direto
export const ucmOpenSilent = {
  id: "ucm.openSilent",
  execute: async (params = {}) => {
    const card = params.card ?? params.cardNumber ?? params[0];
    if (!card) return false;
    return openUcmSilentByCardNumber(Number(card), params);
  },
};