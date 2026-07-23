/**
 * status-duplicate.js
 *
 * Comando para duplicar um status existente no registry de statuses.
 *
 * Uso: /status duplicar <statusId|statusName> [novoNome]
 *
 * Observações:
 * - O comando tenta detectar automaticamente o "status registry" em:
 *   1) window.statusRegistry (UI global)
 *   2) globalThis.statusRegistry
 *   3) um possível objeto importado chamado statusManager (descomente a import se houver)
 *
 * - O registry precisa expor ao menos:
 *   - get(id) ou find(predicate) ou getAll()
 *   - create(status) ou save(status) ou add(status)
 *
 * Ajuste os pontos de integração conforme sua base de código.
 */

import { languageManager } from "@core/language-manager.js";

// Se no seu projeto existir um módulo de status exportável, descomente e ajuste:
// import { statusManager } from "@systems/status/status-manager.js";

export const statusDuplicateCommand = {
  id: "duplicar-status",
  name: "duplicar-status",
  aliases: ["dup-status", "duplicar", "dup"],
  description: "Duplica um status existente: /status duplicar <id|nome> [novoNome]",
  usage: "/status duplicar <statusId|statusName> [novoNome]",
  minArgs: 1,
  maxArgs: 2,

  /**
   * @param {string} playerId
   * @param {Array<string>} args
   * @param {Object} metadata
   * @returns {Promise<boolean>}
   */
  async execute(playerId, args, metadata) {
    const username = metadata?.username || metadata?.displayName || playerId;
    const query = args[0];
    const newNameArg = args[1];

    if (!query) {
      const message = `${username}: Uso incorreto. ${this.usage}`;
      document.dispatchEvent(new CustomEvent("live:response", { detail: { message } }));
      return false;
    }

    // Resolve um "status registry" de forma defensiva
    const resolveRegistry = () => {
      // 1) checar import possível (descomente import se usar)
      // if (typeof statusManager !== "undefined" && statusManager) return statusManager;

      // 2) checar global/window
      if (typeof window !== "undefined" && window.statusRegistry) return window.statusRegistry;
      if (typeof globalThis !== "undefined" && globalThis.statusRegistry) return globalThis.statusRegistry;

      // 3) alguns projetos expõem via window.app?.statusService
      if (typeof window !== "undefined" && window.app?.statusService) return window.app.statusService;
      if (typeof globalThis !== "undefined" && globalThis.app?.statusService) return globalThis.app.statusService;

      return null;
    };

    const registry = resolveRegistry();

    if (!registry) {
      const message = `${username}: Não foi possível localizar o registry de status (statusRegistry). Verifique a integração.`;
      document.dispatchEvent(new CustomEvent("live:response", { detail: { message } }));
      console.error("[status-duplicate] registry not found - adapte o resolveRegistry() ao seu projeto.");
      return false;
    }

    // Função utilitária para buscar status por id ou nome (case-insensitive)
    const findStatus = () => {
      // tentativas comuns
      if (typeof registry.get === "function") {
        const byId = registry.get(query);
        if (byId) return byId;
      }

      // getAll / list / find
      const allCandidates =
        (typeof registry.getAll === "function" && registry.getAll()) ||
        (Array.isArray(registry.list) && registry.list) ||
        (typeof registry.listAll === "function" && registry.listAll()) ||
        null;

      if (Array.isArray(allCandidates)) {
        const qLower = String(query).toLowerCase();
        return allCandidates.find((s) => {
          const id = String(s.id || s.statusId || "").toLowerCase();
          const name = String(s.name || s.nome || "").toLowerCase();
          return id === qLower || name === qLower;
        });
      }

      // fallback: se registry.find existe
      if (typeof registry.find === "function") {
        try {
          const byGeneric = registry.find((s) => {
            const id = String(s.id || s.statusId || "").toLowerCase();
            const name = String(s.name || s.nome || "").toLowerCase();
            return id === query.toLowerCase() || name === query.toLowerCase();
          });
          if (byGeneric) return byGeneric;
        } catch (e) {
          // ignore
        }
      }

      return null;
    };

    const sourceStatus = findStatus();

    if (!sourceStatus) {
      const message = `${username}: Status '${query}' não encontrado. Use ID ou nome exato.`;
      document.dispatchEvent(new CustomEvent("live:response", { detail: { message } }));
      console.warn("[status-duplicate] status not found for query:", query);
      return false;
    }

    // Proteções: não duplicar built-in se não for desejado
    if (sourceStatus.builtIn || sourceStatus.builtin) {
      // opcional: permitir duplicar built-in mas avisar
      console.info(`[status-duplicate] Duplicando status built-in '${sourceStatus.id || sourceStatus.name}'.`);
    }

    // Clonar o objeto (deep clone)
    let newStatus;
    try {
      newStatus = JSON.parse(JSON.stringify(sourceStatus));
    } catch (e) {
      console.error("[status-duplicate] erro ao clonar status:", e);
      const message = `${username}: Erro ao clonar o status. Veja o console para detalhes.`;
      document.dispatchEvent(new CustomEvent("live:response", { detail: { message } }));
      return false;
    }

    // Gerar novo id único e nome
    const makeId = () => {
      const base = (newStatus.id || newStatus.statusId || newStatus.name || "status").toString().toLowerCase()
        .replace(/[^a-z0-9\-]/gi, "-")
        .replace(/\-+/g, "-")
        .replace(/(^\-|\-$)/g, "");
      return `${base}-copy-${Date.now()}`;
    };

    const newId = makeId();
    newStatus.id = newStatus.id ?? newStatus.statusId ?? newId;
    newStatus.statusId = newId; // duplicidade para compatibilidade com múltiplas keys
    newStatus.id = newId;
    // Nome final
    const originalName = sourceStatus.name || sourceStatus.nome || sourceStatus.statusId || "Status";
    newStatus.name = newNameArg ? String(newNameArg) : `${originalName} (cópia)`;

    // Marcar não-built-in
    if (newStatus.builtIn) delete newStatus.builtIn;
    if (newStatus.builtin) delete newStatus.builtin;

    // Ajustes menores: timestamps etc.
    newStatus.createdAt = newStatus.createdAt ?? new Date().toISOString();
    newStatus.updatedAt = newStatus.updatedAt ?? new Date().toISOString();

    // Salvar no registry usando a função disponível
    try {
      if (typeof registry.create === "function") {
        await registry.create(newStatus);
      } else if (typeof registry.save === "function") {
        await registry.save(newStatus);
      } else if (typeof registry.add === "function") {
        registry.add(newStatus);
      } else if (typeof registry.set === "function") {
        registry.set(newId, newStatus);
      } else if (Array.isArray(registry.list)) {
        // fallback simples: push para lista (nem sempre persistirá)
        registry.list.push(newStatus);
      } else {
        throw new Error("Nenhum método de persistência encontrado no registry.");
      }
    } catch (e) {
      console.error("[status-duplicate] erro ao salvar novo status:", e);
      const message = `${username}: Erro ao salvar o status duplicado. Veja o console para detalhes.`;
      document.dispatchEvent(new CustomEvent("live:response", { detail: { message } }));
      return false;
    }

    // Disparar evento para atualizar UI (nomes comuns)
    try {
      document.dispatchEvent(new CustomEvent("status:created", { detail: { status: newStatus } }));
      document.dispatchEvent(new CustomEvent("statusRegistry:changed", { detail: { action: "create", status: newStatus } }));
    } catch (e) {
      // ignore se ambiente sem DOM
    }

    const successMessage = `${username}: Status duplicado com sucesso: '${originalName}' → '${newStatus.name}' (id: ${newId})`;
    document.dispatchEvent(new CustomEvent("live:response", { detail: { message: successMessage } }));
    console.log("[status-duplicate] created:", newStatus);

    return true;
  },
};

console.log("✅ Comando 'duplicar-status' carregado");