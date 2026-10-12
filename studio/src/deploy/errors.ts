/** A deploy problem with a message meant for the user. */
export class DeployError extends Error {}

/** Turns a network failure into a message that says which service couldn't be reached. */
export async function reach(service: string, call: () => Promise<Response>): Promise<Response> {
  try {
    return await call();
  } catch (err) {
    const timeout = (err as Error).name === 'TimeoutError';
    throw new DeployError(timeout ? `${service} took too long to answer. Try again in a moment.` : `Couldn’t reach ${service}. Check the connection and try again.`);
  }
}
