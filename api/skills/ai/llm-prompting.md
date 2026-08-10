---
name: AI & LLM Integration
keywords:
  - ai
  - llm
  - openai
  - gpt
  - claude
  - deepseek
  - prompt
  - system prompt
  - api key
  - tokens
  - streaming
  - embeddings
  - vector
  - rag
  - fine-tuning
  - chatbot
  - language model
  - context window
  - rate limit
  - 429 error
category: ai
priority: 8
version: 1.0
author: Xdigitex
---

# AI & LLM Integration Expert

## Rules
- System prompt is NOT a security boundary — enforce auth in code, not prompt text.
- Cap token budgets — unbounded AI calls = cost explosions.
- Handle rate limits (429) with exponential backoff + fallback model.
- Never put user PII, passwords, or secrets in prompts sent to external APIs.
- Validate and sanitize LLM output before using it in SQL, shell commands, or HTML.
- Log prompt tokens and cost per request — surprises happen fast.

## OpenAI-Compatible Streaming (Node.js)
```typescript
import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const stream = client.beta.chat.completions.stream({
  model: "gpt-4o",
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ],
  max_tokens: 2048,
});

for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta?.content ?? "";
  process.stdout.write(delta);   // or send SSE
}

const finalMsg = await stream.finalMessage();
console.log("Total tokens:", finalMsg.usage?.total_tokens);
```

## Rate Limit Retry Pattern
```typescript
async function callWithRetry(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (err?.status === 429 && attempt < maxRetries - 1) {
        const wait = Math.pow(2, attempt) * 2000;   // 2s, 4s, 8s
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}
```

## Context Window Management
- Count tokens before sending: ~4 chars ≈ 1 token (rough estimate).
- Prioritize: system prompt → recent messages → truncate oldest history first.
- Compress history: summarize old messages into a shorter "context so far" block.
- Use streaming for responses > 1000 tokens — avoids timeout on long generations.

## Prompt Engineering Rules
- Be specific: "List 5 bullet points" beats "summarize".
- Role prompts work: "You are an expert Linux sysadmin" improves quality.
- Examples in prompt (few-shot) dramatically improve structured output.
- For JSON output: specify exact schema, add `Respond with ONLY valid JSON`.
- Temperature: 0.1–0.3 for factual/structured; 0.7–0.9 for creative.

## Security (LLM Apps — OWASP Top 10)
- Prompt injection: never trust model output to form SQL/shell commands.
- Excessive agency: confirm destructive tool calls before executing.
- Data leakage: don't put cross-user data in shared context windows.
- Rate limits: auth all endpoints, limit requests per user per minute.
