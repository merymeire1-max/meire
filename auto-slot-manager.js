/**
 * auto-slot-manager.js - Sistema de Auto-Preenchimento de Slots
 *
 * Responsabilidades:
 * - Detectar slots vazios no jogo
 * - Enviar cartas abertas direto para slots sem passar pelo UCM
 * - Gerenciar fila de cartas para múltiplos slots
 * - Fornecer feedback de preenchimento
 *
 * @module AutoSlotManager
 */

import { notificationManager } from "@interface/notification-manager.js";

/**
 * Sistema de Auto-Preenchimento de Slots
 */
export const autoSlotManager = {
  // Configuração
  config: {
    slotSelector: ".game-slot",
    slotFilledClass: "filled",
    slotEmptyClass: "empty",
    cardSlotAttribute: "data-card-id",
    animationDuration: 500, // ms para animação de movimento
    movementEasing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  },

  /**
   * Detecta todos os slots vazios disponíveis
   * @returns {Array<HTMLElement>} Array de slots vazios
   */
  findEmptySlots() {
    try {
      const allSlots = Array.from(document.querySelectorAll(this.config.slotSelector));
      const emptySlots = allSlots.filter((slot) => {
        if (!slot) return false;
        const isFilled = slot.classList.contains(this.config.slotFilledClass);
        const hasCard = slot.querySelector(".card");
        return !isFilled && !hasCard;
      });

      console.log(`🎯 Encontrados ${emptySlots.length} slots vazios`);
      return emptySlots;
    } catch (error) {
      console.error("❌ Erro ao encontrar slots vazios:", error);
      return [];
    }
  },

  /**
   * Detecta todos os slots ocupados
   * @returns {Array<HTMLElement>} Array de slots preenchidos
   */
  findFilledSlots() {
    try {
      const allSlots = Array.from(document.querySelectorAll(this.config.slotSelector));
      return allSlots.filter((slot) => {
        if (!slot) return false;
        const isFilled = slot.classList.contains(this.config.slotFilledClass);
        const hasCard = slot.querySelector(".card");
        return isFilled || hasCard;
      });
    } catch (error) {
      console.error("❌ Erro ao encontrar slots preenchidos:", error);
      return [];
    }
  },

  /**
   * Obtém o próximo slot vazio
   * @returns {HTMLElement|null}
   */
  getNextEmptySlot() {
    const emptySlots = this.findEmptySlots();
    return emptySlots.length > 0 ? emptySlots[0] : null;
  },

  /**
   * Anima uma carta do deck para um slot
   * @private
   * @param {HTMLElement} cardElement
   * @param {HTMLElement} targetSlot
   * @returns {Promise<void>}
   */
  async _animateCardToSlot(cardElement, targetSlot) {
    if (!cardElement || !targetSlot) {
      console.warn("⚠️ Elemento da carta ou slot inválido");
      return;
    }

    try {
      const cardRect = cardElement.getBoundingClientRect();
      const slotRect = targetSlot.getBoundingClientRect();

      // Criar clone para animação
      const cardClone = cardElement.cloneNode(true);
      cardClone.style.position = "fixed";
      cardClone.style.top = `${cardRect.top}px`;
      cardClone.style.left = `${cardRect.left}px`;
      cardClone.style.width = `${cardRect.width}px`;
      cardClone.style.height = `${cardRect.height}px`;
      cardClone.style.zIndex = "9999";
      cardClone.style.pointerEvents = "none";
      cardClone.style.transition = `all ${this.config.animationDuration}ms ${this.config.movementEasing}`;
      cardClone.classList.add("card-moving");

      document.body.appendChild(cardClone);

      // Forçar reflow para iniciar animação
      void cardClone.offsetWidth;

      // Animar para slot
      cardClone.style.top = `${slotRect.top}px`;
      cardClone.style.left = `${slotRect.left}px`;
      cardClone.style.width = `${slotRect.width}px`;
      cardClone.style.height = `${slotRect.height}px`;
      cardClone.style.transform = "scale(0.95)";
      cardClone.style.opacity = "0.8";

      // Aguardar animação
      await new Promise((resolve) => setTimeout(resolve, this.config.animationDuration));

      // Remover clone
      if (cardClone.parentNode) {
        cardClone.remove();
      }
    } catch (error) {
      console.error("❌ Erro na animação da carta:", error);
    }
  },

  /**
   * Posiciona carta no slot (visualmente)
   * @private
   * @param {HTMLElement} cardElement
   * @param {HTMLElement} targetSlot
   */
  _attachCardToSlot(cardElement, targetSlot) {
    if (!cardElement || !targetSlot) {
      console.warn("⚠️ Elemento inválido ao anexar carta ao slot");
      return;
    }

    try {
      // Limpar slot de cartas antigas
      const oldCards = targetSlot.querySelectorAll(".card");
      oldCards.forEach((c) => {
        if (c && c.parentNode === targetSlot) {
          c.remove();
        }
      });

      // Resetar estilos
      cardElement.style.position = "static";
      cardElement.style.opacity = "1";
      cardElement.style.transform = "";
      cardElement.style.transition = "none";
      cardElement.style.top = "";
      cardElement.style.left = "";
      cardElement.style.width = "";
      cardElement.style.height = "";
      cardElement.style.zIndex = "";

      // Anexar ao slot
      targetSlot.appendChild(cardElement);
      targetSlot.classList.add(this.config.slotFilledClass);
      targetSlot.classList.remove(this.config.slotEmptyClass);
    } catch (error) {
      console.error("❌ Erro ao anexar carta ao slot:", error);
    }
  },

  /**
   * Move uma carta do deck para um slot vazio
   * @param {HTMLElement} cardElement - Elemento da carta no deck
   * @param {HTMLElement} targetSlot - Slot alvo (opcional - usa o primeiro vazio)
   * @returns {Promise<boolean>} Sucesso da operação
   */
  async moveCardToSlot(cardElement, targetSlot = null) {
    if (!cardElement) {
      console.warn("⚠️ Elemento da carta inválido");
      return false;
    }

    try {
      // Se não houver slot especificado, pega o primeiro vazio
      if (!targetSlot) {
        targetSlot = this.getNextEmptySlot();
        if (!targetSlot) {
          console.warn("⚠️ Nenhum slot vazio disponível");
          return false;
        }
      }

      const cardNumber = parseInt(cardElement.dataset.cardNumber, 10);
      const slotIndex = targetSlot.dataset.slotIndex || targetSlot.id || "desconhecido";

      if (!cardNumber || isNaN(cardNumber)) {
        console.warn("⚠️ Número da carta inválido");
        return false;
      }

      // Animar
      await this._animateCardToSlot(cardElement, targetSlot);

      // Posicionar
      this._attachCardToSlot(cardElement, targetSlot);

      // Atualizar atributo
      targetSlot.setAttribute(this.config.cardSlotAttribute, cardNumber);

      console.log(`✅ Carta ${cardNumber} movida para slot ${slotIndex}`);

      // Emitir evento
      try {
        document.dispatchEvent(
          new CustomEvent("card:moved-to-slot", {
            detail: {
              cardNumber,
              slotIndex,
              cardElement,
              slot: targetSlot,
              timestamp: Date.now(),
            },
          }),
        );
      } catch (e) {
        console.debug("Aviso ao emitir evento card:moved-to-slot:", e.message);
      }

      return true;
    } catch (error) {
      console.error(`❌ Erro ao mover carta para slot:`, error);
      return false;
    }
  },

  /**
   * Processa múltiplas cartas abertas automaticamente para slots
   * @param {Array<HTMLElement>} cardElements - Elementos das cartas abertas
   * @param {string} playerId - ID do jogador
   * @returns {Promise<Object>} Resultado da operação
   */
  async processCardsToSlots(cardElements, playerId) {
    const result = {
      movedToSlots: [],
      noSlotsAvailable: [],
      errors: [],
      totalProcessed: 0,
    };

    if (!cardElements || !Array.isArray(cardElements) || cardElements.length === 0) {
      console.warn("⚠️ Nenhuma carta para processar");
      return result;
    }

    result.totalProcessed = cardElements.length;
    console.log(`🔄 Processando ${cardElements.length} carta(s) para slots...`);

    // Processar cada carta
    for (let i = 0; i < cardElements.length; i++) {
      try {
        const cardElement = cardElements[i];

        if (!cardElement) {
          console.warn(`⚠️ Elemento de carta ${i} inválido`);
          continue;
        }

        const emptySlot = this.getNextEmptySlot();

        if (!emptySlot) {
          const cardNum = parseInt(cardElement.dataset.cardNumber, 10) || i;
          result.noSlotsAvailable.push(cardNum);
          console.log(`ℹ️ Carta ${cardNum} - sem slot disponível`);
          continue;
        }

        const success = await this.moveCardToSlot(cardElement, emptySlot);

        if (success) {
          const cardNum = parseInt(cardElement.dataset.cardNumber, 10) || i;
          result.movedToSlots.push(cardNum);
        } else {
          const cardNum = parseInt(cardElement.dataset.cardNumber, 10) || i;
          result.errors.push(cardNum);
        }

        // Pausa entre movimentos
        if (i < cardElements.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      } catch (error) {
        console.error(`❌ Erro ao processar carta ${i}:`, error);
        result.errors.push(i);
      }
    }

    result.success = result.movedToSlots.length > 0;

    console.log(
      `📊 Resumo: ${result.movedToSlots.length} movidas, ${result.noSlotsAvailable.length} sem slot, ${result.errors.length} erros`,
    );

    return result;
  },

  /**
   * Mostra feedback visual das cartas movidas
   * @param {string} playerId
   * @param {Object} result
   */
  showFeedback(playerId, result) {
    if (!notificationManager) {
      console.warn("⚠️ NotificationManager não disponível");
      return;
    }

    try {
      let delay = 0;

      // Cartas movidas com sucesso
      if (result.movedToSlots && result.movedToSlots.length > 0) {
        const cardsText = result.movedToSlots.join(", ");
        notificationManager.show({
          type: playerId,
          text: `✅ Cartas preenchidas:<br><strong>${cardsText}</strong>`,
          duration: 3000,
        });
        delay = 3200;
      }

      // Sem slots disponíveis
      if (result.noSlotsAvailable && result.noSlotsAvailable.length > 0) {
        const cardsText = result.noSlotsAvailable.join(", ");

        setTimeout(() => {
          notificationManager.show({
            type: playerId,
            text: `⚠️ Sem slots vazios:<br><strong>${cardsText}</strong>`,
            duration: 3000,
          });
        }, delay);

        delay += 3200;
      }

      // Erros
      if (result.errors && result.errors.length > 0) {
        const cardsText = result.errors.join(", ");

        setTimeout(() => {
          notificationManager.show({
            type: playerId,
            text: `❌ Erros ao mover:<br><small>${cardsText}</small>`,
            duration: 3000,
          });
        }, delay);
      }
    } catch (error) {
      console.error("❌ Erro ao mostrar feedback:", error);
    }
  },

  /**
   * Obtém informações sobre slots
   * @returns {Object} Status dos slots
   */
  getSlotStatus() {
    try {
      const empty = this.findEmptySlots();
      const filled = this.findFilledSlots();
      const total = empty.length + filled.length;

      return {
        total,
        empty: empty.length,
        filled: filled.length,
        occupancyPercentage: total > 0 ? ((filled.length / total) * 100).toFixed(1) : 0,
        availablePercentage: total > 0 ? ((empty.length / total) * 100).toFixed(1) : 0,
      };
    } catch (error) {
      console.error("❌ Erro ao obter status dos slots:", error);
      return { total: 0, empty: 0, filled: 0, occupancyPercentage: 0, availablePercentage: 0 };
    }
  },

  /**
   * Limpa todos os slots
   */
  clearAllSlots() {
    try {
      const allSlots = Array.from(document.querySelectorAll(this.config.slotSelector));
      let clearedCount = 0;

      allSlots.forEach((slot) => {
        if (!slot) return;

        slot.classList.remove(this.config.slotFilledClass);
        slot.classList.add(this.config.slotEmptyClass);
        slot.removeAttribute(this.config.cardSlotAttribute);

        const cards = slot.querySelectorAll(".card");
        cards.forEach((c) => {
          if (c) c.remove();
        });

        clearedCount++;
      });

      console.log(`🧹 ${clearedCount} slots limpos`);
    } catch (error) {
      console.error("❌ Erro ao limpar slots:", error);
    }
  },

  /**
   * Obtém cards atualmente abertos no deck
   * @returns {Array<HTMLElement>}
   */
  getOpenedCardsInDeck() {
    try {
      return Array.from(document.querySelectorAll(".card.flipped"));
    } catch (error) {
      console.error("❌ Erro ao obter cartas abertas:", error);
      return [];
    }
  },
};

console.log("✅ Auto-Slot Manager carregado com sucesso");
