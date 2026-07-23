/**
 * card-manager.js - Orquestrador do Sistema de Cartas
 *
 * Responsabilidades:
 * - Coordenar card-loader, card-held e card-cooldowns
 * - Interface pública unificada para uso de cartas
 * - Gerenciar fluxo completo: revelar → usar → segurar
 * - Integração com cardCombat para aplicar efeitos
 * - Validação completa antes de executar ações
 * - Criar cartas viradas no grid
 * - Modal de seleção de cartas viradas
 * - Feedback visual e sonoro
 * - Gerenciar fila de cartas (UCM Queue)
 *
 * NOTA: Compatível com novo sistema de cartas (v2.0)
 * - Trabalha com números de carta (1, 2, 3...)
 * - card-loader converte internamente para IDs (card_001, card_002...)
 * - Cartas não encontradas retornam null (não são criadas)
 *
 * @module CardManager
 */

import { cardLoader } from "@systems/cards/card-loader.js";
import { cardHeld } from "@systems/cards/card-held.js";
import { cardCooldowns } from "@systems/cards/card-cooldowns.js";
import { cardCombat } from "@systems/cards/card-combat.js";
import { deckManager } from "@systems/cards/deck-manager.js";
import { ucmCardQueue } from "@interface/ucm-card-queue.js";
import { sessionState } from "@core/session-state.js";
import { playerUI } from "@interface/player-ui.js";
import { playerManager } from "@systems/player/player-manager.js";
import { playerStatus } from "@systems/player/player-status.js";
import { configManager } from "@core/config-manager.js";
import { animationSystem } from "@interface/enhanced-animations.js";
import { effectApplicator } from "@systems/cards/interativa/interactive-card-effects.js";
import { audioManager } from "@systems/audio/audio-manager.js";
import { notificationManager } from "@interface/notification-manager.js";
import { universalCardModal } from "@interface/universal-card-ui.js";
import { languageManager } from "@core/language-manager.js";

/**
 * @typedef {Object} CardRevealResult
 * @property {boolean} success - Revelação bem-sucedida?
 * @property {number} cardNumber - Número da carta
 * @property {Object} config - Configuração da carta
 * @property {string} imagePath - URL da imagem
 */

/**
 * @typedef {Object} CardUseResult
 * @property {boolean} success - Uso bem-sucedido?
 * @property {string} action - 'used' | 'held' | 'cancelled'
 * @property {Object} [combatResult] - Resultado do combate (se aplicável)
 */

class CardManager {
  constructor() {
    this.initialized = false;

    // Referências aos módulos
    this.loader = cardLoader;
    this.held = cardHeld;
    this.cooldowns = cardCooldowns;
    this.combat = cardCombat;

    // Grid de cartas (DOM)
    this.cardsGrid = null;
    this.flippedCards = new Set(); // URLs de cartas viradas

    // Fila de cartas (UCM Queue)
    this.cardQueue = ucmCardQueue;
    this.isQueueActive = false;

    // Estatísticas
    this.stats = {
      cardsRevealed: 0,
      cardsUsed: 0,
      cardsHeld: 0,
      cardsCancelled: 0,
    };
  }

  /**
   * Inicializa o sistema completo de cartas
   * @param {Object} [options]
   * @param {Function} [options.onProgress] - Callback(current, total) para progresso de pré-carga
   */
  async init({ onProgress = null } = {}) {
    if (this.initialized) {
      console.warn("⚠️ CardManager já foi inicializado");
      return;
    }

    console.log("🃏 CardManager inicializando...");

    // 1. Inicializa módulos
    this.loader.init();
    this.held.init();
    this.cooldowns.init();

    // 2. Referência ao grid de cartas
    this.cardsGrid = document.getElementById("cardsContainer");

    if (!this.cardsGrid) {
      console.error("❌ Grid de cartas não encontrado no DOM");
    }

    // 3. Configura listeners de eventos
    this._setupEventListeners();

    // 4. Pré-carrega cartas ativas (com callback de progresso se fornecido)
    await this._preloadActiveCards(onProgress);

    this.initialized = true;
    console.log("✅ CardManager inicializado");
  }

  /**
   * Pré-carrega configurações de TODAS as cartas registradas no sistema.
   * A filtragem por deck ocorre em shuffleCards() — não no pré-carregamento.
   * Reporta progresso via callback se fornecido.
   * @private
   * @param {Function|null} onProgress — (current, total) => void
   */
  async _preloadActiveCards(onProgress = null) {
    console.log("🔄 Pré-carregando configurações de cartas...");

    const allCards = configManager.getCards();
    const allNums = allCards.map((c) => this.loader.extractCardNumber(c.id)).filter((n) => n !== null);
    const total = allNums.length;

    onProgress?.(0, total);

    const configs = await this.loader.loadMultiple(allNums);

    onProgress?.(configs.size, total);
    console.log(`✅ ${configs.size} configurações pré-carregadas`);
  }

  /**
   * Configura listeners de eventos
   * @private
   */
  _setupEventListeners() {
    // Listener para abrir modal de cartas seguradas
    document.addEventListener("open-held-card-modal", async (e) => {
      const { playerId, slot } = e.detail;
      await this._showHeldCardModal(playerId, slot);
    });
    document.addEventListener("keydown", (e) => {
      const modal = document.getElementById("heldCardModal");
      if (e.key === "Escape" && modal?.style.display === "flex") {
        modal.style.display = "none";
      }
    });

    // Click no backdrop (no próprio modal, fora da lista) fecha
    document.getElementById("heldCardModal")?.addEventListener("click", (e) => {
      if (e.target.id === "heldCardModal") {
        e.currentTarget.style.display = "none";
      }
    });

    // Listener para usar carta segurada
    document.addEventListener("use-held-card", async (e) => {
      const { playerId, slot, card } = e.detail;
      await this._useHeldCard(playerId, slot, card);
    });

    // Listener para finalização da fila de cartas
    document.addEventListener("ucm-queue-finished", () => {
      this.isQueueActive = false;
      console.log("📋 Fila de cartas finalizada");
    });
  }

  // ============================================
  // CRIAR GRID DE CARTAS
  // ============================================

  /**
   * Cria o grid de cartas viradas
   * @param {Array<number>} cardNumbers - Números das cartas a exibir
   * @returns {boolean}
   */
  createCardsGrid(cardNumbers) {
    if (!this.cardsGrid) {
      console.error("❌ Grid de cartas não disponível");
      return false;
    }

    console.log(`🃏 Criando grid com ${cardNumbers.length} carta(s)...`);
    console.log(`DEBUG: Input cardNumbers:`, cardNumbers);

    // Limpa grid existente
    this.cardsGrid.innerHTML = "";
    this.flippedCards.clear();

    // Cria elementos de carta
    cardNumbers.forEach((cardNumber, index) => {
      const cardElement = this._createCardElement(cardNumber, index);
      this.cardsGrid.appendChild(cardElement);
    });

    // Verifica pós-renderização
    const createdCards = Array.from(this.cardsGrid.querySelectorAll(".card"));
    const createdCardNumbers = createdCards.map((c) => parseInt(c.dataset.cardNumber));
    console.log(`DEBUG: DOM Grid created with ${createdCardNumbers.length} cards:`, createdCardNumbers);

    console.log(`✅ Grid criado com ${cardNumbers.length} carta(s)`);
    return true;
  }

  /**
   * Cria elemento de carta individual
   * @private
   * @param {number} cardNumber
   * @param {number} index
   * @returns {HTMLElement}
   */
  _createCardElement(cardNumber, index) {
    const cardElement = document.createElement("div");
    cardElement.className = "card";
    cardElement.dataset.index = index;
    cardElement.dataset.cardNumber = cardNumber;

    cardElement.innerHTML = `
      <div class="card-inner">
        <div class="card-back">
          <img src="" alt="" class="card-back-img" data-default-back="1">
          <div class="card-number">${index + 1}</div>
        </div>
        <div class="card-front">
          <img src="" alt="Carta ${cardNumber}" class="card-front-img">
        </div>
      </div>
    `;

    // Double-click: Revela e usa
    cardElement.addEventListener("dblclick", async () => {
      await this.revealAndUseCard(cardNumber, cardElement);
    });

    // Context menu: Apenas usa (se já virada)
    cardElement.addEventListener("contextmenu", async (e) => {
      e.preventDefault();

      if (cardElement.classList.contains("flipped")) {
        await this.useCard(cardNumber);
      }
    });

    // Sincroniza verso ativo se um tema ou cardBack do jogo estiver aplicado
    const backImg = cardElement.querySelector(".card-back-img");
    if (backImg && effectApplicator?._currentCardBackSrc) {
      backImg.src = effectApplicator._currentCardBackSrc;
      if (effectApplicator._currentCardBackOpacity != null) {
        backImg.style.opacity = effectApplicator._currentCardBackOpacity;
      }
    }

    return cardElement;
  }

  // ============================================
  // REVELAR CARTA
  // ============================================

  /**
   * Revela uma carta (animação + áudio + vídeo + PNG)
   * @param {number} cardNumber
   * @param {HTMLElement} cardElement
   * @returns {Promise<CardRevealResult>}
   */
  async revealCard(cardNumber, cardElement) {
    try {
      console.log(`🎴 Revelando carta ${cardNumber}...`);

      // 1. Carrega configuração
      const config = await this.loader.loadConfig(cardNumber);

      if (!config) {
        console.error(`❌ Carta ${cardNumber} não encontrada no sistema`);
        console.warn(`💡 Use o Menu de Configurações > Cartas > "➕ Novo Card" para criar cartas`);
        notificationManager.error(
          languageManager.translate("card_manager.err_not_configured").replace("{number}", cardNumber),
        );
        return { success: false, cardNumber };
      }

      // 2. Resolve assets
      const assets = await this.loader.resolveAssets(cardNumber, config);

      // 3. Toca áudio de revelação (se houver)
      if (assets.audioRevealPath) {
        audioManager.playSFX(assets.audioRevealPath, false);
      } else {
        // Áudio padrão de revelar
        audioManager.playSFX("virar_carta.mp3", true);
      }

      // 4. Toca vídeo de revelação (se houver) — falha silenciosa para não travar o fluxo
      if (assets.videoRevealPath) {
        try {
          await audioManager.playVideo(assets.videoRevealPath, false);
        } catch (videoError) {
          console.warn(`⚠️ Vídeo de revelação não pôde ser reproduzido (carta ${cardNumber}): ${videoError.message}`);
        }
      }

      // 5. Abre imagem PNG de revelação (se houver)
      if (assets.imageRevealPath) {
        try {
          console.log(`🖼️ Abrindo imagem PNG de revelação: ${assets.imageRevealPath}`);
          await audioManager.openImage(assets.imageRevealPath);
        } catch (imageError) {
          console.warn(`⚠️ Imagem PNG de revelação não pôde ser aberta (carta ${cardNumber}): ${imageError.message}`);
        }
      }

      // 6. Atualiza src da imagem com o path resolvido pelo card-loader
      const frontImg = cardElement.querySelector(".card-front-img");
      if (frontImg) {
        frontImg.src = assets.imagePath;
      }

      // 7. Animação de revelação (NÃO aguarda — roda em background)
      if (animationSystem && animationSystem.animateCardReveal) {
        animationSystem.animateCardReveal(cardElement, assets.imagePath).catch(err => 
          console.warn(`⚠️ Erro na animação de revelação: ${err}`)
        );
      }

      // 8. Marca como virada
      cardElement.classList.add("flipped");
      this.flippedCards.add(assets.imagePath);
      if (deckManager.initialized) deckManager.recordFlip(cardNumber, assets.imagePath);

      // 9. Atualiza estatísticas
      this.stats.cardsRevealed++;

      console.log(`✅ Carta ${cardNumber} revelada`);

      return {
        success: true,
        cardNumber,
        config,
        imagePath: assets.imagePath,
      };
    } catch (error) {
      console.error(`❌ Erro ao revelar carta ${cardNumber}:`, error);
      return { success: false, cardNumber };
    }
  }

  /**
   * Revela e usa carta (double-click)
   * ⚡ OTIMIZADO: Abre modal IMEDIATAMENTE, revela em background
   * @param {number} cardNumber
   * @param {HTMLElement} cardElement
   * @returns {Promise<void>}
   */
  async revealAndUseCard(cardNumber, cardElement) {
    // Se já está virada, apenas usa
    if (cardElement.classList.contains("flipped")) {
      await this.useCard(cardNumber);
      return;
    }

    // Carrega config e assets (rápido)
    const config = await this.loader.loadConfig(cardNumber);
    
    if (!config) {
      console.error(`❌ Carta ${cardNumber} não encontrada no sistema`);
      notificationManager.error(
        languageManager.translate("card_manager.err_not_configured").replace("{number}", cardNumber),
      );
      return;
    }

    const assets = await this.loader.resolveAssets(cardNumber, config);
    
    // 🚀 ABRE MODAL IMEDIATAMENTE
    console.log(`⚡ Abrindo modal instantaneamente para carta ${cardNumber}...`);
    await this.useCard(cardNumber);
    
    // 🎬 REVELA EM BACKGROUND (sem bloquear)
    console.log(`🎴 Revelando carta ${cardNumber} em background...`);
    this.revealCard(cardNumber, cardElement).catch(err => 
      console.warn(`⚠️ Erro ao revelar em background: ${err}`)
    );
  }

  // ============================================
  // REVELAR TODAS SEM EFEITOS (ATALHO Y)
  // ============================================

  /**
   * Revela todas as cartas não viradas silenciosamente.
   * Apenas resolve o asset e seta o src — sem áudio, animação ou modal.
   * Usado pelo atalho Y para inspecionar rapidamente o tabuleiro.
   * @returns {Promise<void>}
   */
  async revealAllSilent() {
    const cards = Array.from(this.cardsGrid?.querySelectorAll(".card:not(.flipped)") ?? []);

    if (cards.length === 0) return;

    console.log(`👁️ Revelando ${cards.length} carta(s) silenciosamente...`);

    await Promise.all(
      cards.map(async (cardElement) => {
        const cardNumber = parseInt(cardElement.dataset.cardNumber);
        if (!cardNumber) return;

        try {
          const config = await this.loader.loadConfig(cardNumber);
          if (!config) return;

          const assets = await this.loader.resolveAssets(cardNumber, config);

          const frontImg = cardElement.querySelector(".card-front-img");
          if (frontImg) frontImg.src = assets.imagePath;

          cardElement.classList.add("flipped");
          this.flippedCards.add(assets.imagePath);
          if (deckManager.initialized) deckManager.recordFlip(cardNumber, assets.imagePath);
        } catch (err) {
          console.warn(`⚠️ revealAllSilent: erro na carta ${cardNumber}`, err);
        }
      }),
    );

    console.log("✅ Todas as cartas reveladas silenciosamente");
  }

  // ============================================
  // USAR CARTA
  // ============================================

  /**
   * Usa uma carta (abre modal universal)
   * @param {number} cardNumber
   * @returns {Promise<CardUseResult>}
   */
  async useCard(cardNumber) {
    try {
      console.log(`🃏 Usando carta ${cardNumber}...`);

      // 1. Carrega configuração
      const config = await this.loader.loadConfig(cardNumber);

      if (!config) {
        console.error(`❌ Carta ${cardNumber} não encontrada no sistema`);
        console.warn(`💡 Use o Menu de Configurações > Cartas > "➕ Novo Card" para criar cartas`);
        notificationManager.error(
          languageManager.translate("card_manager.err_not_configured").replace("{number}", cardNumber),
        );
        return { success: false, action: "error" };
      }

      // 2. Verifica cooldown
      const cooldownCheck = this.cooldowns.canUseCard(cardNumber, config);

      if (!cooldownCheck.canUse) {
        console.warn(`⏳ Carta bloqueada: ${cooldownCheck.message}`);

        if (notificationManager) {
          notificationManager.show({
            type: "main",
            text: cooldownCheck.message,
            duration: 3000,
          });
        }

        return { success: false, action: "blocked", reason: cooldownCheck.reason };
      }

      // 3. Resolve assets
      const assets = await this.loader.resolveAssets(cardNumber, config);

      // 4. Abre modal universal
      const modalResult = await this._openCardModal(cardNumber, assets.imagePath, config);

      // 5. Processa resultado
      if (modalResult.action === "used") {
        this.stats.cardsUsed++;

        // Registra cooldown
        this.cooldowns.registerCardUse(cardNumber, config, modalResult.playerId || "unknown", modalResult.targetId);

        // Toca vídeo de uso (se houver)
        if (assets.videoUsePath) {
          try {
            await audioManager.playVideo(assets.videoUsePath, false);
          } catch (videoError) {
            console.warn(`⚠️ Vídeo de uso não pôde ser reproduzido (carta ${cardNumber}): ${videoError.message}`);
          }
        }

        // Abre imagem PNG de uso (se houver)
        if (assets.imageUsePath) {
          try {
            console.log(`🖼️ Abrindo imagem PNG de uso: ${assets.imageUsePath}`);
            await audioManager.openImage(assets.imageUsePath);
          } catch (imageError) {
            console.warn(`⚠️ Imagem PNG de uso não pôde ser aberta (carta ${cardNumber}): ${imageError.message}`);
          }
        }
      } else if (modalResult.action === "held") {
        this.stats.cardsHeld++;

        // Cooldown será gerenciado pelo card-held se for ultimate
      } else {
        this.stats.cardsCancelled++;
      }

      console.log(`✅ Carta ${cardNumber} processada: ${modalResult.action}`);

      return modalResult;
    } catch (error) {
      console.error(`❌ Erro ao usar carta ${cardNumber}:`, error);
      return { success: false, action: "error" };
    }
  }

  /**
   * Abre modal universal de carta
   * @private
   * @param {number} cardNumber
   * @param {string} imagePath
   * @param {Object} config
   * @returns {Promise<CardUseResult>}
   */
  async _openCardModal(cardNumber, imagePath, config) {
    return new Promise((resolve) => {
      // Define autoCloseDelay: prefer config.autoCloseDelay, then config.autoClose, fallback 3000ms
      const autoCloseDelay = Number(config?.autoCloseDelay ?? config?.autoClose ?? 3000);

      universalCardModal.open({
        cardImage: imagePath,
        config: config,
        autoCloseDelay, // garante que o UCM receba o delay (0 = desabilitado)

        // Callback: Usar carta
        onUse: async (finalConfig) => {
          const result = await this._executeCardEffect(cardNumber, finalConfig);

          resolve({
            success: true,
            action: "used",
            playerId: finalConfig.selectedTarget || result.targetId,
            targetId: finalConfig.selectedTarget,
            combatResult: result,
          });
        },

        // Callback: Segurar carta
        onHold: async (finalConfig) => {
          const targetId = finalConfig.selectedTarget;

          if (targetId) {
            const held = await this.held.addCard(targetId, imagePath, finalConfig);

            resolve({
              success: held,
              action: "held",
              playerId: targetId,
            });
          } else {
            resolve({
              success: false,
              action: "cancelled",
            });
          }
        },

        // Callback: Cancelar
        onCancel: () => {
          resolve({
            success: false,
            action: "cancelled",
          });
        },
      });
    });
  }

  /**
   * Executa efeito da carta
   * 🔴 CORRIGIDO: Resolver elemento ANTES de passar para cardCombat
   * @private
   * @param {number} cardNumber
   * @param {Object} config
   * @returns {Promise<Object>}
   */
  async _executeCardEffect(cardNumber, config) {
    console.log(`⚡ Executando efeito: ${config.tipo}`);

    const targetId = config.selectedTarget;
    const sourceId = targetId === "player1" ? "player2" : "player1";

    // Carta de spValor puro: sem valor de HP, apenas modifica supportHP
    if (!config.valor && config.spValor) {
      console.log(`🛡️ Carta de SupportHP puro detectada`);
      sessionState.modifySupportHP(targetId, config.spValor);
      playerUI.showSupportHPEffect(targetId, config.spValor);
      console.log(`🛡️ SupportHP ${targetId}: ${config.spValor > 0 ? "+" : ""}${config.spValor}`);
      return { success: true, targetId };
    }

    // Delega para o sistema de combate baseado no tipo
    switch (config.tipo) {
      case "dano": {
        // 🔴 CORRIGIDO: Resolver o elemento CORRETAMENTE
        let resolvedElement = config.element ?? null;

        // 1. Se a carta tem elemento explícito, usar ele
        if (!resolvedElement && config.elementStatusId) {
          const elemDef = configManager.getStatusById(config.elementStatusId);
          resolvedElement = elemDef?.effects?.[0]?.element ?? null;
        }

        // 2. 🔴 NOVO: Se ainda não tem elemento, consultar modificadores do atacante (classe)
        if (!resolvedElement) {
          const atkMods = playerStatus?.getModifiers?.(sourceId) || {};
          resolvedElement = atkMods.overrideElement ?? null;

          console.log(`📊 Elemento do atacante (${sourceId}): ${resolvedElement || 'nenhum'}`);
        }

        const resolvedElementDamage = config.elementPercent ?? config.elementDamage ?? 100;

        console.log(`🎯 Resolvido - Elemento: ${resolvedElement || 'normal'}, Dano: ${resolvedElementDamage}%`);

        return await this.combat.processDamage({
          type: "damage",
          sourceId: sourceId,
          targetId: targetId,
          config: config,
          baseValue: config.valor,
          element: resolvedElement,
          elementDamage: resolvedElementDamage,
        });
      }

      case "cura":
        return await this.combat.processHeal({
          type: "heal",
          sourceId: sourceId,
          targetId: targetId,
          config: config,
          baseValue: config.valor,
        });

      case "qte": {
        const selectedChar = config.personagem_selecionado;

        if (!selectedChar || !selectedChar.qteConfig) {
          console.warn("⚠️ QTE: nenhum personagem selecionado ou sem qteConfig");
          notificationManager.show({
            type: "main",
            text: languageManager.translate("card_manager.select_character_qte"),
            duration: 3000,
          });
          return { success: false };
        }

        const charQte = selectedChar.qteConfig;
        const qteConfig = {
          tipo: config.tipo, // "qte" — tipo da carta
          type: charQte.type || (charQte.tipo === "qte_buff" ? "buff" : "tank"), // normalizado para player-qte determinar slot BUFF/TANK
          valor: Number(charQte.valor) || 0,
          cooldown: Number(charQte.cooldown) || 3,
          efeito: charQte.efeito || "adicionar",
          support_icon: selectedChar.faceImage || null, // faceImage é o ícone QTE; imagem é fallback
          characterId: selectedChar.id, // necessário para assetResolver.characterAudio()
        };

        const assets = await this.loader.resolveAssets(cardNumber, config);
        await playerManager.applyQTEToPlayer(targetId, qteConfig, assets.imagePath);

        console.log(
          `⚡ QTE aplicado: ${config.tipo} → ${targetId} | personagem: ${selectedChar.name} | valor: ${qteConfig.valor}`,
        );
        return { success: true, targetId };
      }

      case "interativa":
        await this._executeInteractiveCard(config);
        return { success: true, targetId };

      default:
        console.warn(`⚠️ Tipo de carta não implementado: ${config.tipo}`);
        return { success: false };
    }
  }

  /**
   * Executa carta interativa
   * @private
   * @param {Object} config
   */
  async _executeInteractiveCard(config) {
    const interactiveCard = window.interactiveCard;

    if (!interactiveCard) {
      console.error("❌ Sistema de cartas interativas não disponível");
      return;
    }

    const selectedOption = config.selectedOption;
    const selectedIndex = config.selectedOptionIndex;
    const targetId = config.selectedTarget;

    if (!selectedOption || targetId === undefined) {
      console.error("❌ Dados incompletos para carta interativa");
      return;
    }

    const textoOpcao = typeof selectedOption === "object" ? selectedOption.texto : selectedOption;

    console.log(`💬 Executando opção: "${textoOpcao}" para ${targetId}`);

    // Executa via executeOption (comandos + hooks + histórico)
    const context = interactiveCard.createContext(targetId, selectedIndex, textoOpcao);
    await interactiveCard.executeOption(selectedOption, context);

    // Feedback visual
    if (animationSystem) {
      animationSystem.showEnhancedBuff(targetId, "ESCOLHIDO", "special");
    }
  }

  // ============================================
  // MODAL DE CARTAS SEGURADAS
  // ============================================

  /**
   * Mostra modal de seleção de cartas viradas
   * @private
   * @param {string} playerId
   * @param {number} slot
   */
  async _showHeldCardModal(playerId, _slot) {
    const modal = document.getElementById("heldCardModal");
    const lista = document.getElementById("heldCardList");

    // Modal agora é position:fixed — não precisa ser filho de .cards-area
    if (modal && modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }

    if (!modal || !lista) {
      console.error("❌ Modal de cartas seguradas não encontrado");
      return;
    }

    // Obtém cartas viradas
    const flippedUrls = Array.from(this.flippedCards);

    if (flippedUrls.length === 0) {
      lista.innerHTML = `<p style="color:white">${languageManager.translate("card_manager.no_flipped_cards")}</p>`;
      modal.style.display = "flex";
      return;
    }

    // Limpa lista
    lista.innerHTML = "";

    // Handler extraído do loop — evita captura ambígua de variável (lint)
    const handleCardSelect = async (url) => {
      const cardNumber = this.loader.extractCardNumber(url);

      if (!cardNumber) {
        console.error("❌ Não foi possível extrair número da carta");
        return;
      }

      const config = await this.loader.loadConfig(cardNumber);

      if (!config) {
        console.error("❌ Configuração não encontrada");
        return;
      }

      await this.held.addCard(playerId, url, config);
      modal.style.display = "none";
    };

    /**
     * Cria um canvas com o primeiro frame do GIF (estático).
     * Se a imagem já estiver em cache do browser o drawImage é síncrono.
     * Fallback: carrega via Image() e desenha no onload.
     */
    const createStaticCard = (url) => {
      const CARD_W = 237;
      const CARD_H = 350;

      const canvas = document.createElement("canvas");
      canvas.width = CARD_W;
      canvas.height = CARD_H;
      canvas.className = "held-card-option";
      canvas.addEventListener("click", () => handleCardSelect(url));

      const ctx = canvas.getContext("2d");

      const draw = (imgEl) => {
        ctx.drawImage(imgEl, 0, 0, CARD_W, CARD_H);
      };

      // Tenta usar imagem já em cache (naturalWidth > 0 = carregada)
      const probe = new Image();
      probe.src = url;

      if (probe.complete && probe.naturalWidth > 0) {
        draw(probe);
      } else {
        // Ainda não está em cache — aguarda load e desenha
        probe.onload = () => draw(probe);
        // Mantém canvas cinza transparente até carregar (quase nunca ocorre
        // pois as cartas são pré-carregadas no _preloadActiveCards)
      }

      return canvas;
    };

    // Cria elementos de seleção como canvas estático
    for (const url of flippedUrls) {
      lista.appendChild(createStaticCard(url));
    }

    // Mostra modal
    modal.style.display = "flex";
  }

  /**
   * Usa carta de um slot
   * @private
   * @param {string} playerId
   * @param {number} slot
   * @param {Object} heldCard
   */
  async _useHeldCard(playerId, slot, heldCard) {
    console.log(`[CardManager] _useHeldCard triggered for ${playerId}, slot: ${slot}`, heldCard);

    const url = heldCard.url;
    const cardNumber = this.loader.extractCardNumber(url);

    if (!cardNumber) {
      console.error("❌ [CardManager] Não foi possível extrair número da carta segurada", heldCard);
      return;
    }

    // Carrega e valida configuração completa
    const baseConfig = await this.loader.loadConfig(cardNumber);
    if (!baseConfig) {
      console.error(`❌ [CardManager] Configuração não encontrada para carta segurada ${cardNumber}`);
      return;
    }

    // Resolve assets para obter caminhos reais
    const assets = await this.loader.resolveAssets(cardNumber, baseConfig);

    // Para cartas seguradas, sempre permitir uso direto (não ir para slot novamente)
    const config = {
      ...baseConfig,
      slotOnly: false,
      holdable: false,
    };

    console.log(`🃏 [CardManager] Abrindo modal para carta ${cardNumber}...`);

    // Define autoCloseDelay para o modal de carta segurada (mesma prioridade: config.autoCloseDelay -> config.autoClose -> fallback 3000ms)
    const autoCloseDelay = Number(config?.autoCloseDelay ?? config?.autoClose ?? 3000);

    // Abre modal universal
    universalCardModal.open({
      cardImage: assets.imagePath,
      config: config,
      autoCloseDelay, // garante que o UCM receba o delay (0 = desabilitado)

      onUse: async (finalConfig) => {
        // Executa efeito
        await this._executeCardEffect(cardNumber, finalConfig);

        // Debug: log videoUsePath
        console.log(`🔎 Vídeo de uso path para carta ${config._cardNumber}:`, assets.videoUsePath);

        // Toca vídeo de uso (se houver)
        if (assets.videoUsePath) {
          try {
            console.log(`🎬 Tentando reproduzir vídeo de uso: ${assets.videoUsePath}`);
            await audioManager.playVideo(assets.videoUsePath, false);
          } catch (videoError) {
            console.warn(
              `⚠️ Vídeo de uso não pôde ser reproduzido (carta ${config._cardNumber}): ${videoError.message}`,
            );
          }
        } else {
          console.log(`🎥 Nenhum vídeo de uso configurado para carta ${config._cardNumber}`);
        }

        // Abre imagem PNG de uso (se houver)
        if (assets.imageUsePath) {
          try {
            console.log(`🖼️ Abrindo imagem PNG de uso: ${assets.imageUsePath}`);
            await audioManager.openImage(assets.imageUsePath);
          } catch (imageError) {
            console.warn(
              `⚠️ Imagem PNG de uso não pôde ser aberta (carta ${config._cardNumber}): ${imageError.message}`,
            );
          }
        } else {
          console.log(`🖼️ Nenhuma imagem PNG de uso configurada para carta ${config._cardNumber}`);
        }

        // Consome uso (se aplicável)
        const stillExists = this.held.consumeUse(playerId, slot);

        if (!stillExists) {
          console.log(`🗑️ Carta consumida completamente do slot ${slot}`);
        }
      },

      onCancel: () => {
        console.log("❌ Uso de carta segurada cancelado");
      },
    });
  }

  // ============================================
  // FILA DE CARTAS (UCM QUEUE)
  // ============================================

  /**
   * Inicia fila de cartas com auto-progressão
   * Ao fim, UCM fecha automaticamente junto com a interface de cartas abertas
   * @param {Array<Object>} cards - Array de {cardImage, config}
   * @returns {Promise<void>}
   */
  async startCardQueue(cards = []) {
    if (!Array.isArray(cards) || cards.length === 0) {
      console.warn("⚠️ Fila vazia — nada a processar");
      return;
    }

    console.log(`📋 Iniciando fila de ${cards.length} carta(s)...`);

    this.isQueueActive = true;

    // Configura callbacks para a fila
    const queueCallbacks = {
      onUse: async (config) => {
        console.log(`✅ Carta da fila usada`);
        await this._executeCardEffect(config.cardNumber, config);
      },
      onHold: async (config) => {
        console.log(`📥 Carta da fila guardada`);
        const targetId = config.selectedTarget;
        await this.held.addCard(targetId, config.cardImage, config);
      },
      onCancel: async () => {
        console.log(`❌ Carta da fila cancelada`);
      },
    };

    // Inicializa a fila
    this.cardQueue.init(cards, queueCallbacks);

    // Inicia reprodução automática
    await this.cardQueue.start();
  }

  /**
   * Pausa fila de cartas
   */
  pauseCardQueue() {
    if (this.isQueueActive) {
      console.log("⏸️ Fila de cartas pausada");
      this.isQueueActive = false;
    }
  }

  /**
   * Retoma fila de cartas
   */
  resumeCardQueue() {
    if (!this.isQueueActive && this.cardQueue.cardQueue.length > 0) {
      console.log("▶️ Fila de cartas retomada");
      this.isQueueActive = true;
    }
  }

  /**
   * Cancela fila completa
   */
  cancelCardQueue() {
    console.log("❌ Fila de cartas cancelada");
    this.cardQueue.reset();
    this.isQueueActive = false;
    universalCardModal.close();
  }

  /**
   * Obtém status atual da fila
   */
  getQueueStatus() {
    return {
      ...this.cardQueue.getStatus(),
      isActive: this.isQueueActive,
    };
  }

  // ============================================
  // UTILIDADES E GETTERS
  // ============================================

  /**
   * Obtém todas as cartas viradas
   * @returns {Array<string>}
   */
  getFlippedCards() {
    return Array.from(this.flippedCards);
  }

  /**
   * Verifica se carta está virada
   * @param {string} cardUrl
   * @returns {boolean}
   */
  isCardFlipped(cardUrl) {
    return this.flippedCards.has(cardUrl);
  }

  /**
   * Obtém estatísticas
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      loader: this.loader.getStats(),
      cooldowns: this.cooldowns.getStats(),
      flippedCards: this.flippedCards.size,
      queueActive: this.isQueueActive,
    };
  }

  // ============================================
  // EMBARALHAR E RESET
  // ============================================

  /**
   * Embaralha cartas (cria novo grid)
   * @returns {boolean}
   */
  shuffleCards() {
    console.log("🔀 Embaralhando cartas...");

    // Obtém cartas do deck ativo (com fallback para sistema legado)
    let activeCards;
    if (deckManager.initialized) {
      const deckCardIds = deckManager.getCurrentDeckCardIds();
      activeCards = deckCardIds.map((id) => this.loader.extractCardNumber(id)).filter((n) => n !== null);
    } else {
      activeCards = this.loader.getActiveCardNumbers();
    }

    const cartasVisiveis = configManager.get("general.cartasVisiveis");

    if (activeCards.length === 0) {
      console.error("❌ Nenhuma carta ativa!");

      if (notificationManager) {
        notificationManager.show({
          type: "main",
          text: languageManager.translate("card_manager.no_active_cards"),
          duration: 5000,
        });
      }

      return false;
    }

    // Embaralha
    const shuffled = [...activeCards].sort(() => Math.random() - 0.5);
    const toDisplay = shuffled.slice(0, cartasVisiveis);

    // Cria grid
    const success = this.createCardsGrid(toDisplay);

    if (success) {
      console.log(`✅ ${toDisplay.length} cartas embaralhadas`);
    }

    return success;
  }

  /**
   * Reset completo do sistema
   */
  reset() {
    console.log("🔄 Resetando CardManager...");

    // Limpa grid
    if (this.cardsGrid) {
      this.cardsGrid.innerHTML = "";
    }

    this.flippedCards.clear();

    // Reseta estados de decks (novo jogo)
    if (deckManager.initialized) deckManager.resetAllStates();

    // Reseta módulos
    this.cooldowns.reset();
    this.loader.clearAllCaches();

    // Limpa slots dos jogadores
    ["player1", "player2"].forEach((playerId) => {
      this.held.clearAllSlots(playerId);
    });

    // Cancela fila se estiver ativa
    if (this.isQueueActive) {
      this.cancelCardQueue();
    }

    // Reseta stats
    this.stats = {
      cardsRevealed: 0,
      cardsUsed: 0,
      cardsHeld: 0,
      cardsCancelled: 0,
    };

    console.log("✅ CardManager resetado");
  }

  // ============================================
  // DEBUG
  // ============================================

  /**
   * Debug completo
   */
  debug() {
    console.log("\n🃏 === CARD MANAGER DEBUG ===");

    console.log("\n📊 Estatísticas Gerais:");
    console.log(this.getStats());

    console.log("\n📦 Loader:");
    this.loader.debug();

    console.log("\n⏳ Cooldowns:");
    this.cooldowns.debugActiveCooldowns();

    console.log("\n🃏 Cartas Seguradas:");
    this.held.debugAll();

    console.log("\n🎴 Cartas Viradas:");
    console.log(`  Total: ${this.flippedCards.size}`);

    console.log("\n📋 Fila de Cartas:");
    console.log(this.getQueueStatus());

    console.log("================================\n");
  }
}

// Singleton
export const cardManager = new CardManager();

// Expõe globalmente para debug
window.cardManager = cardManager;

console.log("✅ CardManager carregado");
console.log("💡 Use window.cardManager.debug() para ver estado completo");
console.log("💡 Use window.cardManager.shuffleCards() para embaralhar");
console.log("💡 Use window.cardManager.startCardQueue(cards) para iniciar fila de cartas");
