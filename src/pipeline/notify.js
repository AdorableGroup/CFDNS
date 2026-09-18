/**
 * Sends a message to a Discord-compatible webhook, if DISCORD_WEBHOOK_URL is set.
 * Never throws — a failed notification shouldn't crash the sync run.
 * @param {string} msg
 */
export const notify = async (msg) => {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url || !url.startsWith("http")) return;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `CGPS: ${msg}` }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    console.error("Failed to send webhook notification:", error);
  }
};
