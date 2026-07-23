/**
 * change-class.js - Comando de Trocar Classe
 *
 * Responsabilidades:
 * - Identificar classe solicitada
 * - Validar classe disponível
 * - Aplicar classe ao jogador
 *
 * @module ChangeClassCommand
 */

import { playerManager } from "@systems/player/player-manager.js";
import { configManager } from "@core/config-manager.js";
import { sessionState } from "@core/session-state.js";

/**
 * Busca classe por nome (case-insensitive, partial match) e retorna ClassData normalizado.
 * Usa configManager.getCharacterClassConfig() como normalizador canônico — garante
 * que passiveDamage sempre chega no nível raiz.
 * @private
 * @param {string} className
 * @returns {Object|null} ClassData flat ou null
 */
function findClass(className) {
  const availableClasses = configManager.getCharacters("class", true);

  if (availableClasses.length === 0) {
    console.warn("⚠️ Nenhuma classe disponível");
    return null;
  }

  const searchTerm = className.toLowerCase().trim();

  // Busca exata primeiro
  let found = availableClasses.find((cls) => cls.name.toLowerCase() === searchTerm);

  // Match parcial
  if (!found) {
    found = availableClasses.find((cls) => cls.name.toLowerCase().includes(searchTerm));
  }

  // Match pelo ID
  if (!found) {
    found = availableClasses.find((cls) => cls.id.toLowerCase() === searchTerm);
  }

  return found ? configManager.getCharacterClassConfig(found.id) : null;
}

/**
 * Aplica classe ao jogador via PlayerManager.
 * Áudio e animação são gerenciados internamente por player-class.js::assignClass —
 * não repetir aqui para evitar áudio duplo.
 * @private
 * @param {string} playerId
 * @param {Object} classData - ClassData já normalizado
 * @returns {Promise<boolean>}
 */
async function applyClass(playerId, classData) {
  console.log(`🎭 Aplicando classe: ${classData.name} → ${playerId}`);

  try {
    const success = await playerManager.assignClassToPlayer(playerId, classData);

    if (success) {
      console.log(`✅ Classe aplicada: ${classData.name}`);
      return true;
    } else {
      console.error("❌ Falha ao aplicar classe");
      return false;
    }
  } catch (error) {
    console.error("❌ Erro ao aplicar classe:", error);
    return false;
  }
}

// ============================================
// DEFINIÇÃO DO COMANDO
// ============================================

/**
 * Comando: Trocar Classe
 *
 * Este é um comando DINÂMICO - não tem triggers fixos.
 * Ele captura qualquer nome de classe disponível.
 *
 * Implementação: O CommandRegistry deve ter lógica especial
 * para tentar este comando quando nenhum outro match for encontrado.
 */
export const changeClassCommand = {
  id: "classe",
  name: "classe",
  aliases: ["class", "trocar", "mudar"],
  description: "Troca para uma classe disponível",
  usage: "/game classe [nome]",
  lobbyAllowed: true,
  minArgs: 1,
  maxArgs: 5, // Permite nomes compostos (ex: "DPS Athena")
  cooldown: 3000,

  /**
   * @param {string} playerId
   * @param {Array<string>} args
   * @param {Object} metadata
   * @returns {Promise<boolean>}
   */
  async execute(playerId, args, metadata) {
    const rawArgs = metadata?.rawArgs || args.join(" ");
    const className = rawArgs.trim();

    console.log(`🎭 Comando classe: "${className}" - ${playerId}`);

    if (!className) {
      console.warn("⚠️ [changeClass] Uso: /game classe [nome]");
      return false;
    }

    const classData = findClass(className);

    if (!classData) {
      console.warn(`⚠️ Classe não encontrada: "${className}"`);
      return false;
    }

    try {
      return await applyClass(playerId, classData);
    } catch (error) {
      console.error("❌ Erro ao processar comando classe:", error);
      return false;
    }
  },
};

// ============================================
// HELPERS DE PREFIXO
// ============================================

/**
 * Extrai prefixos únicos das classes disponíveis.
 * Considera prefixo "real" apenas o primeiro token de nomes compostos
 * que compartilham a mesma base com pelo menos outra versão.
 * Ex: ["DPS Athena", "BREAKER Athena", "TANK Athena"] → ["BREAKER", "DPS", "TANK"]
 *
 * @param {Object[]} availableClasses
 * @returns {string[]}
 */
export function extractAvailablePrefixes(availableClasses) {
  const baseMap = new Map(); // base → [prefixos]

  for (const cls of availableClasses) {
    const parts = cls.name.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const prefix = parts[0];
    const base = parts.slice(1).join(" ").toLowerCase();
    if (!baseMap.has(base)) baseMap.set(base, []);
    baseMap.get(base).push(prefix);
  }

  // Só é prefixo real se a mesma base aparece com 2+ versões
  const prefixes = new Set();
  baseMap.forEach((pList) => {
    if (pList.length >= 2) pList.forEach((p) => prefixes.add(p));
  });

  // Fallback: se nenhum prefixo compartilha base, pega todos os primeiros tokens compostos
  if (prefixes.size === 0) {
    baseMap.forEach((pList) => pList.forEach((p) => prefixes.add(p)));
  }

  return [...prefixes].sort();
}

/**
 * Busca classe pelo prefixo desejado, mantendo a base da classe atual do jogador.
 * Retorna ClassData normalizado via getCharacterClassConfig.
 * Ex: classe atual = "DPS Athena", prefixo = "BREAKER" → busca "BREAKER Athena"
 * @private
 * @param {string} currentClassName
 * @param {string} targetPrefix
 * @param {Object[]} availableClasses - chars brutos do configManager
 * @returns {Object|null} ClassData flat ou null
 */
function findClassByPrefix(currentClassName, targetPrefix, availableClasses) {
  const currentParts = currentClassName.trim().split(/\s+/);
  const base = currentParts.length >= 2 ? currentParts.slice(1).join(" ") : currentClassName;

  const searchTerm = `${targetPrefix} ${base}`.toLowerCase();

  // Busca exata: "BREAKER Athena"
  let found = availableClasses.find((cls) => cls.name.toLowerCase() === searchTerm);

  // Partial: começa com o prefixo e contém a base
  if (!found) {
    found = availableClasses.find(
      (cls) =>
        cls.name.toLowerCase().startsWith(targetPrefix.toLowerCase() + " ") &&
        cls.name.toLowerCase().includes(base.toLowerCase()),
    );
  }

  return found ? configManager.getCharacterClassConfig(found.id) : null;
}

// ============================================
// COMANDO: MUDAR PREFIXO DA CLASSE
// ============================================

/**
 * Comando: Mudar Prefixo da Classe
 * Troca para outra versão da classe atual mantendo o personagem base.
 * Ex: jogador está em "DPS Athena" → /game player1 mudarprefixo BREAKER → "BREAKER Athena"
 */
export const changeClassByPrefixCommand = {
  name: "mudarprefixo",
  aliases: ["mudarclasseprefixo", "changeclassprefix", "modo"],
  description: "Muda para outra versão da classe atual (por prefixo)",
  usage: "/game [player] mudarprefixo [PREFIXO]",
  minArgs: 1,
  maxArgs: 2,
  cooldown: 3000,

  /**
   * @param {string} playerId
   * @param {Array<string>} args
   * @param {Object} metadata
   * @returns {Promise<boolean>}
   */
  async execute(playerId, args, metadata) {
    const rawArgs = metadata?.rawArgs || args.join(" ");
    const targetPrefix = rawArgs.trim();

    // Defensive: detect missing playerId early
    if (!playerId) {
      console.warn(`⚠️ [mudarprefixo] chamado sem playerId. metadata=${JSON.stringify(metadata || {})}`);
      return false;
    }

    console.log(`🔀 Comando mudarprefixo: "${targetPrefix}" - ${playerId}`);

    if (!targetPrefix) {
      console.warn("⚠️ [mudarprefixo] Uso: /game [player] mudarprefixo [PREFIXO]");
      return false;
    }

    const player = sessionState.getPlayer(playerId);
    if (!player) {
      console.warn(`⚠️ [mudarprefixo] Jogador não encontrado para playerId=${playerId}`);
      return false;
    }

    const currentClass = player?.class;

    if (!currentClass?.name) {
      console.warn(`⚠️ ${playerId} não tem classe ativa para trocar prefixo`);
      return false;
    }

    const availableClasses = configManager.getCharacters("class", true);
    const classData = findClassByPrefix(currentClass.name, targetPrefix, availableClasses);

    if (!classData) {
      console.warn(`⚠️ Nenhuma classe com prefixo "${targetPrefix}" para base de "${currentClass.name}"`);
      return false;
    }

    try {
      return await applyClass(playerId, classData);
    } catch (error) {
      console.error("❌ Erro ao mudar prefixo de classe:", error);
      return false;
    }
  },
};

console.log("✅ Comando 'classe' carregado");