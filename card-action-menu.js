/**
 * card-action-menu.js - Menu de Ações para Cartas Abertas
 *
 * Responsabilidades:
 * - Exibir menu interativo após abrir cartas
 * - Permitir escolha entre "mandar pros slots vazios" ou "usar"
 * - Executar ação selecionada
 * - Gerenciar estado do menu
 *
 * @module CardActionMenu
 */

import { cardManager } from "@systems/cards/card-manager.js";
import { notificationManager } from "@interface/notification-manager.js";
import { playerStatus } from "@systems/player/player-status.js";

// Importação segura do autoSlotManager
let autoSlotManager = null;
try {
  const { autoSlotManager: asm } = await import("@systems/integrations/auto-slot-manager.js");
  autoSlotManager = asm;
  console.log("✅ autoSlotManager carregado no card-action-menu");
} catch (error) {
  console.warn("⚠️ autoSlotManager não disponível:", error.message);
}

/**
 * Armazena as cartas abertas aguardando ação
 * @private
 */
const pendingCards = new Map();

/**
 * Cria e exibe o menu de ação para uma carta
 * @private
 * @param {string} playerId
 * @param {Object} cardData - { cardNumber, name, element, position }
 * @returns {Promise<string>} - 'slot' ou 'use'
 */
function createActionMenu(playerId, cardData) {
  return new Promise((resolve) => {
    const menuId = `card-menu-${cardData.cardNumber}-${Date.now()}`;
    
    // Container do menu
    const menuContainer = document.createElement("div");
    menuContainer.id = menuId;
    menuContainer.className = "card-action-menu";
    menuContainer.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 10000;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 3px solid #0f3460;
      border-radius: 15px;
      padding: 30px;
      min-width: 400px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.7), inset 0 0 20px rgba(15, 52, 96, 0.3);
      font-family: 'Arial', sans-serif;
      animation: slideIn 0.3s ease-out;
    `;

    // Título
    const title = document.createElement("h3");
    title.textContent = `Carta Aberta: ${cardData.name}`;
    title.style.cssText = `
      color: #e0e0e0;
      margin: 0 0 10px 0;
      text-align: center;
      font-size: 18px;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    `;

    // Número da carta
    const cardNumber = document.createElement("p");
    cardNumber.textContent = `#${cardData.cardNumber}`;
    cardNumber.style.cssText = `
      color: #0f3460;
      margin: 0 0 20px 0;
      text-align: center;
      font-size: 14px;
      opacity: 0.8;
    `;

    // Pergunta
    const question = document.createElement("p");
    question.textContent = "O que você quer fazer com essa carta?";
    question.style.cssText = `
      color: #b0b0b0;
      margin: 0 0 25px 0;
      text-align: center;
      font-size: 14px;
    `;

    // Container de botões
    const buttonContainer = document.createElement("div");
    buttonContainer.style.cssText = `
      display: flex;
      gap: 15px;
      justify-content: center;
    `;

    // Botão "Mandar pros Slots"
    const slotButton = document.createElement("button");
    slotButton.textContent = "📦 Slots Vazios";
    slotButton.className = "card-action-btn card-action-slot";
    slotButton.style.cssText = `
      flex: 1;
      padding: 12px 20px;
      background: linear-gradient(135deg, #0f3460 0%, #16213e 100%);
      border: 2px solid #00d4ff;
      border-radius: 8px;
      color: #00d4ff;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(0, 212, 255, 0.2);
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
    `;

    slotButton.onmouseover = () => {
      slotButton.style.background = "linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)";
      slotButton.style.color = "#1a1a2e";
      slotButton.style.boxShadow = "0 6px 20px rgba(0, 212, 255, 0.4)";
    };

    slotButton.onmouseout = () => {
      slotButton.style.background = "linear-gradient(135deg, #0f3460 0%, #16213e 100%)";
      slotButton.style.color = "#00d4ff";
      slotButton.style.boxShadow = "0 4px 15px rgba(0, 212, 255, 0.2)";
    };

    slotButton.onclick = () => {
      closeMenu(menuId);
      resolve("slot");
    };

    // Botão "Usar"
    const useButton = document.createElement("button");
    useButton.textContent = "⚡ Usar";
    useButton.className = "card-action-btn card-action-use";
    useButton.style.cssText = `
      flex: 1;
      padding: 12px 20px;
      background: linear-gradient(135deg, #e94b3c 0%, #c1272d 100%);
      border: 2px solid #ff6b6b;
      border-radius: 8px;
      color: #ffffff;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(233, 75, 60, 0.2);
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
    `;

    useButton.onmouseover = () => {
      useButton.style.background = "linear-gradient(135deg, #ff6b6b 0%, #e94b3c 100%)";
      useButton.style.boxShadow = "0 6px 20px rgba(233, 75, 60, 0.4)";
    };

    useButton.onmouseout = () => {
      useButton.style.background = "linear-gradient(135deg, #e94b3c 0%, #c1272d 100%)";
      useButton.style.boxShadow = "0 4px 15px rgba(233, 75, 60, 0.2)";
    };

    useButton.onclick = () => {
      closeMenu(menuId);
      resolve("use");
    };

    // Montar estrutura
    buttonContainer.appendChild(slotButton);
    buttonContainer.appendChild(useButton);

    menuContainer.appendChild(title);
    menuContainer.appendChild(cardNumber);
    menuContainer.appendChild(question);
    menuContainer.appendChild(buttonContainer);

    // Overlay (para fechar ao clicar fora - opcional)
    const overlay = document.createElement("div");
    overlay.id = `card-menu-overlay-${menuId}`;
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      z-index: 9999;
    `;

    // Adicionar ao DOM
    document.body.appendChild(overlay);
    document.body.appendChild(menuContainer);

    // Adicionar CSS de animação
    if (!document.getElementById("card-menu-animations")) {
      const style = document.createElement("style");
      style.id = "card-menu-animations";
      style.textContent = `
        @keyframes slideIn {
          from {
            transform: translate(-50%, -50%) scale(0.8);
            opacity: 0;
          }
          to {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
        }
        
        @keyframes slideOut {
          from {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
          to {
            transform: translate(-50%, -50%) scale(0.8);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }

    /**
     * Fecha o menu
     * @private
     */
    function closeMenu(id) {
      const menu = document.getElementById(id);
      const overlayEl = document.getElementById(`card-menu-overlay-${id}`);

      if (menu) {
        menu.style.animation = "slideOut 0.3s ease-out";
        setTimeout(() => menu.remove(), 300);
      }

      if (overlayEl) {
        overlayEl.style.opacity = "0";
        overlayEl.style.transition = "opacity 0.3s ease";
        setTimeout(() => overlayEl.remove(), 300);
      }
    }
  });
}

/**
 * Processa ação de enviar para slots vazios
 * @private
 * @param {string} playerId
 * @param {Object} cardData
 * @returns {Promise<boolean>}
 */
async function sendToEmptySlots(playerId, cardData) {
  try {
    console.log(`📦 Enviando carta ${cardData.cardNumber} para slots vazios...`);

    // Se autoSlotManager estiver disponível, usar ele
    if (autoSlotManager && autoSlotManager.addCardToEmptySlot) {
      const success = await autoSlotManager.addCardToEmptySlot(
        playerId,
        cardData.cardNumber,
        cardData.element
      );

      if (success) {
        notificationManager?.show({
          type: playerId,
          text: `✅ Carta #${cardData.cardNumber} enviada para um slot vazio!`,
          duration: 3000,
        });
        return true;
      }
    }

    // Fallback: procurar slots vazios manualmente
    const emptySlots = document.querySelectorAll(".slot:not(.filled)");

    if (emptySlots.length === 0) {
      notificationManager?.show({
        type: playerId,
        text: `⚠️ Nenhum slot vazio disponível!`,
        duration: 3000,
      });
      return false;
    }

    // Enviar para o primeiro slot vazio
    const firstEmptySlot = emptySlots[0];
    firstEmptySlot.classList.add("filled");
    firstEmptySlot.dataset.cardNumber = cardData.cardNumber;
    firstEmptySlot.innerHTML = `<span class="slot-card">#${cardData.cardNumber}</span>`;

    notificationManager?.show({
      type: playerId,
      text: `✅ Carta #${cardData.cardNumber} enviada para slot!`,
      duration: 3000,
    });

    // Dispara evento
    document.dispatchEvent(
      new CustomEvent("card:sent-to-slot", {
        detail: {
          playerId,
          cardNumber: cardData.cardNumber,
          slot: firstEmptySlot,
        },
      })
    );

    return true;
  } catch (error) {
    console.error("❌ Erro ao enviar carta para slots:", error);
    notificationManager?.show({
      type: playerId,
      text: `❌ Erro ao enviar para slot`,
      duration: 3000,
    });
    return false;
  }
}

/**
 * Processa ação de usar a carta
 * 🔴 CORRIGIDO: Agora obtém e passa modificadores de status (elemento + bônus de dano)
 * @private
 * @param {string} playerId
 * @param {Object} cardData
 * @returns {Promise<boolean>}
 */
async function useCard(playerId, cardData) {
  try {
    console.log(`⚡ Usando carta ${cardData.cardNumber}...`);

    // 🔴 NOVO: Obter modificadores de status do jogador
    // Isso inclui: overrideElement (elemento elemental da classe), damageBonus, damageMultiply
    const modifiers = playerStatus?.getModifiers?.(playerId) || {};
    
    console.log(`📊 Modificadores do ${playerId}:`, {
      element: modifiers.overrideElement || 'nenhum',
      damageBonus: modifiers.damageBonus || {},
      damageMultiply: modifiers.damageMultiply || 1,
    });

    // Se houver efeito especial da carta, executar aqui
    // ✅ NOVO: Passar os modificadores junto
    if (cardManager.useCardEffect) {
      await cardManager.useCardEffect(
        cardData.cardNumber,
        cardData.element,
        modifiers  // 👈 NOVO: Passa modificadores (elemento + bônus)
      );
    } else {
      // Fallback: chamar método público do cardManager
      await cardManager.useCard(cardData.cardNumber);
    }

    notificationManager?.show({
      type: playerId,
      text: `⚡ Carta #${cardData.cardNumber} usada com sucesso!`,
      duration: 3000,
    });

    // Dispara evento com modificadores
    document.dispatchEvent(
      new CustomEvent("card:used", {
        detail: {
          playerId,
          cardNumber: cardData.cardNumber,
          modifiers,  // 👈 NOVO: Passa modificadores no evento
        },
      })
    );

    return true;
  } catch (error) {
    console.error("❌ Erro ao usar carta:", error);
    notificationManager?.show({
      type: playerId,
      text: `❌ Erro ao usar carta`,
      duration: 3000,
    });
    return false;
  }
}

/**
 * Gerencia ação de uma carta aberta
 * @public
 * @param {string} playerId
 * @param {Object} cardData
 * @returns {Promise<void>}
 */
export async function promptCardAction(playerId, cardData) {
  try {
    // Exibir menu e aguardar escolha
    const action = await createActionMenu(playerId, cardData);

    console.log(`🎯 Ação selecionada: ${action} para carta #${cardData.cardNumber}`);

    if (action === "slot") {
      await sendToEmptySlots(playerId, cardData);
    } else if (action === "use") {
      await useCard(playerId, cardData);
    }
  } catch (error) {
    console.error("❌ Erro ao processar ação da carta:", error);
  }
}

/**
 * Gerencia múltiplas cartas abertas
 * @public
 * @param {string} playerId
 * @param {Array<Object>} cardsData
 * @returns {Promise<void>}
 */
export async function promptMultipleCardActions(playerId, cardsData) {
  for (const cardData of cardsData) {
    // Aguardar cada ação sequencialmente para não sobrecarregar a UI
    await promptCardAction(playerId, cardData);
    // Pequena pausa entre cartas
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

console.log("✅ Card Action Menu carregado com sucesso");
