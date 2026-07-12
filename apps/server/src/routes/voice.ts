import { type FastifyInstance } from "fastify";
import { getDb } from "../db";
import {
  generateUserProfile,
  getUserProfile,
  injectProfileIntoGlobalClaudeMd,
} from "../services/memory/voice";
import { coerceModel } from "../services/memory/claude-cli";

/**
 * Cross-project user "voice/taste" profile — the personal-context layer.
 * Global (not project-scoped): synthesized from the user's own messages.
 */
export async function registerVoiceRoutes(app: FastifyInstance) {
  app.get("/api/voice", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    return { profile: getUserProfile(getDb()) };
  });

  app.post<{ Body: { model?: string } }>("/api/voice/generate", async (req, reply) => {
    const model = coerceModel(req.body?.model);
    try {
      const result = await generateUserProfile(model, getDb());
      reply.header("Cache-Control", "no-store");
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.error({ err }, "voice profile generation failed");
      reply.code(500).send({ error: message });
    }
  });

  // Opt-in: write the profile into the user's GLOBAL ~/.claude/CLAUDE.md.
  app.post("/api/voice/inject", async (_req, reply) => {
    try {
      const result = await injectProfileIntoGlobalClaudeMd(getDb());
      reply.header("Cache-Control", "no-store");
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.error({ err }, "voice profile injection failed");
      reply.code(400).send({ error: message });
    }
  });
}
