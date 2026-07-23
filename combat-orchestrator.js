import { languageManager } from "@core/language-manager.js";
import { sessionState } from "@core/session-state.js";
import { playerStatus } from "@systems/player/player-status.js";
import { playerQTE } from "@systems/player/player-qte.js";
import { configManager } from "@core/config-manager.js";
import { cardHeld } from "@systems/cards/card-held.js";
import { playerManager } from "@systems/player/player-manager.js";
import { playerBuffs } from "@systems/player/player-buffs.js";
import { interactiveCard } from "@systems/cards/interativa/interactive-card-core.js";

/**
 * combat-orchestrator.js - Sistema de Orquestração de Combate via Chat
 *
 * Responsabilidades:
 * - Gerenciar a máquina de estados do combate via chat
 * - Executar o pipeline de dano em fases
 * - Sincronizar decisões interativas dos jogadores
 *
 * Observação: este arquivo foi adaptado para logar aplicações/remoções do status "dbuff"
 * para facilitar debugging (logs com prefixo [CombatOrchestrator][dbuff]).
 *
 * @module CombatOrchestrator
 */
class CombatOrchestrator {
  constructor() {
    this.state = this._getInitialState();

    // Listener global para remoção de status — útil para debugar expiração/removal do dbuff.
    // Requer que o módulo player-status dispare:
    // document.dispatchEvent(new CustomEvent("playerStatus:removed", { detail: { playerId, statusId, status } }));
    try {
      document.addEventListener("playerStatus:removed", (ev) => {
        try {
          const { playerId, statusId, status } = ev.detail || {};
          if (this._isDbuffStatus(statusId) || this._isDbuffStatus(status)) {
            console.log(`[CombatOrchestrator][dbuff] REMOVIDO status '${statusId || status?.statusId || status?.id || status?.name}' de ${playerId}`, status || {});
          }
        } catch (inner) {
          console.warn("[CombatOrchestrator] playerStatus:removed handler error:", inner);
        }
      });
    } catch (e) {
      // Ambiente sem DOM/document — ignore
    }
  }

  /**
   * Retorna o estado inicial do combate.
   * @returns {Object} O estado inicial.
   * @private
   */
  _getInitialState() {
    return {
      active: false,
      phase: "IDLE",
      attackerId: null,
      defenderId: null,
      attackerUsername: null,
      defenderUsername: null,
      card: null,
      slot: null,
      currentDamage: 0,
      resolve: null,
      timeoutId: null,
    };
  }

  /**
   * Helper: detecta se um status (objeto) ou statusId string corresponde ao "dbuff".
   * Regras:
   *  - statusId que começa com "status-db" (case-insensitive) ou cujo name é "dbuff"
   *  - ou status.effects contém override/resize para as chaves de resistência alvo
   *
   * @param {string|Object} statusOrId
   * @returns {boolean}
   */
  _isDbuffStatus(statusOrId) {
    try {
      if (!statusOrId) return false;
      if (typeof statusOrId === "string") {
        const s = statusOrId.toLowerCase();
        if (s.startsWith("status-db") || s === "dbuff") return true;
        return false;
      }
      // objeto
      const id = (statusOrId.statusId || statusOrId.id || "").toString().toLowerCase();
      if (id.startsWith("status-db") || id === "dbuff") return true;
      const name = (statusOrId.name || statusOrId.nome || "").toString().toLowerCase();
      if (name === "dbuff") return true;

      // verificar efeitos: override de resistances para as chaves alvo
      const effects = statusOrId.effects || statusOrId;
      if (effects && typeof effects === "object") {
        const resist = (effects.resistances || effects.override_resistances || effects.override || effects);
        if (resist && typeof resist === "object") {
          const keys = Object.keys(resist).map((k) => String(k).toLowerCase());
          const targets = ["impacto", "corte", "perfurante", "perfume"];
          const hasAll = targets.every((t) => keys.includes(t));
          if (hasAll) return true;
        }
      }
      return false;
    } catch (e) {
      console.error("[CombatOrchestrator] _isDbuffStatus error:", e);
      return false;
    }
  }

  /**
   * Reseta o estado do orquestrador, limpando timeouts ativos.
   */
  reset() {
    if (this.state.timeoutId) clearTimeout(this.state.timeoutId);
    this.state = this._getInitialState();
  }

  /**
   * Aguarda decisão do jogador via chat com timeout.
   * @param {number} ms
   * @returns {Promise<boolean|string|number>}
   * @private
   */
  _waitForDecision(ms = 60000) {
    return new Promise((resolve) => {
      this.state.timeoutId = setTimeout(() => {
        this.state.timeoutId = null;
        document.dispatchEvent(new CustomEvent("close-universal-card-modal"));

        const username = this.state.attackerUsername || this.state.defenderUsername;
        const message = languageManager.translate("live.combat_timeout", { username, action: this.state.phase });
        document.dispatchEvent(new CustomEvent("live:response", { detail: { message } }));

        resolve(false);
      }, ms);
      this.state.resolve = resolve;
    });
  }

  /**
   * Resolve decisão interativa (buff, block, qte ou opção) de um jogador.
   * ✅ REMOVIDA A VALIDAÇÃO DE PLAYERID - qualquer jogador pode executar
   * ✅ CORRIGIDO: Processa corretamente "sim"/"nao" para bloqueio
   * ✅ RETORNA TRUE quando bem-sucedido
   * 
   * @param {string} playerId - ID do jogador (player1/player2)
   * @param {string|number} answer - "sim", "nao", ou valor de QTE/Opção
   * @returns {boolean}
   */
  resolveDecision(playerId, answer) {
    console.log(`[resolveDecision] ENTRADA: playerId=${playerId}, answer=${answer}, active=${this.state.active}, phase=${this.state.phase}`);

    if (!this.state.active) {
      console.warn(`⚠️ resolveDecision: combate não está ativo`);
      console.warn(`[DEBUG] state.active=${this.state.active}`);
      return false;
    }

    const isBuff = this.state.phase === "AWAITING_BUFF";
    const isBlock = this.state.phase === "AWAITING_BLOCK";
    const isQTE = this.state.phase === "AWAITING_QTE";
    const isOption = this.state.phase === "AWAITING_OPTION";

    console.log(`[resolveDecision] Fases: isBuff=${isBuff}, isBlock=${isBlock}, isQTE=${isQTE}, isOption=${isOption}`);

    if (!isBuff && !isBlock && !isQTE && !isOption) {
      console.warn(`⚠️ resolveDecision: fase inválida ${this.state.phase}`);
      return false;
    }

    console.log(`✅ Resolução aceita do jogador: ${playerId} na fase ${this.state.phase}, answer: ${answer}`);

    // ✅ Resolveu com sucesso (sem validação de playerId)
    if (this.state.timeoutId) clearTimeout(this.state.timeoutId);
    this.state.timeoutId = null;

    if (this.state.resolve) {
      console.log(`[resolveDecision] state.resolve existe, processando...`);
      
      // ✅ CORRIGIDO: Processa corretamente para cada fase
      let decision;
      
      if (isBuff || isBlock) {
        // Para buff/bloqueio: "sim" = true, "nao"/"não" = false
        // Se for número, passa o número (slot específico)
        const lower = String(answer).toLowerCase();
        if (lower === "sim") {
          decision = true;
        } else if (lower === "nao" || lower === "não") {
          decision = false;
        } else {
          // Tenta converter para número de slot
          const num = parseInt(answer, 10);
          decision = isNaN(num) ? false : num;
        }
      } else {
        // Para QTE e opções: passa o valor diretamente
        decision = answer;
      }
      
      console.log(`✅ Decisão resolvida: ${decision} (tipo: ${typeof decision})`);
      this.state.resolve(decision);
      this.state.resolve = null;
      
      this.state.phase = "RESOLVING";
      console.log(`[resolveDecision] SUCESSO: retornando true`);
      return true; // ✅ IMPORTANTE: Retorna true aqui!
    } else {
      console.warn(`⚠️ resolveDecision: state.resolve é null/undefined`);
      console.warn(`[DEBUG] state.resolve=${this.state.resolve}`);
      return false;
    }
  }

  /**
   * Processa ação vinda do chat para resolver decisões pendentes.
   * @param {boolean} decision
   */
  processChatAction(decision) {
    if (this.state.resolve) {
      if (this.state.timeoutId) clearTimeout(this.state.timeoutId);
      this.state.timeoutId = null;
      this.state.resolve(decision);
      this.state.resolve = null;
    }
  }

  /**
   * Recupera o valor de resistência (%) para um elemento, a partir de defMods.
   * - Suporta defMods.resistances ou um objeto de resistências direto.
   * - Busca case-insensitive nas chaves.
   * - Mapeia elementos genéricos (ex.: 'dano') para elementos concretos (ex.: 'Impacto').
   *
   * @param {Object} defMods
   * @param {string} element
   * @returns {number} resistência em porcentagem (0-100)
   */
  getResistanceForElement(defMods = {}, element) {
    try {
      if (!element) return 0;

      // defMods pode ser { resistances: { Corte: 50, ... }, ... } ou apenas { Corte: 50, ... }
      const resistances = (defMods && typeof defMods === "object")
        ? (defMods.resistances ?? defMods)
        : {};

      const elementLower = String(element).toLowerCase();

      // 1) match case-insensitive nas chaves de resistances
      for (const [key, value] of Object.entries(resistances)) {
        if (String(key).toLowerCase() === elementLower) {
          const numeric = Number(value);
          return Number.isNaN(numeric) ? 0 : numeric;
        }
      }

      // 2) fallback: mapear elementos genéricos para elementos concretos
      const GENERIC_ELEMENT_MAP = {
        'dano': 'Impacto',
        'fisico': 'Impacto',
        'físico': 'Impacto',
        'physical': 'Impacto'
      };

      if (GENERIC_ELEMENT_MAP.hasOwnProperty(elementLower)) {
        const mapped = GENERIC_ELEMENT_MAP[elementLower].toLowerCase();
        for (const [key, value] of Object.entries(resistances)) {
          if (String(key).toLowerCase() === mapped) {
            const numeric = Number(value);
            return Number.isNaN(numeric) ? 0 : numeric;
          }
        }
      }

      // 3) nada encontrado
      return 0;
    } catch (e) {
      console.error("[CombatOrchestrator] getResistanceForElement error:", e);
      return 0;
    }
  }

  /**
   * Processa o uso de um slot no contexto do orquestrador.
   *
   * @param {string} playerId
   * @param {number} slotNum
   * @param {Object} card
   * @param {Object} metadata
   * @returns {Promise<boolean>}
   */
  async handleSlotUse(playerId, slotNum, card, metadata, target) {
    const username = metadata?.username || metadata?.displayName || playerId;

    if (this.state.active) {
      console.log(`[CombatOrchestrator] Rejected slot use for ${playerId}: Combat already active.`);
      const message = languageManager.translate("live.combat_active_wait", { username });
      document.dispatchEvent(
        new CustomEvent("live:response", {
          detail: { message },
        }),
      );
      return false;
    }

    // Validação: se a carta exige target, garanta que foi fornecido
    const needsTarget =
      card?.config?.needsTarget ??
      card?.config?.needs_target ??
      card?.config?.targetRequired ??
      card?.needsTarget ??
      false;

    if (needsTarget && !target) {
      console.warn(`[CombatOrchestrator] Uso bloqueado: carta requer alvo mas target está ausente`, {
        playerId,
        slotNum,
        cardId: card?.id ?? card?.config?.id,
      });
      const message = languageManager.translate("live.combat_target_required", {
        username,
        cardName: card?.config?.nome || "Carta",
      });
      document.dispatchEvent(new CustomEvent("live:response", { detail: { message } }));
      return false;
    }

    console.log(
      `[CombatOrchestrator] Starting slot use for ${playerId}, slot: ${slotNum}, type: ${card.config?.tipo}, target: ${target}`,
    );

    try {
      return await this._handleSlotUseLogic(playerId, slotNum, card, metadata, target);
    } catch (err) {
      console.error(`[CombatOrchestrator] Error:`, err);
      return false;
    } finally {
      this.reset();
    }
  }

  /**
   * Lógica interna de uso de slot.
   * @private
   */
  async _handleSlotUseLogic(playerId, slotNum, card, metadata, target) {
    const username = metadata?.username || metadata?.displayName || playerId;
    const cardType = card.config?.tipo;
    const config = card.config || {};

    if (cardType === "dano") {
      const defenderId = target && target !== playerId ? target : playerId === "player1" ? "player2" : "player1";
      const defenderUsername = playerManager.getPlayerName(defenderId);

      this.state = {
        ...this.state,
        active: true,
        phase: "COMBAT",
        attackerId: playerId,
        defenderId: defenderId,
        attackerUsername: username,
        defenderUsername: defenderUsername,
        card: card,
        slot: slotNum,
        currentDamage: Number(card.config.valor) || 0,
      };

      await this._executeDamagePipeline(playerId, defenderId, card);
      cardHeld.consumeUse(playerId, slotNum);
      return true;
    }

    if (card.config?.tipo === "cura") {
      sessionState.heal(playerId, card.config.valor);

      if (card.config.spValor) {
        sessionState.modifySupportHP(playerId, card.config.spValor);
      }

      // ✅ FIX: Aplica status ANTES de consumir a carta
      if (config.applyStatuses?.length) {
        config.applyStatuses.forEach((status) => {
          const instance = { source: "card", ...status };
          // Log dbuff se detectar
          if (this._isDbuffStatus(instance)) {
            console.log(`[CombatOrchestrator][dbuff] Aplicando status '${instance.statusId || instance.id || instance.name}' em ${playerId}`, instance);
          }
          playerStatus.apply(playerId, instance);
        });
      }

      const message = languageManager.translate("live.combat_heal", {
        username: username,
        valor: card.config.valor,
      });
      document.dispatchEvent(
        new CustomEvent("live:response", {
          detail: { message },
        }),
      );

      cardHeld.consumeUse(playerId, slotNum);
      return true;
    }

    if (card.config?.tipo === "qte") {
      this.state = {
        ...this.state,
        active: true,
        phase: "AWAITING_QTE",
        attackerId: playerId,
        attackerUsername: username,
        card: card,
        slot: slotNum,
      };

      const message = languageManager.translate("live.combat_qte_prompt", {
        username: username,
        cardName: card.config.nome,
      });
      document.dispatchEvent(new CustomEvent("live:response", { detail: { message } }));

      const qteResult = await this._waitForDecision(60000);
      if (qteResult !== false) {
        await playerQTE.applyQTE(playerId, qteResult);
        
        // ✅ FIX: Aplica status após QTE
        if (config.applyStatuses?.length) {
          config.applyStatuses.forEach((status) => {
            const instance = { source: "card", ...status };
            if (this._isDbuffStatus(instance)) {
              console.log(`[CombatOrchestrator][dbuff] Aplicando status '${instance.statusId || instance.id || instance.name}' em ${playerId}`, instance);
            }
            playerStatus.apply(playerId, instance);
          });
        }
        
        cardHeld.consumeUse(playerId, slotNum);
        return true;
      } else {
        const timeoutMessage = languageManager.translate("live.combat_timeout", { username });
        document.dispatchEvent(new CustomEvent("live:response", { detail: { message: timeoutMessage } }));
        return false;
      }
    }

    if (card.config?.tipo === "interativa") {
      const defenderId = playerId === "player1" ? "player2" : "player1";
      const defenderUsername = playerManager.getPlayerName(defenderId);

      this.state = {
        ...this.state,
        active: true,
        phase: "AWAITING_OPTION",
        defenderId: defenderId,
        defenderUsername: defenderUsername,
        attackerUsername: username,
        attackerId: playerId,
        card: card,
        slot: slotNum,
      };

      const options = card.config.opcoes_interativa || card.config.opcoes || [];
      const optionsText = options.map((opt, i) => `${i + 1}. ${opt.texto}`).join("\n");
      const message = languageManager.translate("live.combat_interactive_prompt", {
        username: defenderUsername,
        cardName: card.config.nome,
        options: optionsText,
      });
      document.dispatchEvent(new CustomEvent("live:response", { detail: { message } }));

      // ✅ AGUARDA A DECISÃO DO JOGADOR
      const optionIndex = await this._waitForDecision(60000);
      if (optionIndex !== false) {
        const index = parseInt(optionIndex) - 1;
        if (options[index]) {
          // ✅ EXECUTA A OPÇÃO SELECIONADA COM CONTEXTO CORRETO
          console.log(`✅ Executando opção ${optionIndex}: ${options[index].texto}`);
          
          // 🔧 FIX: Cria contexto com targetPlayerId correto
          const context = interactiveCard.createContext(
            defenderId,           // targetPlayerId
            index,                // selectedIndex
            options[index].texto  // selectedOptionText
          );
          
          await interactiveCard.executeOption(options[index], context);
          
          // ✅ FIX: Aplica status da carta interativa APÓS execução
          if (config.applyStatuses?.length) {
            config.applyStatuses.forEach((status) => {
              const instance = { source: "card", ...status };
              if (this._isDbuffStatus(instance)) {
                console.log(`[CombatOrchestrator][dbuff] Aplicando status '${instance.statusId || instance.id || instance.name}' em ${defenderId}`, instance);
              }
              playerStatus.apply(defenderId, instance);
            });
          }
          
          cardHeld.consumeUse(playerId, slotNum);
          return true;
        } else {
          const invalidMessage = languageManager.translate("live.combat_invalid_command", { username: defenderUsername });
          document.dispatchEvent(new CustomEvent("live:response", { detail: { message: invalidMessage } }));
          return false;
        }
      } else {
        const timeoutMessage = languageManager.translate("live.combat_timeout", { username: defenderUsername });
        document.dispatchEvent(new CustomEvent("live:response", { detail: { message: timeoutMessage } }));
        return false;
      }
    }

    console.warn(`[CombatOrchestrator] Unsupported card type: ${cardType}`);
    document.dispatchEvent(
      new CustomEvent("live:response", {
        detail: { message: `❌ Tipo de carta não suportado: ${cardType}` },
      }),
    );
    return false;
  }

  /**
   * Executa o pipeline de dano em fases, seguindo a lógica de card-combat.js.
   *
   * @param {string} attackerId
   * @param {string} defenderId
   * @param {Object} card
   * @private
   */
  async _executeDamagePipeline(attackerId, defenderId, card) {
    let currentDamage = this.state.currentDamage;
    const config = card.config || {};
    
    // ✅ FIX 1: Extrai elemento da carta (múltiplas variações) + FALLBACK para categoria
    let cardElement = config.element || config.elemento || config.elementType || null;
    
    // ✅ NOVO: Se nenhum elemento, tenta usar a categoria como fallback
    if (!cardElement && config.categoria) {
      cardElement = config.categoria;
      console.debug(`[CombatOrchestrator] Elemento não definido, usando categoria como fallback: ${cardElement}`);
    }

    console.debug(`[CombatOrchestrator] Carta elemento INICIAL: ${cardElement || "NENHUM (padrão)"}`, {
      configElement: config.element,
      configElemento: config.elemento,
      configElementType: config.elementType,
      configCategoria: config.categoria,
    });

    // ✅ CRÍTICO: Calcula AQUI o elemento resolvido (atacante pode override) - ESCOPO GLOBAL
    const atkMods = playerStatus.getModifiers(attackerId) || {};
    let resolvedElement = atkMods.overrideElement ?? cardElement;

    console.debug(`[CombatOrchestrator] Elemento RESOLVIDO (antes de fases): ${resolvedElement || "NENHUM"}`, {
      cardElement,
      atkModsOverrideElement: atkMods.overrideElement,
    });

    // FASE 1: Efeitos Cronometrados
    if (typeof window.getActiveTimedEffects === "function") {
      const activeEffects = window.getActiveTimedEffects();
      activeEffects.forEach((effect) => {
        if (effect.type === "attack_multiplier") {
          currentDamage = Math.round(currentDamage * effect.multiplier);
        } else if (effect.type === "attack_chance_multiplier") {
          if (Math.random() * 100 < effect.chance) {
            currentDamage = Math.round(currentDamage * effect.multiplier);
          }
        }
      });
    }

    // FASE 2: Parry
    const parryChance = configManager.get("general.parryChance") || 0;
    if (Math.random() * 100 < parryChance) {
      const message = languageManager.translate("live.combat_parry", {
        attacker: this.state.attackerUsername,
        defender: this.state.defenderUsername,
      });
      document.dispatchEvent(
        new CustomEvent("live:response", {
          detail: { message },
        }),
      );
      return;
    }

    // FASE 3b: QTE Buff
    currentDamage = await playerQTE.checkAndUse(attackerId, "attack", currentDamage);

    // FASE 3c: Buff Interativo
    const playerAtk = sessionState.getPlayer(attackerId);
    const buffs = playerAtk.heldCards.filter((c) => c.config?.tipo === "buff");

    if (buffs.length > 0) {
      this.state.phase = "AWAITING_BUFF";
      const optionsText = buffs.map((b, i) => `${i + 1}-${b.config.nome}`).join(", ");

      const message = languageManager.translate("live.combat_buff_prompt", {
        attacker: this.state.attackerUsername,
        cardName: "Buffs",
        slot: optionsText,
        description: "Escolha um buff",
      });
      document.dispatchEvent(new CustomEvent("live:response", { detail: { message } }));

      const chosenIndex = await this._waitForDecision(60000);
      const buffCard = buffs[chosenIndex - 1];

      if (buffCard) {
        const modifier = await playerBuffs.applyBuff(attackerId, buffCard);
        if (modifier.type === "adicionar") currentDamage += modifier.value;
        else if (modifier.type === "percentual") currentDamage = Math.round(currentDamage * (1 + modifier.value / 100));
        else if (modifier.type === "multiplicar") currentDamage = Math.round(currentDamage * modifier.value);
      }
      this.state.phase = "COMBAT";
    }

    // FASE 4: Modificadores de Status do Atacante (INCLUINDO CLASSE)
    // ✅ resolvedElement já foi calculado acima - reutiliza o escopo global
    try {
      const dmgBonuses = atkMods.damageBonus ?? atkMods.damageBonuses ?? {};
      const elementBonus =
        (resolvedElement && (dmgBonuses[resolvedElement] ?? (dmgBonuses.element && dmgBonuses.element[resolvedElement]))) || 0;

      const flatFromDamageBonus = dmgBonuses.__flat ?? dmgBonuses.flat ?? dmgBonuses.flatDamage ?? 0;
      const flatFromAtkMods = atkMods.flatDamage ?? atkMods.damageFlat ?? 0;
      const flatBonus = (flatFromDamageBonus || 0) + (flatFromAtkMods || 0);

      const generalPercent =
        dmgBonuses.general ?? atkMods.percentDamage ?? atkMods.damagePercent ?? atkMods.generalDamagePercent ?? 0;

      const multiply =
        atkMods.damageMultiply ?? atkMods.damageMultiplier ?? atkMods.multiplyDamage ?? 1;

      // Aplicar: elemento específico e flats primeiro, depois percentuais e multiplicadores
      if (elementBonus) currentDamage += Number(elementBonus);
      if (flatBonus) currentDamage += Number(flatBonus);

      if (generalPercent) currentDamage = Math.round(currentDamage * (1 + Number(generalPercent) / 100));
      if (multiply !== 1) currentDamage = Math.round(currentDamage * Number(multiply));

      // Debug útil para registrar componentes do cálculo
      console.debug("[CombatOrchestrator] damage calc components (ATACANTE)", {
        attackerId: attackerId,
        baseCardDamage: this.state.currentDamage,
        cardElement,
        resolvedElement,
        elementBonus,
        flatBonus,
        generalPercent,
        multiply,
        currentDamage,
      });
    } catch (err) {
      console.warn("[CombatOrchestrator] Falha ao aplicar modifiers de ataque:", err);
    }

    // FASE 5b: QTE Tank
    currentDamage = await playerQTE.checkAndUse(defenderId, "defense", currentDamage);

    // FASE 5c: Block Interativo
    const playerDef = sessionState.getPlayer(defenderId);
    const blocks = playerDef.heldCards.filter((c) => c.config?.tipo === "bloqueio");

    if (blocks.length > 0) {
      this.state.phase = "AWAITING_BLOCK";
      const optionsText = blocks.map((b, i) => `${i + 1}-${b.config.nome}`).join(", ");

      const message = languageManager.translate("live.combat_block_prompt", {
        defender: this.state.defenderUsername,
        cardName: "Bloqueios",
        slot: optionsText,
      });
      document.dispatchEvent(new CustomEvent("live:response", { detail: { message } }));

      const chosenIndex = await this._waitForDecision(60000);
      
      // ✅ CORRIGIDO: Processa corretamente o índice do bloqueio
      let blockCard = null;
      if (typeof chosenIndex === "boolean") {
        // Se foi true/false, não há bloqueio específico escolhido
        if (!chosenIndex) {
          // false = não bloqueou
          this.state.phase = "COMBAT";
        } else {
          // true = usa o primeiro bloqueio disponível
          blockCard = blocks[0];
        }
      } else if (typeof chosenIndex === "number") {
        // Número de slot específico
        blockCard = blocks[chosenIndex - 1];
      }

      if (blockCard) {
        // Aplica o bloqueio usando a lógica do playerBuffs
        const attackConfig = { valor: currentDamage, tipo: "dano", sourceId: attackerId };
        await playerBuffs.applyBlock(defenderId, blockCard, attackConfig);
        currentDamage = attackConfig.valor;
      }
      this.state.phase = "COMBAT";
    }

    // ✅ FIX CRÍTICO: FASE 6 - Modificadores de Status DO DEFENSOR (INCLUINDO STATUS DA CLASSE)
    const defMods = playerStatus.getModifiers(defenderId) || {};
    
    // Debug: Log dos modificadores do defensor
    console.debug("[CombatOrchestrator] Defender modifiers (DEFENSOR)", {
      defenderId,
      defMods,
      resolvedElement: resolvedElement, // ✅ Usa o elemento já definido no escopo global
    });

    if (!defMods.ignoreOtherStatuses) {
      if (defMods.negate) {
        // Status de negação anula todo o dano
        currentDamage = 0;
        console.log(`[CombatOrchestrator] 🛡️ Dano negado por status NEGATE`);
      } else {
        // ✅ NOVO: Aplica defesa plana do status (flatBlock)
        if (defMods.flatBlock > 0) {
          currentDamage = Math.max(0, currentDamage - defMods.flatBlock);
          console.debug(`[CombatOrchestrator] 🛡️ Defesa plana (status): -${defMods.flatBlock}, dano restante: ${currentDamage}`);
        }

        // ✅ FIX CRÍTICO: Aplica resistência de elemento (se existir elemento resolvido)
        if (resolvedElement) {
          const resistanceValue = this.getResistanceForElement(defMods, resolvedElement);
          
          console.debug(`[CombatOrchestrator] 🔍 Verificando resistência para elemento: ${resolvedElement}, resultado: ${resistanceValue}%`);
          
          if (resistanceValue > 0) {
            const damageReduced = Math.round(currentDamage * resistanceValue / 100);
            currentDamage = Math.max(0, currentDamage - damageReduced);
            console.debug(`[CombatOrchestrator] 🛡️ Resistência (${resolvedElement}): -${resistanceValue}%, dano reduzido: -${damageReduced}, dano restante: ${currentDamage}`);
          } else {
            console.debug(`[CombatOrchestrator] ℹ️ Nenhuma resistência para elemento: ${resolvedElement}`);
          }
        } else {
          console.warn(`[CombatOrchestrator] ⚠️ Nenhum elemento resolvido - resistência NÃO pode ser aplicada. Defina elemento na carta!`);
        }

        // ✅ NOVO: Aplica bônus de defesa percentual (se existir em defMods)
        const defensePercent = defMods.defensePercent ?? defMods.percentDefense ?? 0;
        if (defensePercent > 0) {
          const damageReduced = Math.round(currentDamage * defensePercent / 100);
          currentDamage = Math.max(0, currentDamage - damageReduced);
          console.debug(`[CombatOrchestrator] 🛡️ Defesa percentual: -${defensePercent}%, dano reduzido: -${damageReduced}, dano restante: ${currentDamage}`);
        }

        // ✅ NOVO: Aplica multiplicador de defesa (proteção)
        const defenseMultiplier = defMods.defenseMultiplier ?? defMods.multiplyDefense ?? 1;
        if (defenseMultiplier < 1) {
          currentDamage = Math.round(currentDamage * defenseMultiplier);
          console.debug(`[CombatOrchestrator] 🛡️ Multiplicador de defesa: x${defenseMultiplier}, dano final: ${currentDamage}`);
        }
      }
    } else {
      console.log(`[CombatOrchestrator] ⚠️ Status IGNORE_OTHER_STATUSES ativo - defesas ignoradas`);
    }

    // FASE 7: Aplicação Final
    const finalDamage = Math.max(0, Math.round(currentDamage));
    
    console.debug(`[CombatOrchestrator] RESUMO FINAL:`, {
      danoInicial: this.state.currentDamage,
      elemento: resolvedElement,
      danoFinal: finalDamage,
      defensasAplicadas: {
        flatBlock: defMods.flatBlock,
        resistencia: resolvedElement ? this.getResistanceForElement(defMods, resolvedElement) : 0,
        defensePercent: defMods.defensePercent ?? defMods.percentDefense ?? 0,
        defenseMultiplier: defMods.defenseMultiplier ?? defMods.multiplyDefense ?? 1,
      }
    });

    sessionState.damage(defenderId, finalDamage);

    // ✅ FIX 3: Status da carta aplicados ANTES do final (não depois)
    if (config.applyStatuses?.length) {
      config.applyStatuses.forEach((status) => {
        const instance = { source: "card", ...status };
        if (this._isDbuffStatus(instance)) {
          console.log(`[CombatOrchestrator][dbuff] Aplicando status '${instance.statusId || instance.id || instance.name}' em ${defenderId}`, instance);
        }
        playerStatus.apply(defenderId, instance);
      });
    }

    // SP Valor aplicado ao supportHP
    if (config.spValor) {
      sessionState.modifySupportHP(defenderId, config.spValor);
    }

    // Anúncio do resultado final
    const message = languageManager.translate("live.combat_result", {
      attacker: this.state.attackerUsername,
      defender: this.state.defenderUsername,
      damage: finalDamage,
    });
    document.dispatchEvent(
      new CustomEvent("live:response", {
        detail: { message },
      }),
    );
  }
}

export const combatOrchestrator = new CombatOrchestrator();