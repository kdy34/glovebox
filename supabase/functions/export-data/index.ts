// Stub — implemented in Phase 4 (T043)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve((_req) => {
  return new Response(JSON.stringify({ error: "not_implemented" }), {
    status: 501,
    headers: { "Content-Type": "application/json" },
  });
});
