// Exécuté une fois au démarrage du serveur Next (dev comme production).
// Le code Node est isolé dans un fichier à part : Next compile aussi ce fichier pour le runtime
// « edge », qui ne connaît pas les modules Node (node:crypto, node:path…).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { prepareDatabase } = await import("./instrumentation-node");
    await prepareDatabase();
  }
}
