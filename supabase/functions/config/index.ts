
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

    if (req.method === "GET" && action === "get") {
      const { data, error } = await supabase
        .from("bot_config")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        const { data: created, error: insertError } = await supabase
          .from("bot_config")
          .insert({ id: 1 })
          .select("*")
          .single();

        if (insertError) throw insertError;
        return json(created);
      }

      return json(data);
    }

    if (req.method === "POST" && action === "phone") {
      const { phone } = await req.json();

      const { data, error } = await supabase
        .from("bot_config")
        .upsert({ id: 1, phone }, { onConflict: "id" })
        .select("*")
        .single();

      if (error) throw error;
      return json(data);
    }

    if (req.method === "POST" && action === "save") {
      const { prompt, whisperModel, sttEnabled, aiModel } = await req.json();

      const { data, error } = await supabase
        .from("bot_config")
        .upsert({
          id: 1,
          prompt,
          whisper_model: whisperModel,
          stt_enabled: Boolean(sttEnabled),
          ai_model: aiModel,
        }, { onConflict: "id" })
        .select("*")
        .single();

      if (error) throw error;
      return json(data);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("[config]", error);
    return json({ error: "Config operation failed" }, 500);
  }
});
