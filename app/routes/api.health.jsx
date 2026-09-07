export const loader = async () => {
  return new Response(
    JSON.stringify({
      status: "ok",
      app: "ns-rental-manager",
      commit: process.env.RENDER_GIT_COMMIT || "local",
      branch: process.env.RENDER_GIT_BRANCH || "local",
      renderServiceId: process.env.RENDER_SERVICE_ID || "local",
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
