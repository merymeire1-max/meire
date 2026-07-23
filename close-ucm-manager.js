/**
 * close-ucm-manager.js - Gerenciador de Fechamento Automático do UCM
 *
 * Responsabilidades:
 * - Fechar o UCM após abrir uma carta
 * - Fechar o UCM após usar uma carta nos slots
 * - Gerenciar eventos de abertura e uso de cartas
 * - Configurar tempo de delay antes do fechamento
 *
 * @module CloseUCMManager
 */

import { configManager } from "@core/config-manager.js";

// ============================================
// CONSTANTES
// ============================================

const UCM_SELECTORS = [
  ".ucm",
  "#user-card-menu",
  ".user-card-menu",
  "[data-ucm]",
  ".card-menu",
  "[role='dialog'][class*='card']",
];

const ANIMATION_DURATION = 300; // ms

// ============================================
// CACHE DE LISTENERS (para possibilitar remoção)
// ============================================

const listeners = {
  onCardOpened: null,
  onCardPlacedInSlot: null,
  onCardUsed: null,
};

// ============================================
// FUNÇÕES PRIVADAS
// ============================================

/**
 * Encontra e retorna o elemento do UCM (User Card Menu)
 * @private
 * @returns {Element|null} - Elemento do UCM ou null se não encontrado
 */
function getUCMElement() {
  for (const selector of UCM_SELECTORS) {
    const element = document.querySelector(selector);
    if (element && element.offsetParent !== null) {
      return element;
    }
  }
  return null;
}

/**
 * Fecha o UCM com animação opcional
 * @private
 * @param {boolean} animate - Se true, usa animação ao fechar
 * @returns {Promise<void>}
 */
async function closeUCM(animate = true) {
  const ucm = getUCMElement();

  if (!ucm) {
    console.warn("⚠️ UCM não encontrado para fechar");
    return;
  }

  try {
    if (animate) {
      ucm.classList.add("closing");
      await new Promise((resolve) => setTimeout(resolve, ANIMATION_DURATION));
    }

    // Tenta diferentes métodos de fechamento
    if (typeof ucm.close === "function") {
      ucm.close();
    } else if (typeof ucm.remove === "function") {
      ucm.remove();
    } else {
      ucm.style.display = "none";
      ucm.setAttribute("aria-hidden", "true");
    }

    console.log("✅ UCM fechado com sucesso");
  } catch (error) {
    console.error("❌ Erro ao fechar UCM:", error);
  }
}

// ============================================
// EVENT LISTENERS
// ============================================

/**
 * Listener para eventos de abertura de cartas
 * @private
 */
function onCardOpened(event) {
  const { cardNumber } = event.detail || {};
  const autoCloseDelay = configManager.get("general.ucmAutoCloseDelay") || 2000;

  if (autoCloseDelay <= 0) return;

  console.log(
    `📋 Carta ${cardNumber} aberta. Agendando fechamento do UCM em ${autoCloseDelay}ms`
  );

  setTimeout(() => closeUCM(true), autoCloseDelay);
}

/**
 * Listener para eventos de colocação de carta em slot
 * @private
 */
function onCardPlacedInSlot(event) {
  const { cardNumber } = event.detail || {};
  const autoCloseDelay = configManager.get("general.ucmAutoCloseDelay") || 2000;

  if (autoCloseDelay <= 0) return;

  console.log(
    `🎯 Carta ${cardNumber} colocada em slot. Agendando fechamento do UCM em ${autoCloseDelay}ms`
  );

  setTimeout(() => closeUCM(true), autoCloseDelay);
}

/**
 * Listener para eventos customizados de uso de carta
 * @private
 */
function onCardUsed(event) {
  const { cardNumber } = event.detail || {};
  const autoCloseDelay = configManager.get("general.ucmAutoCloseDelay") || 2000;

  if (autoCloseDelay <= 0) return;

  console.log(
    `⚡ Carta ${cardNumber} foi usada. Agendando fechamento do UCM em ${autoCloseDelay}ms`
  );

  setTimeout(() => closeUCM(true), autoCloseDelay);
}

// ============================================
// FUNÇÕES PÚBLICAS
// ============================================

/**
 * Inicializa o gerenciador de fechamento automático do UCM
 */
export function initializeUCMAutoClose() {
  const isEnabled = configManager.get("general.ucmAutoClose") !== false;

  if (!isEnabled) {
    console.log("⚠️ Auto-fechamento do UCM desabilitado");
    return;
  }

  // Cria referências aos listeners para possibilitar remoção
  listeners.onCardOpened = onCardOpened;
  listeners.onCardPlacedInSlot = onCardPlacedInSlot;
  listeners.onCardUsed = onCardUsed;

  // Registra listeners
  document.addEventListener("card:opened", listeners.onCardOpened);
  document.addEventListener("card:placed-in-slot", listeners.onCardPlacedInSlot);
  document.addEventListener("card:used", listeners.onCardUsed);

  console.log("✅ Gerenciador de Auto-Fechamento do UCM inicializado");
}

/**
 * Desativa o gerenciador de fechamento automático do UCM
 */
export function disableUCMAutoClose() {
  if (listeners.onCardOpened) {
    document.removeEventListener("card:opened", listeners.onCardOpened);
  }
  if (listeners.onCardPlacedInSlot) {
    document.removeEventListener(
      "card:placed-in-slot",
      listeners.onCardPlacedInSlot
    );
  }
  if (listeners.onCardUsed) {
    document.removeEventListener("card:used", listeners.onCardUsed);
  }

  console.log("🛑 Gerenciador de Auto-Fechamento do UCM desativado");
}

/**
 * Força o fechamento imediato do UCM
 * @public
 */
export async function forceCloseUCM() {
  await closeUCM(true);
}

// ============================================
// EXPORTS
// ============================================

/**
 * Gerenciador singleton do UCM
 */
export const closeUCMManager = {
  initialize: initializeUCMAutoClose,
  disable: disableUCMAutoClose,
  forceClose: forceCloseUCM,
  close: closeUCM,
  getElement: getUCMElement,
};

console.log("✅ Módulo 'close-ucm-manager.js' carregado");