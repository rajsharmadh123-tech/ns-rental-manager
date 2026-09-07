export const loader = async () => {
  return new Response(
    JSON.stringify({
      status: "ok",
      app: "ns-rental-manager",
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
};
