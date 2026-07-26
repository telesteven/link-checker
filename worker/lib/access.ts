import type { Context } from "hono";
import { jwtVerify, createRemoteJWKSet } from "jose";
import type { Env } from "../types";

/**
 * Resolve the authenticated user's email.
 *
 * In production, Cloudflare Access sits in front of this Worker and injects
 * `Cf-Access-Authenticated-User-Email`. For defense-in-depth, verify the
 * `Cf-Access-Jwt-Assertion` JWT against the team's JWKS when
 * ACCESS_TEAM_DOMAIN + ACCESS_AUD are configured.
 */
export async function requireUser(c: Context<{ Bindings: Env }>): Promise<string | null> {
  const headerEmail = c.req.header("Cf-Access-Authenticated-User-Email");
  const jwt = c.req.header("Cf-Access-Jwt-Assertion");

  if (headerEmail && c.env.ACCESS_TEAM_DOMAIN && c.env.ACCESS_AUD) {
    if (!jwt) return null;
    const valid = await verifyAccessJwt(jwt, c.env.ACCESS_TEAM_DOMAIN, c.env.ACCESS_AUD);
    if (!valid) return null;
    return headerEmail;
  }

  if (headerEmail) {
    // Access headers present but JWT verification env vars not configured yet.
    return headerEmail;
  }

  return null;
}

async function verifyAccessJwt(jwt: string, teamDomain: string, aud: string): Promise<boolean> {
  try {
    const jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    await jwtVerify(jwt, jwks, { audience: aud });
    return true;
  } catch {
    return false;
  }
}
