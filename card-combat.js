/**
 * card-combat.js - Sistema de Combate de Cartas
 *
 * Responsabilidades:
 * - Orquestrar todo o fluxo de combate
 * - Calcular dano final considerando todas as variáveis
 * - Aplicar buffs, debuffs, QTEs, resistências
 * - Processar parry
 * - Aplicar efeitos cronometrados
 * - Atualizar estado dos jogadores
 * - Coordenar feedback visual e sonoro
 *
 * @module CardCombat
 */

import { sessionState } from "@core/session-state.js";
import { playerStatus } from "@systems/player/player-status.js";
import { playerBuffs } from "@systems/player/player-buffs.js";
import { playerUI } from "@interface/player-ui.js";
import { animationSystem } from "@interface/enhanced-animations.js";
import { notificationManager } from "@interface/notification-manager.js";
import { audioManager } from "@systems/audio/audio-manager.js";
import { configManager } from "@core/config-manager.js";
import { playerQTE } from "@systems/player/player-qte.js";
import { languageManager } from "@core/language-manager.js";

/**
 * @typedef {Object} CombatAction
 * @property {string} type - 'damage', 'heal', 'buff', 'block'
 * @property {string} sourceId - ID do jogador que iniciou
 * @property {string} targetId - ID do jogador alvo
 * @property {Object} config - Configuração da carta
 * @property {number} baseValue - Valor base da ação
 * @property {string} [element] - Elemento (para dano)
 * @property {number} [elementDamage] - % de dano elemental
 */

/**
 * @typedef {Object} CombatResult
 * @property {boolean} success - Ação foi bem-sucedida?
 * @property {number} originalValue - Valor original
 * @property {number} finalValue - Valor final aplicado
 * @property {Array<Object>} modifiers - Lista de modificadores aplicados
 * @property {boolean} wasParried - Foi defendido por parry?
 * @property {boolean} wasBlocked - Foi bloqueado?
 * @property {Object} breakdown - Detalhamento completo dos cálculos
 */

class CardCombat {
  constructor() {
    this.initialized = false;
    this.combatLog = [];
    this.maxLogSize = 100; // Máximo de entradas no log
  }

  /**
   * Inicializa o sistema de combate
   */
  init() {
    if (this.initialized) {
      console.warn("⚠️ CardCombat já foi inicializado");
      return;
    }

    console.log("⚔️ CardCombat inicializando...");

    // Configura listeners de eventos
    this._setupEventListeners();

    this.initialized = true;
    console.log("✅ CardCombat inicializado");
  }

  /**
   * Configura listeners de eventos
   * @private
   */
  _setupEventListeners() {
    // Listener para dano de passiva
    document.addEventListener("trigger-passive-damage", async (e) => {
      const { attackerId, targetId, config } = e.detail;

      console.log(`⚡ Processando dano de passiva: ${attackerId} → ${targetId}`);

      await this.processDamage({
        type: "damage",
        sourceId: attackerId,
        targetId: targetId,
        config: config,
        baseValue: config.valor,
        element: config.element,
        elementDamage: config.elementDamage || 100,
        isPassive: true,
      });
    });

    // Listener para aplicar efeito de carta (genérico)
    document.addEventListener("apply-card-effect", async (e) => {
      const { config, targetId, attackerId, isPassive, isReflect } = e.detail;

      console.log(`🃏 Processando efeito de carta: ${config.tipo}`);

      switch (config.tipo) {
        case "dano":
          await this.processDamage({
            type: "damage",
            sourceId: attackerId || targetId,
            targetId: targetId,
            config: config,
            baseValue: config.valor,
            element: config.element,
            elementDamage: config.elementDamage ?? 100,
            isPassive: isPassive || false,
            isReflect: isReflect || false,
          });
          break;

        case "cura":
          await this.processHeal({
            type: "heal",
            sourceId: attackerId || targetId,
            targetId: targetId,
            config: config,
            baseValue: config.valor,
          });
          break;

        default:
          console.warn(`⚠️ Tipo de efeito não implementado: ${config.tipo}`);
      }
    });
  }

  // ============================================
  // PROCESSAMENTO DE DANO
  // ============================================

  /**
   * Processa ação de dano completa.
   *
   * Pipeline:
   *   1. Efeitos cronometrados globais (multiplicadores de tempo)
   *   2. Parry do defensor (abandona cedo se ocorrer)
   *   3. Buff de carta segurada do atacante (painel inline)
   *   3b. QTE Buff do atacante (player.qtes.BUFF)
   *   4. Modificadores de status do atacante via getModifiers()
   *   4b. Modificadores exclusivos de passiva (passiveScopeModifiers)
   *   5. Bloqueio de carta segurada do defensor (painel inline)
   *   5b. QTE Tank do defensor (player.qtes.TANK)
   *   6. Modificadores de status do defensor via getModifiers()
   *   7. Aplicação final + status da carta ao alvo
   *
   * @param {CombatAction} action
   * @returns {Promise<CombatResult>}
   */
  async processDamage(action) {
    const { sourceId, targetId, baseValue, element, config, isPassive = false, isReflect = false } = action;

    console.log(`⚔️ ${sourceId} → ${targetId} | base:${baseValue} elem:${element ?? "none"}`);

    const result = {
      success: false,
      originalValue: baseValue,
      finalValue: baseValue,
      modifiers: [],
      wasParried: false,
      wasBlocked: false,
      breakdown: {},
    };

    try {
      let currentDamage = Number(baseValue) || 0;

      // ── FASE 1: Efeitos cronometrados (global, não ligados a status) ──
      if (!isReflect) {
        const timedResult = this._applyTimedEffects(currentDamage);
        if (timedResult.modifiers.length) {
          currentDamage = timedResult.finalValue;
          result.modifiers.push(...timedResult.modifiers);
        }
      }

      // ── FASE 2: Parry — abandona imediatamente se ocorrer ──
      if (!isReflect && this._checkParry(targetId)) {
        result.wasParried = true;
        result.finalValue = 0;
        result.success = true;
        this._logCombat(action, result);
        this._showParryFeedback(targetId);
        return result;
      }

      // ── FASE 3: Buff de carta segurada (atacante) ──
      if (!isPassive && !isReflect) {
        const buffResult = await this._applyAttackBuffs(sourceId, currentDamage);
        if (buffResult.modifiers.length) {
          currentDamage = buffResult.finalValue;
          result.modifiers.push(...buffResult.modifiers);
        }
      }

      // ── FASE 3b: QTE Buff do atacante ──────────────────────────────────────
      // Consulta player.qtes.BUFF — mecanismo independente dos status visuais.
      // qte-buff/qte-tank em config-builtin-statuses são cooldownTracker (visuais);
      // o efeito mecânico real vem de playerQTE.checkAndUse().
      if (!isPassive && !isReflect) {
        const afterQteBuff = await playerQTE.checkAndUse(sourceId, "attack", currentDamage);
        if (afterQteBuff !== currentDamage) {
          result.modifiers.push({ source: "QTE Buff", type: "qte_buff", change: afterQteBuff - currentDamage });
          currentDamage = afterQteBuff;
        }
      }

      // ── FASE 4: Modificadores de status do atacante ──
      // Aplica a todos — inclusive passivas, que também são beneficiadas
      // por buffs de dano ativos no atacante.
      {
        const atkMods = playerStatus.getModifiers(sourceId);
        const beforeAtk = currentDamage;

        // Elemento resolvido: override de status > parâmetro da ação
        const resolvedElement = atkMods.overrideElement ?? element ?? null;

        // Bônus elemental específico
        if (resolvedElement && atkMods.damageBonus[resolvedElement]) {
          currentDamage += atkMods.damageBonus[resolvedElement];
        }
        // Bônus geral percentual
        if (atkMods.damageBonus.general) {
          currentDamage = Math.round(currentDamage * (1 + atkMods.damageBonus.general / 100));
        }
        // Bônus flat
        if (atkMods.damageBonus.__flat) {
          currentDamage += atkMods.damageBonus.__flat;
        }
        // Multiplicador
        if (atkMods.damageMultiply !== 1) {
          currentDamage = Math.round(currentDamage * atkMods.damageMultiply);
        }

        if (currentDamage !== beforeAtk) {
          result.modifiers.push({ source: "Status Ataque", type: "status_atk", change: currentDamage - beforeAtk });
        }
      }

      // ── FASE 4b: Modificadores exclusivos de passiva (scope: "passive") ──
      // Statuses da classe com scope "passive" não ficam ativos permanentemente
      // — são calculados e passados no passiveConfig.passiveScopeModifiers.
      if (isPassive && config.passiveScopeModifiers) {
        const psm = config.passiveScopeModifiers;
        const beforePsm = currentDamage;
        if (psm.damageBonusPercent) {
          currentDamage = Math.round(currentDamage * (1 + psm.damageBonusPercent / 100));
        }
        if (psm.damageBonusFlat) {
          currentDamage += psm.damageBonusFlat;
        }
        if (psm.damageMultiply && psm.damageMultiply !== 1) {
          currentDamage = Math.round(currentDamage * psm.damageMultiply);
        }
        if (currentDamage !== beforePsm) {
          result.modifiers.push({ source: "Bônus Passiva", type: "passive_scope", change: currentDamage - beforePsm });
        }
      }

      // ── FASE 5: Bloqueio de carta segurada (defensor) ──
      if (!isReflect && !isPassive) {
        const blockResult = await this._checkBlock(targetId, {
          ...config,
          valor: currentDamage,
          element,
          sourceId,
        });
        if (blockResult.blocked) {
          result.wasBlocked = true;
          const blocked = currentDamage - blockResult.finalDamage;
          currentDamage = blockResult.finalDamage;
          result.modifiers.push({ source: "Bloqueio", type: "block", change: -blocked });
        }
      }

      // ── FASE 5b: QTE Tank do defensor ──────────────────────────────────────
      if (!isReflect && !isPassive) {
        const afterQteTank = await playerQTE.checkAndUse(targetId, "defense", currentDamage);
        if (afterQteTank !== currentDamage) {
          result.modifiers.push({ source: "QTE Tank", type: "qte_tank", change: afterQteTank - currentDamage });
          currentDamage = afterQteTank;
        }
      }

      // ── FASE 6: Modificadores de status do defensor ──
      if (!isReflect) {
        const defMods = playerStatus.getModifiers(targetId);

        // ignoreOtherStatuses (ex: KD) — pula todos os mods defensivos
        if (!defMods.ignoreOtherStatuses) {
          // negate: cancela o ataque inteiro
          if (defMods.negate) {
            currentDamage = 0;
            result.modifiers.push({ source: "Negar", type: "negate", change: -currentDamage });
          } else {
            const beforeDef = currentDamage;

            // flatBlock: absorve X fixo
            if (defMods.flatBlock > 0) {
              currentDamage = Math.max(0, currentDamage - defMods.flatBlock);
            }

            // Resistência elemental
            const resolvedElement = playerStatus.getModifiers(sourceId).overrideElement ?? element ?? null;
            if (resolvedElement) {
              const res = playerStatus.getResistanceFor(targetId, resolvedElement);
              if (res !== 0) {
                currentDamage = Math.max(0, Math.round(currentDamage * (1 - res / 100)));
              }
            }

            if (currentDamage !== beforeDef) {
              result.modifiers.push({ source: "Status Defesa", type: "status_def", change: currentDamage - beforeDef });
            }

            // reflect: devolve % ao atacante
            if (defMods.reflect > 0 && currentDamage > 0) {
              const reflectDmg = Math.round(currentDamage * (defMods.reflect / 100));
              document.dispatchEvent(
                new CustomEvent("apply-card-effect", {
                  detail: { config: { tipo: "dano", valor: reflectDmg }, targetId: sourceId, isReflect: true },
                }),
              );
            }
          }
        }
      }

      // ── FASE 7: Aplicação final ──
      result.finalValue = Math.max(0, Math.round(currentDamage));
      result.success = true;

      sessionState.damage(targetId, result.finalValue);

      if (config?.spValor) {
        sessionState.modifySupportHP(targetId, config.spValor);
        playerUI.showSupportHPEffect(targetId, config.spValor);
      }

      // Status da carta aplicados ao alvo após o dano
      this._applyCardStatuses(config, targetId);

      this._logCombat(action, result);
      this._showDamageFeedback(targetId, result.finalValue, result.modifiers);

      console.log(`✅ Dano final: ${baseValue} → ${result.finalValue}`);
      return result;
    } catch (error) {
      console.error("❌ Erro ao processar dano:", error);
      result.success = false;
      return result;
    }
  }

  /**
   * Aplica os status definidos em config.applyStatuses[] ao alvo após o dano.
   * Cada entrada: { statusId, value?, remaining?, source? }
   * @private
   */
  _applyCardStatuses(config, targetId) {
    if (!config?.applyStatuses?.length) return;
    config.applyStatuses.forEach((inst) => {
      playerStatus.apply(targetId, { source: "card", ...inst });
    });
  }

  // ============================================
  // PROCESSAMENTO DE CURA
  // ============================================

  /**
   * Processa ação de cura
   * @param {CombatAction} action
   * @returns {Promise<CombatResult>}
   */
  async processHeal(action) {
    const { targetId, baseValue, config } = action;

    console.log(`❤️ Processando cura: ${targetId} +${baseValue}`);

    const result = {
      success: false,
      originalValue: baseValue,
      finalValue: baseValue,
      modifiers: [],
      breakdown: {},
    };

    try {
      // Cura é aplicada diretamente (sem modificadores por enquanto)
      const newHP = sessionState.heal(targetId, baseValue);

      // Aplica spValor ao supportHP do alvo (se configurado na carta)
      if (config?.spValor) {
        sessionState.modifySupportHP(targetId, config.spValor);
        playerUI.showSupportHPEffect(targetId, config.spValor);
        console.log(`🛡️ SupportHP ${targetId}: ${config.spValor > 0 ? "+" : ""}${config.spValor}`);
      }

      result.finalValue = baseValue;
      result.success = true;

      // Status da carta aplicados ao alvo após a cura
      this._applyCardStatuses(config, targetId);

      // Log
      this._logCombat(action, result);

      // Feedback visual
      this._showHealFeedback(targetId, baseValue);

      console.log(`✅ Cura aplicada: +${baseValue} HP`);
      console.log(`  HP atual (${targetId}): ${newHP}`);

      return result;
    } catch (error) {
      console.error(`❌ Erro ao processar cura:`, error);
      result.success = false;
      return result;
    }
  }

  // ============================================
  // MODIFICADORES E CHECAGENS
  // ============================================

  /**
   * Aplica efeitos cronometrados
   * @private
   * @param {number} baseDamage
   * @returns {Object}
   */
  _applyTimedEffects(baseDamage) {
    const result = {
      originalValue: baseDamage,
      finalValue: baseDamage,
      modifiers: [],
    };

    // Obtém efeitos ativos do global
    const activeEffects = typeof window.getActiveTimedEffects === "function" ? window.getActiveTimedEffects() : [];

    if (activeEffects.length === 0) {
      return result;
    }

    let currentDamage = baseDamage;

    activeEffects.forEach((effect) => {
      const oldDamage = currentDamage;

      if (effect.type === "attack_multiplier") {
        currentDamage = Math.round(currentDamage * effect.multiplier);

        result.modifiers.push({
          source: "Efeito Cronometrado",
          type: "timed_multiplier",
          value: effect.multiplier,
          change: currentDamage - oldDamage,
        });
      } else if (effect.type === "attack_chance_multiplier") {
        const roll = Math.random() * 100;

        if (roll < effect.chance) {
          currentDamage = Math.round(currentDamage * effect.multiplier);

          result.modifiers.push({
            source: "Crítico Cronometrado",
            type: "timed_critical",
            value: effect.multiplier,
            change: currentDamage - oldDamage,
          });

          // Toca áudio de crítico
          try {
            audioManager.playSFX("gameplay/critico.mp3", false);
          } catch (e) {
            console.warn("Áudio de crítico não disponível");
          }

          console.log(`💥 ACERTO CRÍTICO CRONOMETRADO! (${effect.chance}%)`);
        }
      }
    });

    result.finalValue = currentDamage;
    return result;
  }

  /**
   * Aplica buffs de ataque
   * @private
   * @param {string} attackerId
   * @param {number} baseDamage
   * @returns {Promise<Object>}
   */
  /**
   * Exibe painel de buff de carta segurada e aplica o modificador.
   * O cálculo do valor resultante continua aqui porque depende do contexto
   * da carta segurada (efeito: adicionar / percentual / multiplicar),
   * não dos StatusDefinition — são dois sistemas complementares.
   * @private
   */
  async _applyAttackBuffs(attackerId, baseDamage) {
    const result = { originalValue: baseDamage, finalValue: baseDamage, modifiers: [] };

    const buffCard = await playerBuffs.checkBuffs(attackerId);
    if (!buffCard) return result;

    const modifier = await playerBuffs.applyBuff(attackerId, buffCard);
    let currentDamage = baseDamage;

    switch (modifier.type) {
      case "percentual":
        currentDamage = currentDamage + Math.floor(currentDamage * (modifier.value / 100));
        break;
      case "multiplicar":
        currentDamage = Math.round(currentDamage * modifier.value);
        break;
      default:
        currentDamage = currentDamage + modifier.value;
    }

    result.modifiers.push({
      source: "Buff de Carta",
      type: `buff_${modifier.type}`,
      value: modifier.value,
      change: currentDamage - baseDamage,
    });

    if (animationSystem?.completeBuffBlockSequence) {
      await animationSystem.completeBuffBlockSequence(baseDamage, currentDamage, "buff");
    }

    result.finalValue = currentDamage;
    return result;
  }

  /**
   * Rola dado de parry. Retorna true se ocorrer.
   * @private
   * @param {string} targetId
   * @returns {boolean}
   */
  _checkParry(_targetId) {
    const parryChance = configManager.get("general.parryChance");
    if (!parryChance || parryChance <= 0) return false;
    const parried = Math.random() * 100 < parryChance;
    if (parried) console.log(`🛡️ PARRY! (${parryChance}%)`);
    return parried;
  }

  /**
   * Verifica e aplica bloqueio automático
   * @private
   * @param {string} targetId
   * @param {Object} attackConfig
   * @returns {Promise<Object>}
   */
  async _checkBlock(targetId, attackConfig) {
    const result = {
      blocked: false,
      originalDamage: attackConfig.valor,
      finalDamage: attackConfig.valor,
    };

    // Usa sistema de buffs para verificar bloqueios — painel exibido ao defensor
    const blocked = await playerBuffs.checkBlock(targetId, attackConfig);

    if (blocked) {
      result.blocked = true;
      result.finalDamage = attackConfig.valor; // Já foi modificado pelo checkBlock
    }

    return result;
  }

  // ============================================
  // FEEDBACK VISUAL E SONORO
  // ============================================

  /**
   * Mostra feedback de dano
   * @private
   * @param {string} targetId
   * @param {number} damage
   * @param {Array} modifiers
   */
  _showDamageFeedback(targetId, damage, modifiers) {
    // Animação de dano
    if (animationSystem) {
      animationSystem.showEnhancedDamage(targetId, damage);
    }

    // Notificação com breakdown
    if (notificationManager && modifiers.length > 0) {
      const breakdown = modifiers
        .filter((m) => m.change !== 0)
        .map((m) => `${m.source}: ${m.change > 0 ? "+" : ""}${m.change}`)
        .join("<br>");

      if (breakdown) {
        notificationManager.show({
          type: targetId,
          text: `-${damage} HP<br><small>${breakdown}</small>`,
          duration: 3000,
        });
      }
    }
  }

  /**
   * Mostra feedback de cura
   * @private
   * @param {string} targetId
   * @param {number} amount
   */
  _showHealFeedback(targetId, amount) {
    if (animationSystem) {
      animationSystem.showEnhancedHeal(targetId, amount);
    }

    if (notificationManager) {
      notificationManager.show({
        type: targetId,
        text: `+${amount} HP`,
        duration: 2000,
      });
    }
  }

  /**
   * Mostra feedback de parry
   * @private
   * @param {string} targetId
   */
  _showParryFeedback(targetId) {
    // Usa sistema do card-system (mantém compatibilidade)
    const playerElement = document.getElementById(targetId);

    if (!playerElement) return;

    playerElement.classList.add("player-parry-flash");
    setTimeout(() => playerElement.classList.remove("player-parry-flash"), 600);

    const parryText = document.createElement("div");
    parryText.className = "parry-effect";
    parryText.textContent = languageManager.translate("card_combat.parry");

    const rect = playerElement.getBoundingClientRect();
    parryText.style.position = "fixed";
    parryText.style.top = `${rect.top + rect.height / 2 - 30}px`;
    parryText.style.right = `${window.innerWidth - rect.right}px`;

    document.body.appendChild(parryText);

    // Partículas
    this._createParryParticles(targetId);

    setTimeout(() => {
      if (parryText.parentNode) {
        parryText.parentNode.removeChild(parryText);
      }
    }, 1200);

    // Áudio
    try {
      audioManager.playSFX("gameplay/parry.mp3", true, 0.6);
    } catch (e) {
      console.warn("Som de parry não disponível");
    }
  }

  /**
   * Cria partículas de parry
   * @private
   * @param {string} playerId
   */
  _createParryParticles(playerId) {
    const playerElement = document.getElementById(playerId);
    if (!playerElement) return;

    const rect = playerElement.getBoundingClientRect();

    for (let i = 0; i < 8; i++) {
      const particle = document.createElement("div");
      particle.textContent = "✨";
      particle.className = "parry-particle";

      const startX = rect.left + rect.width / 2;
      const startY = rect.top + rect.height / 2;

      particle.style.left = `${startX}px`;
      particle.style.top = `${startY}px`;

      document.body.appendChild(particle);

      const angle = (Math.PI * 2 * i) / 8;
      const distance = 60 + Math.random() * 30;
      const endX = startX + Math.cos(angle) * distance;
      const endY = startY + Math.sin(angle) * distance;

      particle.animate(
        [
          { left: `${startX}px`, top: `${startY}px`, opacity: 1, transform: "scale(0)" },
          { left: `${endX}px`, top: `${endY}px`, opacity: 0, transform: "scale(1.5)" },
        ],
        {
          duration: 800,
          easing: "ease-out",
        },
      ).onfinish = () => {
        if (particle.parentNode) {
          particle.parentNode.removeChild(particle);
        }
      };
    }
  }

  // ============================================
  // LOG DE COMBATE
  // ============================================

  /**
   * Registra ação de combate no log
   * @private
   * @param {CombatAction} action
   * @param {CombatResult} result
   */
  _logCombat(action, result) {
    const entry = {
      timestamp: Date.now(),
      action: action,
      result: result,
    };

    this.combatLog.push(entry);

    // Mantém tamanho máximo
    if (this.combatLog.length > this.maxLogSize) {
      this.combatLog.shift();
    }
  }

  /**
   * Obtém log de combate
   * @param {number} [limit=10] - Número de entradas
   * @returns {Array}
   */
  getCombatLog(limit = 10) {
    return this.combatLog.slice(-limit);
  }

  /**
   * Limpa log de combate
   */
  clearCombatLog() {
    this.combatLog = [];
    console.log("🧹 Log de combate limpo");
  }

  // ============================================
  // DEBUG
  // ============================================

  /**
   * Simula combate completo (debug)
   * @param {string} attackerId
   * @param {string} targetId
   * @param {number} baseDamage
   * @param {string} [element=null]
   */
  async debugCombat(attackerId, targetId, baseDamage, element = null) {
    console.log("🎮 === SIMULAÇÃO DE COMBATE (DEBUG) ===");
    console.log(`Atacante: ${attackerId}`);
    console.log(`Alvo: ${targetId}`);
    console.log(`Dano Base: ${baseDamage}`);
    console.log(`Elemento: ${element || "Physical"}`);
    console.log("=====================================");

    const result = await this.processDamage({
      type: "damage",
      sourceId: attackerId,
      targetId: targetId,
      config: {
        tipo: "dano",
        valor: baseDamage,
        element: element,
        elementDamage: element ? 100 : 0,
      },
      baseValue: baseDamage,
      element: element,
      elementDamage: element ? 100 : 0,
    });

    console.log("=====================================");
    console.log("RESULTADO:", result);
    console.log("=====================================");

    return result;
  }

  /**
   * Mostra últimas entradas do log
   * @param {number} [count=5]
   */
  debugLog(count = 5) {
    console.log(`📜 Últimas ${count} ações de combate:`);

    const recent = this.getCombatLog(count);

    recent.forEach((entry, index) => {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      const action = entry.action;
      const result = entry.result;

      console.log(`\n[${index + 1}] ${time}`);
      console.log(`  ${action.sourceId} → ${action.targetId}`);
      console.log(`  Tipo: ${action.type}`);
      console.log(`  Base: ${result.originalValue} | Final: ${result.finalValue}`);

      if (result.wasParried) {
        console.log(`  🛡️ PARRY!`);
      }

      if (result.wasBlocked) {
        console.log(`  🛡️ Bloqueado`);
      }

      if (result.modifiers.length > 0) {
        console.log(`  Modificadores:`);
        result.modifiers.forEach((mod) => {
          console.log(`    - ${mod.source}: ${mod.change > 0 ? "+" : ""}${mod.change}`);
        });
      }
    });
  }

  /**
   * Reseta sistema (debug)
   */
  debugReset() {
    this.clearCombatLog();
    console.log("🔄 CardCombat resetado");
  }
}

// Singleton
export const cardCombat = new CardCombat();

// Expõe globalmente para debug
window.cardCombat = cardCombat;

console.log("✅ CardCombat carregado");
console.log("💡 Use window.cardCombat.debugCombat(attacker, target, damage, element)");
console.log("💡 Use window.cardCombat.debugLog() para ver histórico");
