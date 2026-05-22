import "server-only";

import { authenticator } from "otplib";

const ISSUER = "Net Worth Tracker";

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function getTotpProvisioningUri(params: {
  email: string;
  secret: string;
}): string {
  return authenticator.keyuri(params.email, ISSUER, params.secret);
}

export function verifyTotpToken(params: {
  secret: string;
  token: string;
}): boolean {
  return authenticator.check(params.token, params.secret);
}
