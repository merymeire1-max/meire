/**
 * combat-decision.js - Comandos de decisão de combate
 *
 * Define comandos para buff e bloqueio.
 *
 * @module CombatDecisionCommands
 */

import { combatOrchestrator } from "../combat-orchestrator.js";
import { playerManager } from "@systems/player/player-manager.js";

export const buffCommand = {
  id: "buff",
  name: "buff",
  description: "Responde à solicitação de buff de combate",
  usage: "/game buff [sim|nao]",
  minArgs: 1,
  maxArgs: 1,
  async execute(playerId, args, metadata) {
    const input = args[0].toLowerCase();
    
    console.log(`🎮 buffCommand.execute() - playerId: ${playerId}, input: ${input}`);
    
    // ✅ CORRIGIDO: Passa playerId (não username) para validação correta
    if (input === "nao" || input === "não") {
      const result = await combatOrchestrator.resolveDecision(playerId, "nao");
      console.log(`✅ Buff rejection resolved: ${result}`);
      return result;
    }

    const index = parseInt(input, 10);
    if (isNaN(index)) {
      console.warn(`⚠️ Buff: entrada inválida "${input}". Use: sim, nao, ou número do slot`);
      return false;
    }

    const result = await combatOrchestrator.resolveDecision(playerId, index);
    console.log(`✅ Buff selection resolved: ${result}`);
    return result;
  },
};

export const bloquearCommand = {
  id: "bloquear",
  name: "bloquear",
  aliases: ["block"],
  description: "Responde à solicitação de bloqueio de combate",
  usage: "/game bloquear [sim|nao|número]",
  minArgs: 1,
  maxArgs: 1,
  async execute(playerId, args, metadata) {
    const input = args[0].toLowerCase();
    
    console.log(`🎮 bloquearCommand.execute() - playerId: ${playerId}, input: ${input}`);

    // ✅ CORRIGIDO: Retorna o resultado de resolveDecision diretamente com AWAIT
    if (input === "sim") {
      console.log(`✅ Bloqueio confirmado (sim)`);
      const result = await combatOrchestrator.resolveDecision(playerId, "sim");
      console.log(`🎮 resolveDecision retornou: ${result}`);
      return result;
    }
    
    if (input === "nao" || input === "não") {
      console.log(`✅ Bloqueio recusado (nao)`);
      const result = await combatOrchestrator.resolveDecision(playerId, "nao");
      console.log(`🎮 resolveDecision retornou: ${result}`);
      return result;
    }

    // Se não for sim/nao, tenta interpretar como número de slot
    const index = parseInt(input, 10);
    if (isNaN(index)) {
      console.warn(`⚠️ Bloqueio: entrada inválida "${input}". Use: sim, nao, ou número do slot`);
      return false;
    }

    // Bloqueio com slot específico
    console.log(`✅ Bloqueio com slot ${index}`);
    const result = await combatOrchestrator.resolveDecision(playerId, index);
    console.log(`🎮 resolveDecision retornou: ${result}`);
    return result;
  },
};

export const qteSelectionCommand = {
  id: "qte",
  name: "qte",
  description: "Responde ao desafio de QTE",
  usage: "/game qte [valor]",
  minArgs: 1,
  maxArgs: 1,
  async execute(playerId, args, metadata) {
    // ✅ CORRIGIDO: Passa playerId (não username) para validação correta, com AWAIT
    const result = await combatOrchestrator.resolveDecision(playerId, args[0]);
    console.log(`✅ QTE resolved: ${result}`);
    return result;
  },
};

export const optionSelectionCommand = {
  id: "opcao",
  name: "opcao",
  description: "Responde à solicitação de escolha interativa",
  usage: "/game opcao [numero]",
  minArgs: 1,
  maxArgs: 1,
  async execute(playerId, args, metadata) {
    // ✅ Converte string para número
    const optionIndex = parseInt(args[0], 10);
    
    // ✅ Valida entrada
    if (isNaN(optionIndex)) {
      console.warn(`⚠️ Opção inválida: "${args[0]}" não é um número`);
      return false;
    }

    // ✅ CORRIGIDO: Passa playerId (não username) para validação correta
    const username = metadata?.username || playerManager.getPlayerName(playerId) || playerId;
    
    console.log(`📍 Jogador ${username} (${playerId}) selecionou opção ${optionIndex}`);
    
    // ✅ CRÍTICO: Passar playerId como primeiro parâmetro, não username, COM AWAIT
    const result = await combatOrchestrator.resolveDecision(playerId, optionIndex);
    console.log(`✅ Option resolved: ${result}`);
    return result;
  },
};
