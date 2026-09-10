import { Redis } from "@upstash/redis";
import type { TelegramSession } from "./schemas";

const redis = Redis.fromEnv();

function sessionKey(chatId: number): string {
  return `session:${chatId}`;
}

function freshSession(chatId: number): TelegramSession {
  return {
    chat_id: chatId,
    state: "AWAITING_JD",
    jd_profile: null,
    candidates: [],
    active_candidate_index: null,
  };
}

export async function getSession(chatId: number): Promise<TelegramSession> {
  const data = await redis.get<TelegramSession>(sessionKey(chatId));
  if (!data) return freshSession(chatId);
  return data;
}

export async function saveSession(session: TelegramSession): Promise<void> {
  await redis.set(sessionKey(session.chat_id), JSON.stringify(session));
}

export async function resetSession(
  chatId: number,
  keepJd: boolean
): Promise<TelegramSession> {
  if (keepJd) {
    const existing = await getSession(chatId);
    const session: TelegramSession = {
      ...freshSession(chatId),
      state: existing.jd_profile ? "AWAITING_RESUMES" : "AWAITING_JD",
      jd_profile: existing.jd_profile,
    };
    await saveSession(session);
    return session;
  }
  const session = freshSession(chatId);
  await saveSession(session);
  return session;
}
