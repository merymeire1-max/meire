/**
 * hold-card.js - Comando para Mover Cartas para Slots Seguros
 *
 * Responsabilidades:
 * - Mover cartas abertas para slots seguros do player
 * - Validar seleção de player (player1, player2)
 * - Fornecer feedback visual
 * - Sincronizar estado do jogo
 *
 * @module HoldCardCommand
 */

import { configManager } from "@core/config-manager.js";
import { notificationManager } from "@interface/notification-manager.js";

/**
 * Obtém todas as cartas atualmente abertas (flipped) na tela
 * @private
 * @returns {Array<Object>} Array com dados das cartas abertas
 */
function getOpenedCards() {
  const openedCards = [];
  const cardElements = document.querySelectorAll(".card.flipped");

  console.log(`🔍 Procurando cartas abertas... encontradas: ${cardElements.length}`);

  cardElements.forEach((element, index) => {
    const cardNumber = parseInt(element.dataset.cardNumber, 10);
    const cardIndex = parseInt(element.dataset.index, 10);
    
    console.log(`  Carta ${index}: cardNumber=${cardNumber}, cardIndex=${cardIndex}, element=`, element);
    
    if (cardNumber) {
      openedCards.push({
        element,
        cardNumber,
        position: cardIndex + 1, // 1-based para exibição
        cardIndex,
        name: element.dataset.cardName || `Carta #${cardNumber}`,
      });
    }
  });

  console.log(`✅ Total de cartas abertas encontradas: ${openedCards.length}`);
  return openedCards;
}

/**
 * Obtém ou cria o container de slots seguros para um player
 * @private
 * @param {string} playerId - player1 ou player2
 * @returns {HTMLElement|null}
 */
function getPlayerSafeSlots(playerId) {
  console.log(`\n🔍 === BUSCANDO/CRIANDO CONTAINER PARA ${playerId} ===`);
  
  // Tenta encontrar container existente
  let container = document.querySelector(`[data-player-safe-slots="${playerId}"]`);
  console.log(`Procurando [data-player-safe-slots="${playerId}"]... ${container ? "ENCONTRADO" : "NÃO ENCONTRADO"}`);

  if (container) {
    console.log(`✅ Container já existe:`, container);
    return container;
  }

  // Tenta encontrar diferentes locais para criar o container
  console.log(`\n🔍 Procurando local para criar container...`);
  
  let gameBoard = null;
  
  // Tentativa 1: .game-board
  gameBoard = document.querySelector(".game-board");
  console.log(`  .game-board:`, gameBoard ? "✅ ENCONTRADO" : "❌ NÃO ENCONTRADO");
  
  // Tentativa 2: main
  if (!gameBoard) {
    gameBoard = document.querySelector("main");
    console.log(`  main:`, gameBoard ? "✅ ENCONTRADO" : "❌ NÃO ENCONTRADO");
  }
  
  // Tentativa 3: body (último recurso)
  if (!gameBoard) {
    gameBoard = document.body;
    console.log(`  body:`, gameBoard ? "✅ ENCONTRADO (usando body como fallback)" : "❌ ERRO");
  }

  if (!gameBoard) {
    console.error("❌ Não foi possível encontrar área de jogo para criar slots seguros");
    return null;
  }

  console.log(`✅ Criando container em:`, gameBoard);

  container = document.createElement("div");
  container.className = "player-safe-slots";
  container.dataset.playerSafeSlots = playerId;
  container.style.cssText = `
    border: 2px solid #00ff00;
    padding: 15px;
    margin: 10px;
    background-color: rgba(0, 0, 0, 0.7);
    border-radius: 8px;
    min-width: 200px;
  `;
  
  container.innerHTML = `
    <div class="safe-slots-header" style="margin-bottom: 10px;">
      <h3 style="color: #00ff00; margin: 0 0 5px 0;">${playerId.toUpperCase()} - Cartas Seguras</h3>
      <span class="slot-count" style="color: #00ff00; font-weight: bold;">0</span>
    </div>
    <div class="safe-slots-container" style="display: flex; flex-wrap: wrap; gap: 10px; min-height: 100px; border: 1px solid #00ff00; padding: 10px;"></div>
  `;

  gameBoard.appendChild(container);
  console.log(`✅ Container criado e adicionado ao DOM:`, container);
  console.log(`📍 Container inserido em:`, gameBoard);
  
  // Verifica se realmente foi adicionado
  const verification = document.querySelector(`[data-player-safe-slots="${playerId}"]`);
  console.log(`🔍 Verificação: Container está no DOM?`, verification ? "✅ SIM" : "❌ NÃO");

  return container;
}

/**
 * Move uma carta para os slots seguros do player
 * @private
 * @param {Object} cardData - Dados da carta (element, cardNumber, etc)
 * @param {string} playerId - player1 ou player2
 * @returns {boolean}
 */
function moveCardToSafeSlot(cardData, playerId) {
  try {
    console.log(`\n📌 === MOVENDO CARTA ${cardData.cardNumber} PARA ${playerId} ===`);

    const safeContainer = getPlayerSafeSlots(playerId);

    if (!safeContainer) {
      console.error("❌ Não foi possível obter container de slots seguros");
      return false;
    }

    console.log(`✅ Container obtido:`, safeContainer);

    // Obtém container de cartas do player
    const slotsDiv = safeContainer.querySelector(".safe-slots-container");
    console.log(`✅ Slots div obtido:`, slotsDiv);

    if (!slotsDiv) {
      console.error("❌ Não foi possível encontrar .safe-slots-container");
      return false;
    }

    // Clona o elemento da carta para o slot seguro
    console.log(`🔄 Clonando elemento...`);
    const cardClone = cardData.element.cloneNode(true);
    console.log(`✅ Clone criado:`, cardClone);

    cardClone.classList.add("card-in-safe-slot");
    cardClone.dataset.movedFrom = "board";
    cardClone.dataset.timestamp = Date.now();
    
    // Garante que o clone tem dimensões visíveis
    cardClone.style.cssText = `
      width: 80px;
      height: 120px;
      border: 2px solid #00ff00;
      margin: 5px;
      cursor: pointer;
      opacity: 1 !important;
      visibility: visible !important;
      display: block !important;
    `;

    console.log(`➕ Adicionando clone ao container...`);
    slotsDiv.appendChild(cardClone);
    console.log(`✅ Clone adicionado ao DOM`);

    // Verifica se o clone está realmente no DOM
    const verification = slotsDiv.querySelectorAll(".card-in-safe-slot");
    console.log(`🔍 Verificação: Cartas no container agora:`, verification.length);

    // Atualiza contagem de cartas seguras
    const slotCount = slotsDiv.querySelectorAll(".card-in-safe-slot").length;
    const countSpan = safeContainer.querySelector(".slot-count");
    if (countSpan) {
      countSpan.textContent = slotCount;
      console.log(`✅ Contador atualizado para: ${slotCount}`);
    }

    // Dispara evento de carta movida
    document.dispatchEvent(
      new CustomEvent("card:moved-to-safe", {
        detail: {
          playerId,
          cardNumber: cardData.cardNumber,
          cardName: cardData.name,
          position: cardData.position,
          safeSlotIndex: slotCount,
        },
      }),
    );

    console.log(`✅ SUCESSO! Carta ${cardData.cardNumber} clonada para slots seguros de ${playerId}`);
    return true;
  } catch (error) {
    console.error("❌ Erro ao mover carta para slot seguro:", error);
    console.error("Stack:", error.stack);
    return false;
  }
}

/**
 * Move todas as cartas abertas para slots seguros de um player
 * @private
 * @param {string} playerId - player1 ou player2
 * @returns {Object} Resultado da operação
 */
function holdCardsForPlayer(playerId) {
  const openedCards = getOpenedCards();

  if (openedCards.length === 0) {
    console.warn("⚠️ Nenhuma carta aberta para segurar");
    return {
      success: false,
      reason: "no_cards_opened",
      message: "Nenhuma carta aberta no tabuleiro",
    };
  }

  const result = {
    success: true,
    playerId,
    moved: [],
    failed: [],
    message: "",
  };

  // Move cada carta aberta para o slot seguro
  openedCards.forEach((cardData) => {
    const moved = moveCardToSafeSlot(cardData, playerId);

    if (moved) {
      result.moved.push({
        cardNumber: cardData.cardNumber,
        position: cardData.position,
        name: cardData.name,
      });
    } else {
      result.failed.push({
        cardNumber: cardData.cardNumber,
        position: cardData.position,
      });
    }
  });

  // Cria mensagem de resultado
  if (result.moved.length > 0) {
    const cardsText = result.moved.map((c) => `#${c.position}`).join(", ");
    result.message = `✅ ${result.moved.length} carta(s) segura(s): ${cardsText}`;
  }

  if (result.failed.length > 0) {
    const failedText = result.failed.map((c) => `#${c.position}`).join(", ");
    result.message += ` | ❌ ${result.failed.length} falha(s): ${failedText}`;
  }

  return result;
}

/**
 * Limpa todos os slots seguros de um player
 * @private
 * @param {string} playerId - player1 ou player2
 */
function clearSafeSlots(playerId) {
  const container = document.querySelector(`[data-player-safe-slots="${playerId}"]`);

  if (container) {
    const slotsDiv = container.querySelector(".safe-slots-container");
    if (slotsDiv) {
      slotsDiv.innerHTML = "";
    }

    const countSpan = container.querySelector(".slot-count");
    if (countSpan) {
      countSpan.textContent = "0";
    }

    console.log(`🧹 Slots seguros de ${playerId} limpos`);
  }
}

/**
 * Obtém cartas seguras de um player (para análise/verificação)
 * @private
 * @param {string} playerId - player1 ou player2
 * @returns {Array<Object>}
 */
function getSafeCardsForPlayer(playerId) {
  const container = document.querySelector(`[data-player-safe-slots="${playerId}"]`);

  if (!container) return [];

  const slotsDiv = container.querySelector(".safe-slots-container");
  if (!slotsDiv) return [];

  const safeCards = [];
  slotsDiv.querySelectorAll(".card-in-safe-slot").forEach((cardEl, index) => {
    safeCards.push({
      cardNumber: parseInt(cardEl.dataset.cardNumber, 10),
      position: index + 1,
      timestamp: parseInt(cardEl.dataset.timestamp, 10),
    });
  });

  return safeCards;
}

// ============================================
// DEFINIÇÃO DO COMANDO
// ============================================

/**
 * Comando: Segurar Cartas
 * Uso: /game segurar player1
 *      /game segurar player2
 */
export const holdCardCommand = {
  id: "segurar",
  name: "segurar",
  aliases: ["hold", "safe", "guardar", "secure"],
  description: "Move cartas abertas para os slots seguros de um player",
  usage: "/game segurar [player1|player2]",
  minArgs: 1,
  maxArgs: 1,
  cooldown: 1000,

  /**
   * Executa comando de segurar cartas
   * @param {string} playerId - ID do jogador que executou o comando
   * @param {Array<string>} args - Argumentos
   * @param {Object} metadata - Metadados
   * @returns {Promise<boolean>}
   */
  async execute(playerId, args, metadata) {
    const targetPlayer = args[0]?.toLowerCase().trim();

    // Valida player fornecido
    if (!targetPlayer || !targetPlayer.match(/^player[12]$/i)) {
      console.warn("⚠️ Player inválido fornecido");

      if (notificationManager) {
        notificationManager.show({
          type: playerId,
          text: `⚠️ Uso: /game segurar [player1|player2]<br><small>Ex: /game segurar player1</small>`,
          duration: 4000,
        });
      }

      return false;
    }

    const normalizedPlayer = targetPlayer.toLowerCase();

    console.log(`🎴 Comando segurar: clonando cartas para ${normalizedPlayer}`);

    try {
      // Executa movimento de cartas
      const result = holdCardsForPlayer(normalizedPlayer);

      if (!result.success) {
        console.warn(`⚠️ ${result.message}`);

        if (notificationManager) {
          notificationManager.show({
            type: playerId,
            text: `⚠️ ${result.message}`,
            duration: 3000,
          });
        }

        return false;
      }

      // Feedback positivo
      if (notificationManager) {
        notificationManager.show({
          type: playerId,
          text: result.message.replace(/\|/g, "<br>"),
          duration: 4000,
        });
      }

      // Dispara evento de sucesso
      document.dispatchEvent(
        new CustomEvent("cards:held", {
          detail: {
            playerId: normalizedPlayer,
            cardsCount: result.moved.length,
            cards: result.moved,
            timestamp: Date.now(),
          },
        }),
      );

      // Broadcast para chat (se aplicável)
      if (result.moved.length > 0) {
        const cardsText = result.moved.map((c) => `#${c.position}`).join(", ");
        document.dispatchEvent(
          new CustomEvent("live:response", {
            detail: {
              message: `📦 ${normalizedPlayer}: ${result.moved.length} carta(s) segura(s) [${cardsText}]`,
            },
          }),
        );
      }

      return true;
    } catch (error) {
      console.error("❌ Erro ao executar comando segurar:", error);

      if (notificationManager) {
        notificationManager.show({
          type: playerId,
          text: `❌ Erro ao segurar cartas`,
          duration: 3000,
        });
      }

      return false;
    }
  },
};

// ============================================
// UTILITÁRIOS EXPORTADOS (para uso externo)
// ============================================

export {
  getOpenedCards,
  getPlayerSafeSlots,
  moveCardToSafeSlot,
  holdCardsForPlayer,
  clearSafeSlots,
  getSafeCardsForPlayer,
};

console.log("✅ Comando 'segurar' carregado - pronto para clonar cartas aos slots seguros");
