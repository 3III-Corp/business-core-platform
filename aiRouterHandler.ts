import crypto from "node:crypto";

export interface ServerAiDispatchRequest {
  provider: "gemini" | "openai";
  prompt: string;
  scopeBoundary: string;
  actorId: string;
}

export async function dispatchToServerAi(req: ServerAiDispatchRequest) {
  const correlationId = crypto.randomUUID();

  if (req.provider === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: req.prompt }] }],
        }),
      }
    );

    if (!res.ok) throw new Error(`Gemini error [${correlationId}]: ${res.status}`);
    const json = await res.json();
    const text =
      json?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p?.text ?? "")
        .join("") ?? "";

    return {
      correlationId,
      provider: "gemini",
      advisoryOnly: true,
      output: text,
    };
  }

  throw new Error("Unsupported server provider in current route");
}
