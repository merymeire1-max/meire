/**
 * slot-use.js - Comando /game usar slot [número]
 *
 * Usa a carta no slot informado do jogador que deu o comando.
 * Despacha o evento "use-held-card" que o card-manager.js já escuta
 * em _setupEventListeners() — sem duplicar lógica.
 *
 * Não tem limite de uso por turno (cartas de slot são independentes
 * do contador do liveTurnManager).
 *
 * Silencioso em caso de sucesso (o modal universal abre para o GM).
 * Responde no chat apenas em caso de erro (slot vazio, slot inválido).
 *
 * @module SlotUseCommand
 */

import { cardManager } from "@systems/cards/card-manager.js";
import { combatOrchestrator } from "@systems/integrations/combat-orchestrator.js";
import { languageManager } from "@core/language-manager.js";

export const slotUseCommand = {
  id: "usar",
  name: "usar",
  aliases: ["use"],
  description: "Usa a carta no slot informado",
  usage: "/game usar slot [número] [alvo]",
  minArgs: 2,
  maxArgs: 3,

  /**
   * @param {string} playerId
   * @param {Array<string>} args - ["slot", "N", "target?"]
   * @param {Object} metadata
   * @returns {Promise<boolean>}
   */
  async execute(playerId, args, metadata) {
    const username = metadata?.username || metadata?.displayName || playerId;

    // Valida keyword "slot"
    if (args[0].toLowerCase() !== "slot") {
      return false;
    }

    const slotNum = parseInt(args[1], 10);
    const target = args[2]?.toLowerCase(); // Optional target

    if (isNaN(slotNum) || slotNum < 1) {
      const message = languageManager.translate("live.slot_use_usage", { username });
      document.dispatchEvent(
        new CustomEvent("live:response", {
          detail: { message },
        }),
      );
      return false;
    }

    // Validate target is 'p1' or 'p2' if provided
    if (target && target !== "p1" && target !== "p2") {
      const message = `${username}: Alvo inválido. Use 'p1' ou 'p2'.`;
      document.dispatchEvent(
        new CustomEvent("live:response", {
          detail: { message },
        }),
      );
      return false;
    }

    // Verifica se o slot tem carta
    const card = cardManager.held.getCard(playerId, slotNum);

    if (!card) {
      const message = languageManager.translate("live.slot_empty", { username, slotNum });
      document.dispatchEvent(
        new CustomEvent("live:response", {
          detail: { message },
        }),
      );
      return false;
    }

    // --- Normalizar / validar elemento da carta antes de despachar ---
    // Força que as cartas terminem com um dos elementos aceitos:
    // "corte", "impacto", "perfurante", "perfume" (lowercase).
    const KNOWN_ELEMENTS = ["corte", "perfurante", "impacto", "perfume"];
    const FALLBACK_ELEMENT = "impacto";

    // Map de termos genéricos para elementos concretos (lowercase)
    const GENERIC_ELEMENT_MAP = {
      'dano': null, // não mapear automaticamente; será inferido por outras fontes ou fallback
      'fisico': 'impacto',
      'físico': 'impacto',
      'physical': 'impacto',
      'corte': 'corte',
      'perfurante': 'perfurante',
      'impacto': 'impacto',
      'perfume': 'perfume'
    };

    /**
     * Tenta resolver o elemento de várias fontes:
     * - candidate (campo explícito)
     * - card.config.elementStatusId / applyStatuses via statusRegistry (se disponível)
     * - texto de descrição/nome da carta
     * - GENERIC_ELEMENT_MAP
     * - fallback final
     *
     * Sempre retorna uma das KNOWN_ELEMENTS (lowercase).
     */
    function normalizeElement(candidate, cardObj) {
      // helper: normalize string and check KNOWN_ELEMENTS
      const tryNormalize = (s) => {
        if (!s && s !== 0) return undefined;
        const st = String(s).trim().toLowerCase();
        if (st === "") return undefined;
        if (KNOWN_ELEMENTS.includes(st)) return st;
        return undefined;
      };

      // 1) candidate direto (campo element / tipo)
      const direct = tryNormalize(candidate);
      if (direct) return direct;

      // 2) tentar resolver via statusRegistry (se existir) usando elementStatusId ou statusId em applyStatuses
      try {
        const registry =
          (typeof window !== "undefined" && window.statusRegistry) ||
          (typeof globalThis !== "undefined" && globalThis.statusRegistry) ||
          null;

        if (registry && typeof registry.get === "function") {
          // elementStatusId específico
          const elementStatusId = cardObj?.config?.elementStatusId;
          if (elementStatusId) {
            const status = registry.get(elementStatusId);
            const statusElement =
              status?.element || status?.type || status?.tipo || status?.nome || status?.name;
            const norm = tryNormalize(statusElement);
            if (norm) return norm;
          }

          // procurar em applyStatuses (array com { statusId, ... })
          const apply = cardObj?.config?.applyStatuses;
          if (Array.isArray(apply)) {
            for (const s of apply) {
              const sid = s?.statusId;
              if (!sid) continue;
              const stObj = registry.get(sid);
              const se = stObj?.element || stObj?.type || stObj?.tipo || stObj?.nome || stObj?.name;
              const norm2 = tryNormalize(se);
              if (norm2) return norm2;
            }
          }
        }
      } catch (e) {
        // se não existir registry ou der erro, seguir para próximas heurísticas
        console.debug("[slot-use] statusRegistry unavailable or error while resolving statuses:", e);
      }

      // 3) inferir a partir da descrição/nome da carta (busca por palavras-chave)
      try {
        const name = String(cardObj?.config?.nome || "").toLowerCase();
        const desc = String(cardObj?.config?.descricao || "").toLowerCase();
        const text = `${name} ${desc}`;
        for (const el of KNOWN_ELEMENTS) {
          if (text.includes(el)) return el;
        }
      } catch (e) {
        // ignore
      }

      // 4) tentar mapear candidate por GENERIC_ELEMENT_MAP
      try {
        const cand = String(candidate || "").trim().toLowerCase();
        if (cand && GENERIC_ELEMENT_MAP.hasOwnProperty(cand)) {
          const mapped = GENERIC_ELEMENT_MAP[cand];
          if (mapped) {
            const mappedNorm = String(mapped).toLowerCase();
            if (KNOWN_ELEMENTS.includes(mappedNorm)) return mappedNorm;
          }
        }
      } catch (e) {
        // ignore
      }

      // 5) fallback definitivo: retorna element padrão (impacto)
      return FALLBACK_ELEMENT;
    }

    try {
      if (card && card.config) {
        // candidate pode ser card.config.element (se já existir) ou card.config.tipo
        const candidate = card.config.element ?? card.config.elemento ?? card.config.tipo ?? null;
        const normalized = normalizeElement(candidate, card);

        // sempre define element para uma das opções conhecidas (lowercase)
        card.config.element = normalized;

        console.info(
          `[slot-use] Slot ${slotNum} — elemento atribuído: '${card.config.element}' (orig: '${candidate}')`,
        );
      }
    } catch (e) {
      // Se algo falhar aqui, não bloqueamos o uso da carta — apenas logamos.
      console.error("[slot-use] Erro ao normalizar elemento da carta:", e);
    }

    // Despacha evento que card-manager._setupEventListeners() já escuta.
    // Isso abre o universalCardModal para o GM interagir — sem duplicar lógica.
    document.dispatchEvent(
      new CustomEvent("use-held-card", {
        detail: { playerId, slot: slotNum, card },
      }),
    );

    // Redireciona para o orquestrador de combate
    return combatOrchestrator.handleSlotUse(playerId, slotNum, card, metadata, target);
  },
};

console.log("✅ Comando 'usar' carregado");