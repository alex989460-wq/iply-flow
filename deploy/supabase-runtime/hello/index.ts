Deno.serve(async () => {
  return new Response(
    JSON.stringify({ message: "Hello from Edge Functions!" }),
    { headers: { "Content-Type": "application/json" } },
  )
})
