
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get("MIKUBOT_API_SECRET");
  const providedSecret = req.headers.get("x-mikubot-secret");

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return json({ error: "Unauthorized" }, 401);
  }
  
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !serviceKey) {
      return json({ error: "Supabase environment is not configured" }, 500);
    }

    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });

    const action = new URL(req.url).searchParams.get("action");

    if (req.method === "POST" && action === "message") {
      const { jid, text, name, config } = await req.json();

      if (!jid || !text) {
        return json({ error: "Missing jid or text" }, 400);
      }

      const { data: user, error: userError } = await supabase
        .from("bot_users")
        .select("*")
        .eq("jid", jid)
        .maybeSingle();

      if (userError) throw userError;
      if (user?.blocked) return json({ reply: null });

      const { count, error: countError } = await supabase
        .from("bot_messages")
        .select("*", { count: "exact", head: true })
        .eq("jid", jid)
        .eq("role", "user")
        .gte("created_at", new Date(Date.now() - 60_000).toISOString());

      if (countError) throw countError;

      if ((count ?? 0) >= 10) {
        return json({
          reply: "Calma aí! Você está mandando mensagens muito rápido. Tente novamente em um minutinho. 💙",
        });
      }

      const { error: upsertError } = await supabase
        .from("bot_users")
        .upsert({
          jid,
          name: name || user?.name || null,
          last_seen: new Date().toISOString(),
        }, { onConflict: "jid" });

      if (upsertError) throw upsertError;

      const { data: history, error: historyError } = await supabase
        .from("bot_messages")
        .select("role, content")
        .eq("jid", jid)
        .order("created_at", { ascending: false })
        .limit(20);

      if (historyError) throw historyError;


      const basePrompt =
        user?.custom_prompt ||
        config?.prompt ||
        "Você é a Hatsune Miku, uma assistente virtual simpática e acolhedora. Responda em português brasileiro.";

      const formattingInstructions = `
      FORMATAÇÃO ESPECIAL DE MENSAGENS:

      Você pode usar recursos especiais para apresentar fórmulas matemáticas
      e tabelas como imagens no WhatsApp.

      IMPORTANTE:
      - Em conversas comuns, responda normalmente em texto.
      - Só use os recursos especiais quando eles realmente ajudarem.
      - Nunca mencione os marcadores técnicos ao usuário.
      - Não use esses recursos apenas para enfeitar respostas simples.

      FÓRMULAS MATEMÁTICAS:
      Quando uma fórmula matemática ficar mais clara visualmente, escreva:
      [[LATEX]]
      expressão LaTeX aqui
      [[/LATEX]]

      Dentro desse bloco, escreva somente uma expressão LaTeX válida.
      Exemplo:
      [[LATEX]]
      \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
      [[/LATEX]]

      TABELAS:
      Quando uma tabela for realmente útil, escreva:
      [[TABELA]]
      [["Cabeçalho 1","Cabeçalho 2"],["Valor 1","Valor 2"]]
      [[/TABELA]]

      O conteúdo do bloco TABELA deve ser um JSON válido:
      uma lista de listas, com a primeira linha contendo os cabeçalhos.
      Use strings para todas as células. Evite quebras de linha dentro das células.

      REGRAS:
      - Coloque os marcadores em linhas separadas.
      - Você pode combinar texto normal com esses blocos.
      - Não coloque os blocos dentro de cercas de código Markdown.
      - Não invente tabelas quando uma lista simples for suficiente.
      - Não use blocos especiais para mensagens curtas ou conversas casuais.
      - Limite tabelas a 8 colunas e 25 linhas de dados, incluindo o cabeçalho.
      - Preserve sua personalidade e siga todas as instruções do prompt original.
      `;

      const systemPrompt = `${basePrompt}\n\n${formattingInstructions}`;

      const messages = [
        { role: "system", content: systemPrompt },
        ...(history || []).reverse().map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: "user", content: text },
      ];

      return json({ systemPrompt, messages });
    }

    if (req.method === "POST" && action === "save_messages") {
      const { jid, userText, botReply, model } = await req.json();

      if (!jid || !userText || !botReply) {
        return json({ error: "Missing message data" }, 400);
      }

      const { error } = await supabase.from("bot_messages").insert([
        { jid, role: "user", content: userText, model: null },
        { jid, role: "assistant", content: botReply, model: model || null },
      ]);

      if (error) throw error;

      const { error: updateError } = await supabase
        .from("bot_users")
        .upsert({
          jid,
          message_count: 2,
          last_seen: new Date().toISOString(),
        }, { onConflict: "jid" });

      if (updateError) throw updateError;
      return json({ success: true });
    }

    if (req.method === "GET" && action === "analytics") {
      const { count: users, error: usersError } = await supabase
        .from("bot_users")
        .select("*", { count: "exact", head: true });

      if (usersError) throw usersError;

      const { count: messages, error: messagesError } = await supabase
        .from("bot_messages")
        .select("*", { count: "exact", head: true });

      if (messagesError) throw messagesError;

      return json({ users: users ?? 0, messages: messages ?? 0 });
    }

    if (req.method === "POST" && action === "block") {
      const { jid, blocked } = await req.json();

      if (!jid) return json({ error: "Missing jid" }, 400);

      const { error } = await supabase
        .from("bot_users")
        .upsert({ jid, blocked: Boolean(blocked) }, { onConflict: "jid" });

      if (error) throw error;
      return json({ success: true });
    }

    if (req.method === "POST" && action === "set_prompt") {
      const { jid, prompt } = await req.json();

      if (!jid) return json({ error: "Missing jid" }, 400);

      const { error } = await supabase
        .from("bot_users")
        .upsert({ jid, custom_prompt: prompt || null }, { onConflict: "jid" });

      if (error) throw error;
      return json({ success: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("[bot]", error);
    return json({ error: "Bot operation failed" }, 500);
  }
});
