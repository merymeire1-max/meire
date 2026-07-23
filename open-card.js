/**
 * open-card.js - Comando de Abrir Cartas
 *
 * Responsabilidades:
 * - Parsear números de cartas da mensagem
 * - Validar cartas ativas
 * - Executar abertura sequencial via cardManager
 * - Fornecer feedback de progresso
 * - AUTO-SLOTAGEM: Colocar cartas abertas em slots vazios automaticamente
 * - AUTO-FECHAMENTO: Fechar o UCM após abrir ou usar cartas
 *
 * @module OpenCardCommand
 */

import { cardManager } from "@systems/cards/card-manager.js";
import { configManager } from "@core/config-manager.js";
import { notificationManager } from "@interface/notification-manager.js";
import { liveTurnManager } from "@systems/integrations/live-turn-manager.js";

// Import condicional do autoSlotManager
let autoSlotManager = null;
try {
  const autoSlotModule = await import("@systems/auto-slot-manager.js");
  autoSlotManager = autoSlotModule.autoSlotManager;
  console.log("✅ Auto-Slot Manager importado com sucesso");
} catch (error) {
  console.warn("⚠️ Auto-Slot Manager não disponível:", error.message);
}

// Timer global para evitar múltiplos setTimeout concorrentes
let _ucmAutoCloseTimer = null;

// ============================================
// GERENCIADOR DE FECHAMENTO AUTOMÁTICO DO UCM
// ============================================

/**
 * Encontra e retorna o elemento do UCM (User Card Menu)
 * @private
 * @returns {Element|null} - Elemento do UCM ou null se não encontrado
 */
function getUCMElement() {
  // Tenta diferentes seletores possíveis para o UCM (inclui seletors do redesign)
  const ucmSelectors = [
    "#ucmStage", // redesign: stage element id
    ".ucm-stage", // redesign: stage class
    "#ucmInfoPanel", // redesign: info panel id
    ".ucm-info-panel", // redesign: info panel class
    ".ucm",
    "#user-card-menu",
    ".user-card-menu",
    "[data-ucm]",
    ".card-menu",
    "[role='dialog'][class*='card']",
  ];

  for (const selector of ucmSelectors) {
    const element = document.querySelector(selector);
    if (!element) continue;

    try {
      // Se visível, preferimos; mesmo se estiver oculto, retornamos para permitir fallback de API/evento
      if (element.offsetParent !== null) return element;
      return element;
    } catch (e) {
      // Em alguns ambientes offsetParent pode lançar; retornar o elemento de qualquer forma.
      return element;
    }
  }

  return null;
}

/**
 * Faz um fechamento "forçado" do UCM por DOM (remove classes/oculta elementos)
 * @private
 */
function _forceHideUCMByDOM() {
  try {
    const stage = document.querySelector("#ucmStage") || document.querySelector(".ucm-stage");
    const info = document.querySelector("#ucmInfoPanel") || document.querySelector(".ucm-info-panel");

    if (stage && stage.classList) stage.classList.remove("active", "closing");
    if (info && info.classList) info.classList.remove("active", "closing");

    if (stage && typeof stage.remove === "function") {
      // não removemos imediatamente para evitar quebrar reuso; apenas limpamos classes
    }

    // Também limpamos possíveis overlays que possam manter o UCM "visível"
    document.querySelectorAll(".ucm-target-overlay, .ucm-slot-overlay").forEach((el) => {
      try {
        el.remove();
      } catch (e) {
        // ignora
      }
    });
  } catch (e) {
    // ignora
  }
}

/**
 * Fecha o UCM com animação opcional
 * PRIORIDADE:
 * 1) Tenta usar window.universalCardModal.close() (controlador JS central)
 * 2) Tenta fechar pelo elemento DOM encontrado (ucm.close() / remove / esconder)
 * 3) Em último caso, remove classes e dispara evento 'close-universal-card-modal'
 *
 * @private
 * @param {boolean} animate - Se true, usa animação ao fechar
 * @returns {Promise<void>}
 */
async function closeUCM(animate = true) {
  // 1) Tentar fechar usando o controlador global, se existir — é o método mais confiável
  if (window.universalCardModal && typeof window.universalCardModal.close === "function") {
    try {
      window.universalCardModal.close();
      console.log("✅ UCM fechado via universalCardModal API (prioritário)");
      return;
    } catch (err) {
      console.warn("⚠️ Falha ao fechar via universalCardModal API:", err);
      // continuar para tentar métodos DOM/fallbacks
    }
  }

  // 2) Buscar elemento DOM e tentar fechar por ele
  const ucm = getUCMElement();

  if (!ucm) {
    // 3) Último recurso: disparar evento que o UCM escuta e tentar esconder via DOM agressivo
    try {
      _forceHideUCMByDOM();
      document.dispatchEvent(new CustomEvent("close-universal-card-modal"));
      console.log("ℹ️ Disparado evento 'close-universal-card-modal' e aplicado hide DOM como fallback (nenhum elemento DOM específico encontrado)");
    } catch (err) {
      console.warn("⚠️ Não foi possível disparar evento de fechamento do UCM:", err);
    }
    console.warn("⚠️ UCM não encontrado para fechar via DOM");
    return;
  }

  try {
    if (animate && ucm.classList) {
      ucm.classList.add("closing");
      // tempo de animação — mantém compatível com o antigo 300ms
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Tenta diferentes métodos de fechamento no elemento
    if (typeof ucm.close === "function") {
      ucm.close();
    } else if (typeof window.universalCardModal?.close === "function") {
      // redundante mas seguro: se por acaso universalCardModal foi definido depois
      window.universalCardModal.close();
    } else if (typeof ucm.remove === "function") {
      ucm.remove();
    } else {
      // Fallback: esconde o elemento e limpa classes
      _forceHideUCMByDOM();
      try {
        ucm.style.display = "none";
        ucm.setAttribute("aria-hidden", "true");
      } catch (e) {
        // ignora se não for possível aplicar estilos
      }
      // também dispara evento para que listeners internos reajam
      document.dispatchEvent(new CustomEvent("close-universal-card-modal"));
    }

    console.log("✅ UCM fechado com sucesso (via DOM fallback)");
  } catch (error) {
    console.error("❌ Erro ao fechar UCM:", error);
  }
}

/**
 * Força o fechamento imediato do UCM
 * @public
 */
async function forceCloseUCM() {
  // limpa timer agendado se existir
  if (_ucmAutoCloseTimer) {
    clearTimeout(_ucmAutoCloseTimer);
    _ucmAutoCloseTimer = null;
  }
  await closeUCM(true);
}

/**
 * Exporta o gerenciador de UCM como objeto singleton
 */
export const closeUCMManager = {
  forceClose: forceCloseUCM,
  close: closeUCM,
  getElement: getUCMElement,
};

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

/**
 * Extrai números de cartas da mensagem ou detecta solicitação de sorteio
 * @private
 * @param {string} argsString
 * @returns {Object} { type: 'manual'|'random', positions: Array<number>|null, count: number|null }
 */
function extractCardNumbers(argsString) {
  const totalCartas = configManager.get("general.cartasVisiveis") || 55;

  // 1. Detectar '?'
  const questionMarks = (argsString.match(/\?/g) || []).length;

  if (questionMarks > 0) {
    return { type: "random", count: questionMarks };
  }

  // Comportamento original
  const numbers = [];
  const cleanText = argsString.toLowerCase().trim();
  const matches = cleanText.match(/\d+/g);

  if (!matches) return { type: "manual", positions: [] };

  matches.forEach((match) => {
    const num = parseInt(match, 10);
    if (num >= 1 && num <= totalCartas && !numbers.includes(num)) {
      numbers.push(num);
    }
  });

  numbers.sort((a, b) => a - b);
  return { type: "manual", positions: numbers };
}

/**
 * Seleciona posições aleatórias de cartas fechadas.
 * @private
 * @param {number} count - Número de cartas a sortear
 * @returns {Array<number>} - Array de posições (1-based)
 */
function getRandomCardPositions(count) {
  // 1. Mapear todas as posições possíveis (1 a N, baseadas no DOM)
  const allCards = Array.from(document.querySelectorAll(".card"));
  const availablePositions = [];

  allCards.forEach((card, index) => {
    // Apenas cartas fechadas (sem 'flipped')
    if (!card.classList.contains("flipped")) {
      availablePositions.push(index + 1);
    }
  });

  // 2. Embaralhar Fisher-Yates
  for (let i = availablePositions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availablePositions[i], availablePositions[j]] = [availablePositions[j], availablePositions[i]];
  }

  // 3. Selecionar N posições
  return availablePositions.slice(0, count);
}

/**
 * 🆕 Encontra o primeiro slot vazio do jogador
 * @private
 * @param {string} playerId
 * @returns {number|null} - Número do slot vazio ou null
 */
function findEmptySlot(playerId) {
  const maxSlots = configManager.get("general.maxSlots") || 6;

  for (let i = 1; i <= maxSlots; i++) {
    const card = cardManager.held.getCard(playerId, i);
    if (!card) {
      console.log(`✅ Slot vazio encontrado: ${i}`);
      return i;
    }
  }

  console.warn(`⚠️ Nenhum slot vazio disponível para ${playerId}`);
  return null;
}

/**
 * 🆕 Coloca uma carta aberta em um slot vazio
 * @private
 * @param {string} playerId
 * @param {number} cardNumber - ID da carta
 * @param {string} imagePath - URL da imagem da carta
 * @param {Object} cardConfig - Configuração da carta
 * @returns {Promise<boolean>} - true se colocado com sucesso
 */
async function placeCardInEmptySlot(playerId, cardNumber, imagePath, cardConfig) {
  if (!playerId || !imagePath || !cardConfig) {
    console.error(`❌ Parâmetros incompletos para auto-slotear:`, {
      playerId,
      imagePath,
      cardConfig,
    });
    return false;
  }

  try {
    // ✅ CORRIGIDO: Usar a API correta addCard(playerId, imagePath, cardConfig)
    // Esta mesma função é usada em card-manager._useHeldCard() na linha ~785
    const success = await cardManager.held.addCard(playerId, imagePath, cardConfig);

    if (success) {
      console.log(`🎯 Carta ${cardNumber} auto-sloteada com sucesso para ${playerId}`);

      // Dispara evento para UI atualizar
      document.dispatchEvent(
        new CustomEvent("card:placed-in-slot", {
          detail: { playerId, cardNumber, imagePath, cardConfig },
        }),
      );

      return true;
    } else {
      console.warn(`⚠️ addCard() retornou false para carta ${cardNumber}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Erro ao colocar carta ${cardNumber} no slot:`, error);
    return false;
  }
}

/**
 * Abre múltiplas cartas sequencialmente por POSIÇÃO VISUAL no deck.
 * Cada número representa a posição exibida ao GM (1 = primeira carta do deck atual),
 * não o ID interno da carta (card_62, card_5...).
 * @private
 * @param {string} playerId
 * @param {Array<number>} positions - Posições visuais (1-based)
 * @param {Object} metadata - Metadados do comando (username, etc.)
 * @returns {Promise<Object>}
 */
async function openCards(playerId, positions, metadata) {
  console.log(`🎴 Abrindo ${positions.length} carta(s) para ${playerId} (por posição no deck)`);

  const username = metadata?.username || metadata?.displayName || playerId;

  const result = {
    success: false,
    opened: [],
    alreadyOpen: [],
    invalid: [],
    slotted: [], // 🆕 Cartas colocadas em slots
  };

  for (const position of positions) {
    // ── Verificação de limite do modo live ─────────────────────────────
    const isSupport = metadata?.isSupport || false;
    const turnCheck = liveTurnManager.canOpenCard(playerId, isSupport);

    if (!turnCheck.allowed) {
      if (turnCheck.reason === "not_your_turn") {
        document.dispatchEvent(
          new CustomEvent("live:response", {
            detail: { message: `@${username}: não é sua vez de abrir cartas!` },
          }),
        );
        console.log(`🚫 Posição ${position} bloqueada — não é a vez de ${playerId}`);
        break;
      }

      if (turnCheck.reason === "limit_reached") {
        document.dispatchEvent(
          new CustomEvent("live:response", {
            detail: {
              message: `@${username}: você atingiu o limite de ${turnCheck.limit} carta(s) neste turno!`,
            },
          }),
        );
        console.log(`🚫 Limite de cartas atingido para ${playerId}`);
        break;
      }

      if (turnCheck.reason === "support_limit_reached") {
        document.dispatchEvent(
          new CustomEvent("live:response", {
            detail: {
              message: `@${username}: o limite de cartas de apoio (${turnCheck.limit}) foi atingido!`,
            },
          }),
        );
        console.log(`🚫 Limite de cartas de suporte atingido para ${playerId}`);
        break;
      }

      // Outro motivo de bloqueio: para silenciosamente
      break;
    }
    // ──────────────────────────────────────────────────────────────────

    // Busca pelo elemento usando a POSIÇÃO VISUAL (data-index é 0-based)
    const cardElement = document.querySelector(`.card[data-index="${position - 1}"]`);

    if (!cardElement) {
      console.warn(`⚠️ Posição ${position} não encontrada no deck atual (deck pode ter menos cartas)`);
      result.invalid.push(position);
      continue;
    }

    // Extrai o ID real da carta a partir do elemento já colocado no deck
    const actualCardNumber = parseInt(cardElement.dataset.cardNumber, 10);

    if (!actualCardNumber) {
      console.warn(`⚠️ Elemento na posição ${position} não possui data-card-number válido`);
      result.invalid.push(position);
      continue;
    }

    // Verifica se já está aberta
    if (cardElement.classList.contains("flipped")) {
      console.log(`ℹ️ Posição ${position} (carta ${actualCardNumber}) já está aberta`);
      result.alreadyOpen.push(position);
      continue;
    }

    try {
      // Usa cardManager para revelar e processar pelo ID real.
      // revealAndUseCard não retorna valor utilizável — sucesso = sem exceção.
      await cardManager.revealAndUseCard(actualCardNumber, cardElement);

      result.opened.push(position);
      liveTurnManager.recordCardOpened(isSupport);
      console.log(`✅ Posição ${position} (carta ${actualCardNumber}) aberta com sucesso`);

      // 🆕 TENTA COLOCAR A CARTA EM UM SLOT VAZIO AUTOMATICAMENTE
      try {
        // ✅ CORRIGIDO: Usar cardManager.loader.loadConfig() e resolveAssets()
        const cardConfig = await cardManager.loader.loadConfig(actualCardNumber);

        if (cardConfig) {
          // Resolve assets para obter a imagePath correta
          const assets = await cardManager.loader.resolveAssets(actualCardNumber, cardConfig);

          // Agora temos imagePath
          const slotted = await placeCardInEmptySlot(
            playerId,
            actualCardNumber,
            assets.imagePath,
            cardConfig,
          );

          if (slotted) {
            result.slotted.push(actualCardNumber);
            console.log(`✅ Carta ${actualCardNumber} auto-sloteada com sucesso`);
          }
        } else {
          console.warn(`⚠️ Configuração não encontrada para carta ${actualCardNumber}, não será auto-sloteada`);
        }
      } catch (slotError) {
        console.warn(`⚠️ Não foi possível auto-slotear carta ${actualCardNumber}:`, slotError);
        // Não é erro crítico — apenas log
      }

      // Marcar tempo de abertura e emitir evento para integrações (ex: comando /game hold)
      try {
        cardElement.dataset.flipTime = `${Date.now()}`;
        const index = cardElement.dataset.index !== undefined ? parseInt(cardElement.dataset.index, 10) + 1 : null;
        document.dispatchEvent(
          new CustomEvent("card:opened", {
            detail: { playerId, cardNumber: actualCardNumber, element: cardElement, position: index },
          }),
        );
      } catch (e) {
        // Não crítico — apenas debug
        console.debug("Não foi possível definir flipTime / dispatch card:opened:", e);
      }

      // ⚡ ALTERADO: Pausa entre cartas reduzida para 1 SEGUNDOS
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`❌ Erro ao abrir posição ${position} (carta ${actualCardNumber}):`, error);
      result.invalid.push(position);
    }
  }

  result.success = result.opened.length > 0;

  return result;
}

/**
 * Mostra feedback de resultado
 * @private
 * @param {string} playerId
 * @param {Object} result
 */
function showFeedback(playerId, result) {
  if (!notificationManager) return;

  // Cartas abertas com sucesso
  if (result.opened.length > 0) {
    const cardsText = result.opened.join(", ");
    const slottedText =
      result.slotted.length > 0 ? ` → Slots preenchidos: ${result.slotted.length}` : "";
    notificationManager.show({
      type: playerId,
      text: `✅ Cartas abertas:<br><strong>${cardsText}</strong>${slottedText}`,
      duration: 4000,
    });
  }

  // Cartas já abertas
  if (result.alreadyOpen.length > 0) {
    const alreadyText = result.alreadyOpen.join(", ");

    setTimeout(
      () => {
        notificationManager.show({
          type: playerId,
          text: `⚠️ Já abertas:<br><strong>${alreadyText}</strong>`,
          duration: 3000,
        });
      },
      result.opened.length > 0 ? 4200 : 0,
    );
  }

  // Cartas inválidas
  if (result.invalid.length > 0) {
    const invalidText = result.invalid.join(", ");

    let delay = 0;
    if (result.opened.length > 0) delay += 4200;
    if (result.alreadyOpen.length > 0) delay += 3200;

    setTimeout(() => {
      notificationManager.show({
        type: playerId,
        text: `❌ Inválidas:<br><small>${invalidText}</small>`,
        duration: 3000,
      });
    }, delay);
  }

  // Se nenhuma carta foi aberta e nenhuma outra notificação já foi exibida
  if (!result.success && result.invalid.length === 0 && result.alreadyOpen.length === 0) {
    notificationManager.show({
      type: playerId,
      text: `❌ Nenhuma carta foi aberta`,
      duration: 3000,
    });
  }
}

// ============================================
// DEFINIÇÃO DO COMANDO
// ============================================

/**
 * Comando: Abrir Cartas
 */
export const openCardCommand = {
  id: "abrir",
  name: "abrir",
  aliases: ["open", "revelar", "reveal", "card", "escolher"],
  description: "Abre uma ou mais cartas pelo número",
  usage: "/game abrir 5 10 15",
  minArgs: 1,
  maxArgs: 10, // Limita a 10 cartas por comando (performance)
  cooldown: 2000, // 2 segundos entre usos

  /**
   * Executa comando de abrir cartas
   * @param {string} playerId - ID do jogador
   * @param {Array<string>} args - Argumentos
   * @param {Object} metadata - Metadados
   * @returns {Promise<boolean>}
   */
  async execute(playerId, args, metadata) {
    // Extrai posições visuais das cartas
    const rawArgs = metadata.rawArgs || args.join(" ");
    const extractionResult = extractCardNumbers(rawArgs);

    let positions = [];

    // --- Nova Lógica de Integração ---
    if (extractionResult.type === "random") {
      positions = getRandomCardPositions(extractionResult.count);

      if (positions.length === 0) {
        console.warn("⚠️ Nenhuma carta fechada disponível para sorteio");
        if (notificationManager) {
          notificationManager.show({
            type: playerId,
            text: `⚠️ Nenhuma carta fechada disponível!`,
            duration: 3000,
          });
        }
        return false;
      }
    } else {
      positions = extractionResult.positions;
    }
    // ----------------------------------

    // Valida (para casos manuais)
    if (positions.length === 0) {
      console.warn("⚠️ Nenhuma posição de carta válida encontrada");

      if (notificationManager) {
        notificationManager.show({
          type: playerId,
          text: `⚠️ Uso: /game abrir [posições]<br><small>Ex: /game abrir 5 10 ou /game ??</small>`,
          duration: 4000,
        });
      }

      return false;
    }

    // Verifica limite (para manuais e random)
    if (positions.length > 10) {
      console.warn("⚠️ Muitas posições solicitadas");

      if (notificationManager) {
        notificationManager.show({
          type: playerId,
          text: `⚠️ Máximo de 10 cartas por comando`,
          duration: 3000,
        });
      }

      return false;
    }

    console.log(`🎴 Comando abrir: posições [${positions.join(", ")}] - ${playerId}`);

    try {
      // Executa abertura
      const result = await openCards(playerId, positions, metadata);

      // Feedback
      showFeedback(playerId, result);

      // 🆕 AUTO-FECHAMENTO DO UCM
      if (result.success) {
        // ⚡ ALTERADO: Delay do UCM reduzido para 2 SEGUNDOS (2000ms)
        const ucmAutoCloseDelay = 2000;

        console.log(`📋 Agendando fechamento do UCM em ${ucmAutoCloseDelay}ms`);

        // limpa timers anteriores
        if (_ucmAutoCloseTimer) {
          clearTimeout(_ucmAutoCloseTimer);
          _ucmAutoCloseTimer = null;
        }

        _ucmAutoCloseTimer = setTimeout(async () => {
          _ucmAutoCloseTimer = null;
          try {
            // 1) Tentar fechar diretamente pelo singleton (mais confiável)
            if (window.universalCardModal && typeof window.universalCardModal.close === "function") {
              try {
                window.universalCardModal.close();
                console.log("✅ UCM fechado automaticamente via universalCardModal API (agendado)");
                return;
              } catch (err) {
                console.warn("⚠️ Erro ao fechar via universalCardModal API (agendado):", err);
              }
            }

            // 2) Tentar método genérico definido aqui (DOM / event fallback)
            await closeUCM(true);

            // 3) Segurança extra: limpar classes ativas e disparar evento que o UCM escuta
            try {
              _forceHideUCMByDOM();
              document.dispatchEvent(new CustomEvent("close-universal-card-modal"));
            } catch (e) {
              // ignora
            }
          } catch (err) {
            console.warn("⚠️ Erro ao fechar UCM automaticamente:", err);
          }
        }, ucmAutoCloseDelay);
      }

      return result.success;
    } catch (error) {
      console.error("❌ Erro ao processar comando abrir:", error);

      if (notificationManager) {
        notificationManager.show({
          type: playerId,
          text: `❌ Erro ao abrir cartas`,
          duration: 3000,
        });
      }

      return false;
    }
  },
};

console.log("✅ Comando 'abrir' carregado com auto-fechamento do UCM em 2 segundos");
