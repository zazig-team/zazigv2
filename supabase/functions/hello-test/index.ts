Deno.serve((_req: Request): Response => {
  return new Response(JSON.stringify({ message: "hello from zazig pipeline" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
